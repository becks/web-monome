#!/usr/bin/env python3
"""Local HTTP/WebSocket -> loopback OSC. No audio passes through this server."""
import asyncio
import contextlib
import json
import struct
import time
from pathlib import Path
from aiohttp import web, WSMsgType

ROOT = Path(__file__).resolve().parent / 'web'

def osc_string(s):
    b = s.encode() + b'\0'
    return b + b'\0' * (-len(b) % 4)

def osc_encode(path, args=()):
    return osc_string(path) + osc_string(',' + ''.join('i' if isinstance(x, int) else 's' for x in args)) + b''.join(struct.pack('>i', x) if isinstance(x, int) else osc_string(x) for x in args)

def osc_decode(data):
    pos = 0
    def string():
        nonlocal pos
        end = data.index(b'\0', pos)
        s = data[pos:end].decode()
        pos = (end + 4) & ~3
        return s
    path, tags = string(), string()
    args=[]
    for tag in tags[1:]:
        if tag == 's': args.append(string())
        elif tag in 'if':
            args.append(struct.unpack_from('>' + tag, data, pos)[0]); pos += 4
        else: raise ValueError('unsupported OSC type')
    return path, args

class Bridge(asyncio.DatagramProtocol):
    def __init__(self):
        self.transport=None; self.client=None; self.frame=None
        self.last_frame=0; self.last_client=0; self.dirty=False
    def connection_made(self, transport): self.transport=transport
    def send(self,path,args=()): self.transport.sendto(osc_encode(path,args),('127.0.0.1',10111))
    def datagram_received(self,data,addr):
        if addr[0] != '127.0.0.1': return
        try:
            path,args=osc_decode(data)
            if path=='/web/frame' and len(args)==8:
                cols,rows,g,a,gi,ai,gp,ap=args
                if cols*rows!=128 or len(g)!=128 or len(a)!=256: return
                frame={'type':'frame','cols':int(cols),'rows':int(rows),'grid':g,'arc':a,'gi':gi,'ai':ai,'gp':gp,'ap':ap}
                self.dirty=self.dirty or frame!=self.frame
                self.frame=frame; self.last_frame=time.monotonic()
        except (ValueError,TypeError,struct.error,UnicodeError): pass
    async def pump(self):
        ticks=0
        while True:
            now=time.monotonic()
            if self.client is not None and now-self.last_client>2:
                self.send('/web/release'); await self.client.close(code=1001,message=b'heartbeat timeout')
            if ticks%15==0:
                self.send('/web/ping')
                if self.client is not None and not self.client.closed:
                    await self.client.send_json({'type':'status','ready':now-self.last_frame<2})
            if self.dirty and self.client is not None and not self.client.closed:
                await self.client.send_json(self.frame); self.dirty=False
            ticks+=1
            await asyncio.sleep(1/30)

async def websocket(request):
    # A local controller only accepts same-origin browser connections.
    if request.headers.get('Origin') != 'http://' + request.host:
        raise web.HTTPForbidden(text='Open the controller from this Norns address.')
    b=request.app['bridge']
    if b.client is not None and not b.client.closed: raise web.HTTPConflict(text='Another controller is connected.')
    ws=web.WebSocketResponse(max_msg_size=2048,heartbeat=10)
    await ws.prepare(request)
    b.client=ws; b.last_client=time.monotonic(); b.send('/web/release'); b.send('/web/ping')
    if b.frame: await ws.send_json(b.frame)
    try:
        async for msg in ws:
            if msg.type!=WSMsgType.TEXT: continue
            try:
                m=json.loads(msg.data); t=m.get('type'); args=m.get('args',[])
                if t=='ping': b.last_client=time.monotonic(); continue
                if t=='release': b.send('/web/release'); continue
                lengths={'key':3,'delta':2,'arc-key':2}
                if t not in lengths or not isinstance(args,list) or len(args)!=lengths[t]: continue
                if not all(type(v) is int and -127<=v<=128 for v in args): continue
                b.send('/web/'+t,args)
            except (ValueError,TypeError,AttributeError): continue
    finally:
        b.send('/web/release')
        if b.client is ws: b.client=None
    return ws

async def index(request): return web.FileResponse(ROOT/'index.html')
async def javascript(request): return web.FileResponse(ROOT/'app.js')
async def lifecycle(app):
    b=Bridge(); app['bridge']=b
    transport,_=await asyncio.get_running_loop().create_datagram_endpoint(lambda:b,local_addr=('127.0.0.1',10112))
    task=asyncio.create_task(b.pump())
    yield
    task.cancel()
    with contextlib.suppress(asyncio.CancelledError): await task
    b.send('/web/release'); transport.close()

def create_app():
    app=web.Application(); app.cleanup_ctx.append(lifecycle)
    app.router.add_get('/',index); app.router.add_get('/app.js',javascript); app.router.add_get('/ws',websocket)
    return app

if __name__=='__main__': web.run_app(create_app(),host='0.0.0.0',port=8088)
