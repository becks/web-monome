'use strict';
const $ = s => document.querySelector(s);
const root = document.documentElement;

const state = {cols: 16, rows: 8, grid: '0'.repeat(128), arc: '0'.repeat(256), gi: 15, ai: 15, gp: 0, ap: 0};
let ws, ready = false, redraw = true, fine = false;

const grid = $('#grid');
const pointers = new Map();     // grid pointerId -> [x, y] held since pointerdown
const cells = new Map();        // 'x:y' -> number of pointers holding that key
const arcPointers = new Map();  // ring pointerId -> {y, remainder}
const arcButtons = new Map();   // button pointerId -> ring number
const rings = [];

const DIM_WHEN_OFFLINE = .18;
const LED_GAMMA = .72;

// ---- Themes ----

const THEME_KEY = 'web-monome-theme';
const THEMES = ['auto', 'light', 'dark', 'amber', 'ocean', 'night'];
const darkQuery = matchMedia('(prefers-color-scheme: dark)');
let themeChoice = 'auto';
let palette = {};

function storage(key, value) {
  try {
    if (value === undefined) return localStorage.getItem(key);
    localStorage.setItem(key, value);
  } catch {}
  return null;
}

function rgb(color) {
  let hex = color.trim().replace('#', '');
  if (hex.length === 3) hex = [...hex].map(c => c + c).join('');
  return [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16) || 0);
}

// Copy the CSS tokens the canvas needs, so themes only live in style.css.
function readPalette() {
  const css = getComputedStyle(root);
  const token = name => css.getPropertyValue('--' + name).trim();
  palette = {
    bg: token('bg'),
    gridBg: token('grid-bg'),
    off: rgb(token('led-off')),
    on: rgb(token('led-on')),
    pressed: token('pressed'),
    arcOuter: token('arc-outer'),
    arcOuterLine: token('arc-outer-line'),
    arcHub: token('arc-hub'),
    arcHubLine: token('arc-hub-line'),
    arcLabel: token('arc-label'),
  };
}

function applyTheme(choice) {
  themeChoice = THEMES.includes(choice) ? choice : 'auto';
  root.dataset.theme = themeChoice === 'auto' ? (darkQuery.matches ? 'dark' : 'light') : themeChoice;
  $('#theme').value = themeChoice;
  readPalette();
  $('meta[name="theme-color"]').content = palette.bg;
  redraw = true;
}

$('#theme').onchange = e => {
  storage(THEME_KEY, e.target.value);
  applyTheme(e.target.value);
};
darkQuery.addEventListener('change', () => {
  if (themeChoice === 'auto') applyTheme('auto');
});

// ---- Connection ----

function send(type, args) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({type, args}));
}

function clearHeld() {
  pointers.clear();
  cells.clear();
  arcPointers.clear();
  arcButtons.clear();
  redraw = true;
}

function releaseAll() {
  clearHeld();
  send('release');
}

function setStatus(text, ok = false) {
  $('#status').textContent = text;
  $('#status').classList.toggle('ready', ok);
}

function onFrame(m) {
  if (state.cols !== m.cols || state.rows !== m.rows) releaseAll();
  Object.assign(state, m);
  redraw = true;
  grid.style.aspectRatio = `${state.cols}/${state.rows}`;
  $('#dimensions').textContent = `128 · ${state.cols} × ${state.rows}`;
  $('#notice').textContent = m.gp !== 1 || m.ap !== 1
    ? 'On Norns: assign web grid and web arc to port 1 in SYSTEM → DEVICES.'
    : '';
}

function connect() {
  ws = new WebSocket(`ws://${location.host}/ws`);
  ws.onopen = () => {
    send('ping');
    setStatus('Waiting for Norns…');
  };
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.type === 'hello') $('#version').textContent = `v${m.version}`;
    if (m.type === 'frame') onFrame(m);
    if (m.type === 'status') {
      ready = m.ready;
      setStatus(ready ? '● Connected' : 'Enable the mod on Norns', ready);
      if (!ready) clearHeld();
      redraw = true;
    }
  };
  ws.onclose = () => {
    ready = false;
    clearHeld();
    setStatus('Disconnected · retrying…');
    setTimeout(connect, 1500);
  };
  ws.onerror = () => setStatus('Connection unavailable');
}

// ---- Drawing ----

