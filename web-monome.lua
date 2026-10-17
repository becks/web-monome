-- web-monome diagnostic
-- Grid keys light up while held.
-- Arc turns move a point; push lights a ring.
local g=grid.connect()
local a=arc.connect()
local positions={1,1,1,1}
local function ring(n)
  for x=1,64 do a:led(n,x,x==positions[n] and 15 or 0) end
  a:refresh()
end
function init()
  g:all(0);g:refresh();a:all(0)
  for n=1,4 do ring(n) end
  g.key=function(x,y,z)g:led(x,y,z*15);g:refresh()end
  a.delta=function(n,d)positions[n]=(positions[n]-1+d)%64+1;ring(n)end
  a.key=function(n,z)
    if z==1 then for x=1,64 do a:led(n,x,15)end;a:refresh() else ring(n)end
  end
  redraw()
end
function redraw()
  screen.clear();screen.level(15);screen.move(5,15);screen.text('web monome / test')
  screen.move(5,32);screen.text('Grid: touch to light')
  screen.move(5,44);screen.text('Arc: drag up / down')
  screen.move(5,59);screen.text('norns.local:8088');screen.update()
end
