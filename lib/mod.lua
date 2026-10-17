-- web-monome 0.1.2: virtual devices for the standard norns Grid/Arc API.
local mods = require 'core/mods'
local G = require 'core/grid'
local A = require 'core/arc'
local O = require 'core/osc'
local U = require 'util'
local M = require 'core/metro'
local dest = {'127.0.0.1', 10112}
local gid, aid = 9001, 9002
local held, held_arc = {}, {}
local last_ping = 0
local timer
local function level(v) return math.max(0, math.min(15, math.floor(tonumber(v) or 0))) end
local function blank(n) local t={} for i=1,n do t[i]=0 end return t end
local g={id=gid, serial='web-grid', name='web grid 128', cols=16, rows=8, port=nil, data=blank(128), brightness=15}
local a={id=aid, serial='web-arc', name='web arc 4', port=nil, data=blank(256), brightness=15}
local function hex(t) local out={} for i,v in ipairs(t) do out[i]=string.format('%x',level(v)) end return table.concat(out) end
local function frame()
  O.send(dest,'/web/frame',{g.cols,g.rows,hex(g.data),hex(a.data),g.brightness,a.brightness,g.port or 0,a.port or 0})
end
function g:led(x,y,v,rel)
  x,y=math.floor(x),math.floor(y)
  if x<1 or x>self.cols or y<1 or y>self.rows then return end
  local i=(y-1)*self.cols+x
  self.data[i]=level((rel and self.data[i] or 0)+v)
end
function a:led(r,x,v,rel)
  r,x=math.floor(r),math.floor(x)
  if r<1 or r>4 or x<1 or x>64 then return end
  local i=(r-1)*64+x
  self.data[i]=level((rel and self.data[i] or 0)+v)
end
local function all(self,v,rel) for i=1,#self.data do self.data[i]=level((rel and self.data[i] or 0)+v) end end
g.all=all; a.all=all
g.refresh=frame; a.refresh=frame
local function intensity(self,v) self.brightness=level(v); frame() end
g.intensity=intensity; a.intensity=intensity
-- Reuse Norns' implementation, which draws through self:led().
a.segment=A.segment
function g:rotation(v)
  self.cols=(v%2==0) and 16 or 8; self.rows=128/self.cols
  self.data=blank(128); G.update_devices(); frame()
end
function g:tilt_enable() end -- no physical tilt sensor
local function release()
  local old=held; held={}
  for _,p in pairs(old) do _norns.grid.key(gid,p[1],p[2],0) end
  local old_arc=held_arc; held_arc={}
  for n in pairs(old_arc) do _norns.arc.key(aid,n,0) end
end
local function attach()
  G.devices[gid]=g; A.devices[aid]=a
  -- Preserve existing assignments; stale physical assignments can be changed in DEVICES.
  for _,pair in ipairs({{G,g},{A,a}}) do
    local module,device=pair[1],pair[2]
    local assigned=false
    for i=1,4 do if module.vports[i].name==device.name then assigned=true end end
    if not assigned then
      for i=1,4 do if module.vports[i].name=='none' then module.vports[i].name=device.name; break end end
    end
    module.update_devices()
  end
end
local original_osc = _norns.osc.event
_norns.osc.event=function(path,args,from)
  if path:sub(1,5)~='/web/' then return original_osc(path,args,from) end
  if not from or (from[1]~='127.0.0.1' and from[1]~='localhost' and from[1]~='::1') then return end
  if path=='/web/ping' then last_ping=U.time(); frame()
  elseif path=='/web/release' then release()
  elseif path=='/web/key' then
    local x,y,z=args[1],args[2],args[3]
    if type(x)~='number' or type(y)~='number' or (z~=0 and z~=1) then return end
    if x<1 or x>g.cols or y<1 or y>g.rows or x%1~=0 or y%1~=0 then return end
    local k=x..':'..y
    if z==1 and not held[k] then held[k]={x,y}; _norns.grid.key(gid,x,y,1)
    elseif z==0 and held[k] then held[k]=nil; _norns.grid.key(gid,x,y,0) end
  elseif path=='/web/delta' then
    local n,d=args[1],args[2]
    if type(n)=='number' and type(d)=='number' and n>=1 and n<=4 and n%1==0 then
      _norns.arc.delta(aid,n,math.max(-127,math.min(127,math.floor(d))))
    end
  elseif path=='/web/arc-key' then
    local n,z=args[1],args[2]
    if type(n)=='number' and n>=1 and n<=4 and n%1==0 and (z==0 or z==1) then
      if z==1 and not held_arc[n] then held_arc[n]=true; _norns.arc.key(aid,n,1)
      elseif z==0 and held_arc[n] then held_arc[n]=nil; _norns.arc.key(aid,n,0) end
    end
  end
end
mods.hook.register('system_post_startup','web-monome devices',attach)
mods.hook.register('script_post_cleanup','web-monome reset holds',function() held={}; held_arc={} end)
mods.hook.register('script_pre_init','web-monome prepare',function()
  held={}; held_arc={}; attach()
end)
mods.hook.register('script_post_init','web-monome watchdog',function()
  timer=M.init(function() if U.time()-last_ping>2 then release() end end,0.5,-1)
  if timer then timer:start() end
  if G.add then G.add(g) end
  if A.add then A.add(a) end
  frame()
end)
return {grid=g,arc=a,release=release}