function canvasContext(canvas) {
  const r = canvas.getBoundingClientRect(), d = Math.min(devicePixelRatio || 1, 2);
  if (!r.width) return null;
  const w = Math.round(r.width * d), h = Math.round(r.height * d);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  return canvas.getContext('2d');
}

function roundedRect(c, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
}

// Fill and glow for one LED: hex level 0-f, scaled by device intensity, blended off -> on.
function led(level, intensity) {
  const raw = parseInt(level, 16) / 15 * (intensity / 15) * (ready ? 1 : DIM_WHEN_OFFLINE);
  const v = Math.pow(raw, LED_GAMMA);
  const [r, g, b] = palette.off.map((off, i) => Math.round(off + (palette.on[i] - off) * v));
  const [gr, gg, gb] = palette.on;
  return {v, fill: `rgb(${r},${g},${b})`, glow: `rgba(${gr},${gg},${gb},${.08 + v * .6})`};
}

function drawGrid() {
  const c = canvasContext(grid);
  if (!c) return;
  const w = grid.width / state.cols, h = grid.height / state.rows;
  const gap = Math.max(3, w * .12), radius = Math.min(w - gap, h - gap) * .13;
  c.fillStyle = palette.gridBg;
  c.fillRect(0, 0, grid.width, grid.height);
  for (let y = 0; y < state.rows; y++) {
    for (let x = 0; x < state.cols; x++) {
      const {v, fill, glow} = led(state.grid[y * state.cols + x], state.gi);
      c.beginPath();
      roundedRect(c, x * w + gap / 2, y * h + gap / 2, w - gap, h - gap, radius);
      c.fillStyle = fill;
      c.fill();
      if (v > .03) {
        c.strokeStyle = glow;
        c.lineWidth = Math.max(1, w * .025);
        c.stroke();
      }
      if (cells.has(`${x + 1}:${y + 1}`)) {
        c.strokeStyle = palette.pressed;
        c.lineWidth = Math.max(1.5, w * .045);
        c.stroke();
      }
    }
  }
}

function drawRing(canvas, n) {
  const c = canvasContext(canvas);
  if (!c) return;
  const w = canvas.width, h = canvas.height, cx = w / 2, cy = h / 2, rad = Math.min(w, h) * .38;
  const disc = (r, fill, line) => {
    c.beginPath();
    c.arc(cx, cy, r, 0, Math.PI * 2);
    c.fillStyle = fill;
    c.fill();
    c.strokeStyle = line;
    c.lineWidth = Math.max(1, w * .008);
    c.stroke();
  };
  c.clearRect(0, 0, w, h);
  disc(rad + w * .08, palette.arcOuter, palette.arcOuterLine);
  for (let i = 0; i < 64; i++) {
    const angle = i / 64 * Math.PI * 2 - Math.PI / 2;
    const {v, fill, glow} = led(state.arc[n * 64 + i], state.ai);
    c.beginPath();
    c.arc(cx + Math.cos(angle) * rad, cy + Math.sin(angle) * rad, Math.max(1.5, w * .011), 0, Math.PI * 2);
    c.fillStyle = fill;
    c.fill();
    if (v > .03) {
      c.strokeStyle = glow;
      c.lineWidth = Math.max(1, w * .007);
      c.stroke();
    }
  }
  disc(rad * .62, palette.arcHub, palette.arcHubLine);
  c.fillStyle = palette.arcLabel;
  c.font = `500 ${w * .13}px ui-monospace,monospace`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(n + 1, cx, cy);
}

function draw() {
  if (redraw) {
    redraw = false;
    drawGrid();
    rings.forEach(drawRing);
  }
  requestAnimationFrame(draw);
}

// ---- Input ----

// A short tick on touch devices that support it (Android); ignored elsewhere.
function haptic(e) {
  if (e.pointerType === 'touch') navigator.vibrate?.(8);
}

function hit(e) {
  const r = grid.getBoundingClientRect();
  const x = Math.floor((e.clientX - r.left) / r.width * state.cols) + 1;
  const y = Math.floor((e.clientY - r.top) / r.height * state.rows) + 1;
  return x >= 1 && x <= state.cols && y >= 1 && y <= state.rows ? [x, y] : null;
}

function press(p) {
  const k = p.join(':'), n = cells.get(k) || 0;
  cells.set(k, n + 1);
  if (!n) send('key', [...p, 1]);
  redraw = true;
}

