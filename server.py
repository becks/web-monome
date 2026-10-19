#!/usr/bin/env python3
"""Local HTTP/WebSocket -> loopback OSC. No audio passes through this server."""
import asyncio
import contextlib
import json
import logging
import struct
import time
from pathlib import Path

from aiohttp import web, WSMsgType

PROJECT = Path(__file__).resolve().parent
ROOT = PROJECT / 'web'
VERSION = (PROJECT / 'VERSION').read_text().strip()

HTTP_PORT = 8088
NORNS_PORT = 10111   # norns listens for OSC here; the mod handles /web/*
BRIDGE_PORT = 10112  # the mod sends LED frames back here

FRAME_RATE = 30            # maximum outgoing frames per second
PING_EVERY = 15            # ticks between pings to the mod (0.5 s)
CLIENT_TIMEOUT = 2         # seconds without a browser ping before release
NORNS_TIMEOUT = 2          # seconds without a frame before "not ready"

# Browser messages forwarded to the mod, with their argument counts.
INPUTS = {'key': 3, 'delta': 2, 'arc-key': 2}

# Only these files are served; no-cache makes updates visible after a reload.
STATIC = {
    '/': 'index.html',
    '/app.js': 'app.js',
    '/style.css': 'style.css',
    '/manifest.json': 'manifest.json',
    '/icon.svg': 'icon.svg',
}

log = logging.getLogger('web-monome')


def osc_string(s):
    b = s.encode() + b'\0'
    return b + b'\0' * (-len(b) % 4)


def osc_encode(path, args=()):
    tags = ''.join('i' if isinstance(x, int) else 's' for x in args)
    body = b''.join(struct.pack('>i', x) if isinstance(x, int) else osc_string(x) for x in args)
    return osc_string(path) + osc_string(',' + tags) + body


def osc_decode(data):
    pos = 0

    def string():
        nonlocal pos
        end = data.index(b'\0', pos)
        s = data[pos:end].decode()
        pos = (end + 4) & ~3
        return s

    path, tags = string(), string()
    args = []
    for tag in tags[1:]:
        if tag == 's':
            args.append(string())
        elif tag in 'if':
            args.append(struct.unpack_from('>' + tag, data, pos)[0])
            pos += 4
        else:
            raise ValueError('unsupported OSC type')
    return path, args


class Bridge(asyncio.DatagramProtocol):
    def __init__(self):
        self.transport = None
        self.client = None
        self.frame = None
        self.last_frame = 0
        self.last_client = 0
        self.dirty = False

    def connection_made(self, transport):
        self.transport = transport

    def send(self, path, args=()):
        self.transport.sendto(osc_encode(path, args), ('127.0.0.1', NORNS_PORT))

    def datagram_received(self, data, addr):
        if addr[0] != '127.0.0.1':
            return
        try:
            path, args = osc_decode(data)
            if path != '/web/frame' or len(args) != 8:
                return
            cols, rows, g, a, gi, ai, gp, ap = args
            if cols * rows != 128 or len(g) != 128 or len(a) != 256:
                return
            frame = {'type': 'frame', 'cols': int(cols), 'rows': int(rows), 'grid': g, 'arc': a,
                     'gi': gi, 'ai': ai, 'gp': gp, 'ap': ap}
            self.dirty = self.dirty or frame != self.frame
            self.frame = frame
            self.last_frame = time.monotonic()
        except (ValueError, TypeError, struct.error, UnicodeError):
            pass

    def connected(self):
        return self.client is not None and not self.client.closed

    async def tick(self, ticks):
        now = time.monotonic()
        if self.client is not None and now - self.last_client > CLIENT_TIMEOUT:
            self.send('/web/release')
            await self.client.close(code=1001, message=b'heartbeat timeout')
        if ticks % PING_EVERY == 0:
            self.send('/web/ping')
            if self.connected():
                await self.client.send_json({'type': 'status', 'ready': now - self.last_frame < NORNS_TIMEOUT})
        if self.dirty and self.connected():
            await self.client.send_json(self.frame)
            self.dirty = False

    async def pump(self):
        ticks = 0
        while True:
            # A browser that drops mid-send must not stop pings and frames for everyone after it.
            try:
                await self.tick(ticks)
            except Exception:
                log.exception('pump tick failed')
            ticks += 1
            await asyncio.sleep(1 / FRAME_RATE)


async def websocket(request):
    # A local controller only accepts same-origin browser connections.
    if request.headers.get('Origin') != 'http://' + request.host:
        raise web.HTTPForbidden(text='Open the controller from this Norns address.')
    b = request.app['bridge']
    if b.connected():
        raise web.HTTPConflict(text='Another controller is connected.')
    ws = web.WebSocketResponse(max_msg_size=2048, heartbeat=10)
    await ws.prepare(request)
    b.client = ws
    b.last_client = time.monotonic()
    b.send('/web/release')
    b.send('/web/ping')
    await ws.send_json({'type': 'hello', 'version': VERSION})
    if b.frame:
        await ws.send_json(b.frame)
    try:
        async for msg in ws:
            if msg.type != WSMsgType.TEXT:
                continue
            try:
                m = json.loads(msg.data)
                t = m.get('type')
                args = m.get('args', [])
                if t == 'ping':
                    b.last_client = time.monotonic()
                elif t == 'release':
                    b.send('/web/release')
                elif (t in INPUTS and isinstance(args, list) and len(args) == INPUTS[t]
                      and all(type(v) is int and -127 <= v <= 128 for v in args)):
                    b.send('/web/' + t, args)
            except (ValueError, TypeError, AttributeError):
                continue
    finally:
        b.send('/web/release')
        if b.client is ws:
            b.client = None
    return ws


async def static(request):
    return web.FileResponse(ROOT / STATIC[request.path], headers={'Cache-Control': 'no-cache'})


async def lifecycle(app):
    b = Bridge()
    app['bridge'] = b
    transport, _ = await asyncio.get_running_loop().create_datagram_endpoint(
        lambda: b, local_addr=('127.0.0.1', BRIDGE_PORT))
    task = asyncio.create_task(b.pump())
    yield
    task.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await task
    b.send('/web/release')
    transport.close()


def create_app():
    app = web.Application()
    app.cleanup_ctx.append(lifecycle)
    for path in STATIC:
        app.router.add_get(path, static)
    app.router.add_get('/ws', websocket)
    return app


if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO)
    web.run_app(create_app(), host='0.0.0.0', port=HTTP_PORT)
