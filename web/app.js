'use strict';
const $=s=>document.querySelector(s);
const state={cols:16,rows:8,grid:'0'.repeat(128),arc:'0'.repeat(256),gi:15,ai:15,gp:0,ap:0};
let ws,ready=false,redraw=true;
const grid=$('#grid'), pointers=new Map(), cells=new Map(), arcPointers=new Map(), arcButtons=new Map(), rings=[];
function send(type,args){if(ws?.readyState===WebSocket.OPEN)ws.send(JSON.stringify({type,args}));}
function releaseAll(){pointers.clear();cells.clear();arcPointers.clear();arcButtons.clear();send('release');redraw=true;}
function setStatus(text,ok=false){$('#status').textContent=text;$('#status').classList.toggle('ready',ok);}
function connect(){
  ws=new WebSocket(`ws://${location.host}/ws`);
  ws.onopen=()=>{send('ping');setStatus('Waiting for Norns…');};
  ws.onmessage=e=>{
    const m=JSON.parse(e.data);
    if(m.type==='frame'){
      if(state.cols!==m.cols||state.rows!==m.rows)releaseAll();
      Object.assign(state,m);redraw=true;
      grid.style.aspectRatio=`${state.cols}/${state.rows}`;
      $('#dimensions').textContent=`128 · ${state.cols} × ${state.rows}`;
      $('#notice').textContent=(m.gp!==1||m.ap!==1)?'On Norns: assign web grid and web arc to port 1 in SYSTEM → DEVICES.':'';
    }
    if(m.type==='status'){
      ready=m.ready;setStatus(ready?'● Connected':'Enable the mod on Norns',ready);
      if(!ready) {pointers.clear();cells.clear();arcPointers.clear();arcButtons.clear();}
      redraw=true;
    }
  };
  ws.onclose=()=>{ready=false;pointers.clear();cells.clear();arcPointers.clear();arcButtons.clear();redraw=true;setStatus('Disconnected · retrying…');setTimeout(connect,1500);};
  ws.onerror=()=>setStatus('Connection unavailable');
}
function canvasContext(canvas){const r=canvas.getBoundingClientRect(),d=Math.min(devicePixelRatio||1,2);if(!r.width)return null;const w=Math.round(r.width*d),h=Math.round(r.height*d);if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}return canvas.getContext('2d');}
function roundedRect(c,x,y,w,h,r){r=Math.min(r,w/2,h/2);c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);c.arcTo(x+w,y+h,x,y+h,r);c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);}
function draw(){
  if(redraw){
    redraw=false;
    let c=canvasContext(grid);
    if(c){const w=grid.width/state.cols,h=grid.height/state.rows;c.clearRect(0,0,grid.width,grid.height);
      c.fillStyle='#e7e0d0';c.fillRect(0,0,grid.width,grid.height);
      for(let y=0;y<state.rows;y++)for(let x=0;x<state.cols;x++){
        const raw=parseInt(state.grid[y*state.cols+x],16)/15*(state.gi/15)*(ready?1:.18),v=Math.pow(raw,.72),pressed=cells.has(`${x+1}:${y+1}`),gap=Math.max(3,w*.12),px=x*w+gap/2,py=y*h+gap/2,pw=w-gap,ph=h-gap,r=Math.min(pw,ph)*.13;
        c.beginPath();roundedRect(c,px,py,pw,ph,r);
        c.fillStyle=`rgb(${Math.round(245+v*10)},${Math.round(241-v*39)},${Math.round(220-v*153)})`;
        c.fill();
        if(v>.03){c.strokeStyle=`rgba(255,190,36,${.12+v*.55})`;c.lineWidth=Math.max(1,w*.025);c.stroke();}
        if(pressed){c.strokeStyle='#6e4d0e';c.lineWidth=Math.max(1.5,w*.045);c.stroke();}
      }
    }
    rings.forEach((canvas,r)=>{const c=canvasContext(canvas);if(!c)return;const w=canvas.width,h=canvas.height,rad=Math.min(w,h)*.38;c.clearRect(0,0,w,h);
      c.beginPath();c.arc(w/2,h/2,rad+w*.08,0,Math.PI*2);c.fillStyle='#eee7d9';c.fill();c.strokeStyle='#d5cbb9';c.lineWidth=Math.max(1,w*.008);c.stroke();
      for(let i=0;i<64;i++){const angle=i/64*Math.PI*2-Math.PI/2,raw=parseInt(state.arc[r*64+i],16)/15*(state.ai/15)*(ready?1:.18),v=Math.pow(raw,.72);c.beginPath();c.arc(w/2+Math.cos(angle)*rad,h/2+Math.sin(angle)*rad,Math.max(1.5,w*.011),0,Math.PI*2);c.fillStyle=`rgb(${Math.round(245+v*10)},${Math.round(241-v*39)},${Math.round(220-v*153)})`;c.fill();if(v>.03){c.strokeStyle=`rgba(255,184,22,${.15+v*.5})`;c.lineWidth=Math.max(1,w*.007);c.stroke();}}
      c.beginPath();c.arc(w/2,h/2,rad*.62,0,Math.PI*2);c.fillStyle='#faf7ee';c.fill();c.strokeStyle='#ddd3c0';c.lineWidth=Math.max(1,w*.008);c.stroke();
      c.fillStyle='#716958';c.font=`500 ${w*.13}px "DM Mono",monospace`;c.textAlign='center';c.textBaseline='middle';c.fillText(r+1,w/2,h/2);
    });
  }
  requestAnimationFrame(draw);
}
function hit(e){const r=grid.getBoundingClientRect(),x=Math.floor((e.clientX-r.left)/r.width*state.cols)+1,y=Math.floor((e.clientY-r.top)/r.height*state.rows)+1;return x>=1&&x<=state.cols&&y>=1&&y<=state.rows?[x,y]:null;}
function press(p){const k=p.join(':'),n=cells.get(k)||0;cells.set(k,n+1);if(!n)send('key',[...p,1]);redraw=true;}
function unpress(p){if(!p)return;const k=p.join(':'),n=cells.get(k)||0;if(n<=1){cells.delete(k);send('key',[...p,0]);}else cells.set(k,n-1);redraw=true;}
grid.onpointerdown=e=>{if(!ready||e.button>0)return;e.preventDefault();grid.setPointerCapture(e.pointerId);const p=hit(e);if(p){pointers.set(e.pointerId,p);press(p);}};
// Hold the original cell until release, like a physical key; moving a finger does not retrigger.
function gridUp(e){unpress(pointers.get(e.pointerId));pointers.delete(e.pointerId);}
grid.onpointerup=gridUp;grid.onpointercancel=gridUp;grid.onlostpointercapture=gridUp;
for(let i=1;i<=4;i++){
  const wrap=document.createElement('div');wrap.className='ring';
  const canvas=document.createElement('canvas');canvas.setAttribute('aria-label',`Arc ${i}: drag vertically or use the scroll wheel`);canvas.tabIndex=0;
  const button=document.createElement('button');button.textContent='press';button.setAttribute('aria-label',`Arc button ${i}`);
  wrap.append(canvas,button);$('#arcs').append(wrap);rings.push(canvas);
  canvas.onpointerdown=e=>{if(!ready||e.button>0)return;e.preventDefault();canvas.setPointerCapture(e.pointerId);arcPointers.set(e.pointerId,{y:e.clientY,remainder:0});};
  canvas.onpointermove=e=>{const p=arcPointers.get(e.pointerId);if(!p)return;const value=(p.y-e.clientY)/(e.shiftKey?8:2)+p.remainder,d=Math.trunc(value);p.y=e.clientY;p.remainder=value-d;if(d)send('delta',[i,Math.max(-127,Math.min(127,d))]);};
  canvas.onpointerup=canvas.onpointercancel=canvas.onlostpointercapture=e=>arcPointers.delete(e.pointerId);
  canvas.addEventListener('wheel',e=>{e.preventDefault();if(ready&&e.deltaY)send('delta',[i,e.deltaY<0?1:-1]);},{passive:false});
  canvas.onkeydown=e=>{if(ready&&['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();send('delta',[i,['ArrowUp','ArrowRight'].includes(e.key)?1:-1]);}};
  button.onpointerdown=e=>{if(!ready)return;e.preventDefault();button.setPointerCapture(e.pointerId);const held=[...arcButtons.values()].includes(i);arcButtons.set(e.pointerId,i);if(!held)send('arc-key',[i,1]);};
  button.onpointerup=button.onpointercancel=button.onlostpointercapture=e=>{if(arcButtons.has(e.pointerId)){arcButtons.delete(e.pointerId);if(![...arcButtons.values()].includes(i))send('arc-key',[i,0]);}};
}
for(const button of document.querySelectorAll('nav button'))button.onclick=()=>{releaseAll();document.body.dataset.view=button.dataset.view;for(const b of document.querySelectorAll('nav button'))b.classList.toggle('active',b===button);try{localStorage.setItem('web-monome-view',button.dataset.view);}catch{}redraw=true;};
try{const v=localStorage.getItem('web-monome-view');if(['grid','arc','both'].includes(v))document.querySelector(`nav button[data-view="${v}"]`).click();}catch{}
$('#fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();else $('#notice').textContent='Use “Add to Home Screen” in this browser.';}catch{$('#notice').textContent='Fullscreen is unavailable in this browser.';}};
window.addEventListener('blur',releaseAll);window.addEventListener('pagehide',releaseAll);document.addEventListener('visibilitychange',()=>{if(document.hidden)releaseAll();});window.addEventListener('resize',()=>redraw=true);document.addEventListener('contextmenu',e=>e.preventDefault());
setInterval(()=>send('ping'),500);connect();draw();