function unpress(p) {
  if (!p) return;
  const k = p.join(':'), n = cells.get(k) || 0;
  if (n <= 1) {
    cells.delete(k);
    send('key', [...p, 0]);
  } else {
    cells.set(k, n - 1);
  }
  redraw = true;
}

grid.onpointerdown = e => {
  if (!ready || e.button > 0) return;
  e.preventDefault();
  grid.setPointerCapture(e.pointerId);
  const p = hit(e);
  if (p) {
    pointers.set(e.pointerId, p);
    press(p);
    haptic(e);
  }
};

// Hold the original cell until release, like a physical key; moving a finger does not retrigger.
function gridUp(e) {
  unpress(pointers.get(e.pointerId));
  pointers.delete(e.pointerId);
}
grid.onpointerup = grid.onpointercancel = grid.onlostpointercapture = gridUp;

function makeRing(i) {
  const wrap = document.createElement('div');
  wrap.className = 'ring';
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-label', `Arc ${i}: drag vertically or use the scroll wheel`);
  canvas.tabIndex = 0;
  const button = document.createElement('button');
  button.textContent = 'press';
  button.setAttribute('aria-label', `Arc button ${i}`);
  wrap.append(canvas, button);
  $('#arcs').append(wrap);
  rings.push(canvas);

  canvas.onpointerdown = e => {
    if (!ready || e.button > 0) return;
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    arcPointers.set(e.pointerId, {y: e.clientY, remainder: 0});
  };
  canvas.onpointermove = e => {
    const p = arcPointers.get(e.pointerId);
    if (!p) return;
    const value = (p.y - e.clientY) / (fine || e.shiftKey ? 8 : 2) + p.remainder, d = Math.trunc(value);
    p.y = e.clientY;
    p.remainder = value - d;
    if (d) send('delta', [i, Math.max(-127, Math.min(127, d))]);
  };
  canvas.onpointerup = canvas.onpointercancel = canvas.onlostpointercapture = e => arcPointers.delete(e.pointerId);
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    if (ready && e.deltaY) send('delta', [i, e.deltaY < 0 ? 1 : -1]);
  }, {passive: false});
  canvas.onkeydown = e => {
    if (!ready || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    e.preventDefault();
    send('delta', [i, ['ArrowUp', 'ArrowRight'].includes(e.key) ? 1 : -1]);
  };

  const heldBy = () => [...arcButtons.values()].includes(i);
  button.onpointerdown = e => {
    if (!ready || e.button > 0) return;
    e.preventDefault();
    button.setPointerCapture(e.pointerId);
    const held = heldBy();
    arcButtons.set(e.pointerId, i);
    if (!held) {
      send('arc-key', [i, 1]);
      haptic(e);
    }
  };
  button.onpointerup = button.onpointercancel = button.onlostpointercapture = e => {
    if (!arcButtons.has(e.pointerId)) return;
    arcButtons.delete(e.pointerId);
    if (!heldBy()) send('arc-key', [i, 0]);
  };
}
for (let i = 1; i <= 4; i++) makeRing(i);

$('#fine').onclick = e => {
  fine = !fine;
  e.currentTarget.setAttribute('aria-pressed', fine);
};

// ---- Page chrome ----

const VIEW_KEY = 'web-monome-view';
const viewButtons = document.querySelectorAll('nav button');
for (const button of viewButtons) {
  button.onclick = () => {
    releaseAll();
    document.body.dataset.view = button.dataset.view;
    for (const b of viewButtons) b.classList.toggle('active', b === button);
    storage(VIEW_KEY, button.dataset.view);
  };
}
const savedView = storage(VIEW_KEY);
if (['grid', 'arc', 'both'].includes(savedView)) $(`nav button[data-view="${savedView}"]`).click();

$('#fullscreen').onclick = async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (root.requestFullscreen) await root.requestFullscreen();
    else $('#notice').textContent = 'Use “Add to Home Screen” in this browser.';
  } catch {
    $('#notice').textContent = 'Fullscreen is unavailable in this browser.';
  }
};

window.addEventListener('blur', releaseAll);
window.addEventListener('pagehide', releaseAll);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) releaseAll();
});
window.addEventListener('resize', () => redraw = true);
document.addEventListener('contextmenu', e => e.preventDefault());

applyTheme(storage(THEME_KEY) || 'auto');
setInterval(() => send('ping'), 500);
connect();
draw();
