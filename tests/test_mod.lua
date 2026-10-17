-- Run with Lua 5.3+ from project root; CORE_DIR points to downloaded Norns core files.
local core=os.getenv('CORE_DIR') or '/tmp'
local hooks={}
local sent={}
local now=100
local watchers={}
_norns={osc={event=function() end},grid={},arc={}}
package.preload['core/mods']=function()return {hook={register=function(event,name,fn)hooks[event]=fn end}} end
package.preload['vport']=function()return {wrap_method=function(name)return function(self,...)if self.device then return self.device[name](self.device,...)end end end} end
package.preload['tabutil']=function()return {}end
util={round=function(v)return math.floor(v+.5)end,time=function()return now end}
package.preload['util']=function()return util end
package.preload['core/osc']=function()return {send=function(to,path,args)sent[#sent+1]={path,args}end}end
package.preload['core/metro']=function()return {init=function(f)local m={start=function()end};watchers[#watchers+1]=f;return m end}end
package.preload['core/grid']=function()return dofile(core..'/norns-grid.lua')end
package.preload['core/arc']=function()return dofile(core..'/norns-arc.lua')end
grid=require('core/grid');arc=require('core/arc')
local mod=dofile('lib/mod.lua')
hooks.system_post_startup()
local g=require('core/grid').connect();local a=require('core/arc').connect()
assert(grid.devices[9001]==mod.grid and arc.devices[9002]==mod.arc)
assert(g.cols==16 and g.rows==8 and g.device==mod.grid)
assert(a.device==mod.arc)
local keys,deltas={},{}
g.key=function(x,y,z)keys[#keys+1]={x,y,z}end
a.delta=function(n,d)deltas[#deltas+1]={n,d}end
hooks.script_pre_init();hooks.script_post_init()
local function event(path,args)_norns.osc.event('/web/'..path,args,{'127.0.0.1',40000})end
event('ping',{});event('key',{3,4,1});event('key',{3,4,1});event('delta',{2,-5})
assert(#keys==1 and keys[1][3]==1 and deltas[1][2]==-5)
event('release',{});assert(#keys==2 and keys[2][3]==0)
g:all(0);g:led(3,4,10);g:led(3,4,3,true);g:refresh()
assert(mod.grid.data[51]==13)
a:all(0);a:segment(1,0,math.pi,15);a:refresh();assert(mod.arc.data[1]==15 and mod.arc.data[40]==0)
event('key',{1,1,1});now=103;watchers[#watchers]();assert(keys[#keys][3]==0)
-- Simulate script cleanup, preserving devices but dropping callbacks.
require('core/grid').cleanup();require('core/arc').cleanup();hooks.script_pre_init()
assert(require('core/grid').connect().device==mod.grid and g.key==nil)
g:rotation(1);assert(g.cols==8 and g.rows==16)
print('PASS: native Grid/Arc vports, relative LEDs, arc segment, events, release, watchdog, cleanup, rotation')
