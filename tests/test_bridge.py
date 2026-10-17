import asyncio
import importlib.util
import sys
import unittest
from pathlib import Path
from aiohttp import ClientSession, web, WSServerHandshakeError
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import server

class Codec(unittest.TestCase):
    def test_roundtrip(self):
        for args in ([1,2,0],[-127,64],['0'*128,'a'*256,16,8]):
            self.assertEqual(server.osc_decode(server.osc_encode('/web/test',args)),('/web/test',args))

class Integration(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.messages=[]
        owner=self
        class Norns(asyncio.DatagramProtocol):
            def connection_made(self,t): self.t=t
            def datagram_received(self,data,addr):
                p,a=server.osc_decode(data);owner.messages.append((p,a))
                if p=='/web/ping':self.t.sendto(server.osc_encode('/web/frame',[16,8,'f'*128,'8'*256,15,15,1,1]),addr)
        self.transport,_=await asyncio.get_running_loop().create_datagram_endpoint(Norns,local_addr=('127.0.0.1',10111))
        self.runner=web.AppRunner(server.create_app());await self.runner.setup()
        site=web.TCPSite(self.runner,'127.0.0.1',0);await site.start()
        self.url='http://127.0.0.1:'+str(site._server.sockets[0].getsockname()[1])
        self.client=ClientSession()
    async def asyncTearDown(self):
        await self.client.close();await self.runner.cleanup();self.transport.close()
    async def test_full_exchange_and_disconnect_release(self):
        async with self.client.get(self.url) as r:self.assertEqual(r.status,200)
        ws=await self.client.ws_connect(self.url+'/ws',origin=self.url)
        frame=await ws.receive_json(timeout=2)
        while frame['type']!='frame': frame=await ws.receive_json(timeout=2)
        self.assertEqual(frame['grid'],'f'*128)
        await ws.send_json({'type':'key','args':[3,4,1]})
        await ws.send_json({'type':'delta','args':[2,-5]})
        await asyncio.sleep(.05)
        self.assertIn(('/web/key',[3,4,1]),self.messages)
        self.assertIn(('/web/delta',[2,-5]),self.messages)
        with self.assertRaises(WSServerHandshakeError):
            await self.client.ws_connect(self.url+'/ws',origin=self.url)
        count=len(self.messages);await ws.close();await asyncio.sleep(.05)
        self.assertIn(('/web/release',[]),self.messages[count:])
    async def test_legacy_falsy_websocket(self):
        from unittest.mock import patch
        # Old aiohttp responses inherit mapping truthiness: an empty one is false.
        with patch.object(web.WebSocketResponse, '__bool__', lambda self: False, create=True):
            ws=await self.client.ws_connect(self.url+'/ws',origin=self.url)
            found=False
            for _ in range(5):
                msg=await ws.receive_json(timeout=2)
                if msg['type']=='status':
                    found=True
                    break
            self.assertTrue(found)
            with self.assertRaises(WSServerHandshakeError):
                await self.client.ws_connect(self.url+'/ws',origin=self.url)
            await ws.close()

    async def test_cross_origin_blocked(self):
        with self.assertRaises(WSServerHandshakeError) as ctx:
            await self.client.ws_connect(self.url+'/ws',origin='http://example.com')
        self.assertEqual(ctx.exception.status,403)
    async def test_heartbeat_releases(self):
        ws=await self.client.ws_connect(self.url+'/ws',origin=self.url)
        await ws.send_json({'type':'key','args':[1,1,1]})
        await asyncio.sleep(.05)
        count=len(self.messages)
        # Expire the browser heartbeat without waiting seconds.
        self.runner.app['bridge'].last_client-=3
        await asyncio.sleep(.1)
        self.assertIn(('/web/release',[]),self.messages[count:])
        await ws.close()

if __name__=='__main__':unittest.main()
