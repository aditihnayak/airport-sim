/* main.js - canvas setup, UI wiring, render call. */

const canvas = document.getElementById('scene');
const ctx = canvas.getContext('2d');
const opts = { grid: false, zones: true, labels: true };

// High-DPI support: the bitmap is bigger than the CSS size, and a scale
// matrix maps our 1200x720 world units onto it.  setTransform(a,b,c,d,e,f)
// sets the matrix [a c e; b d f; 0 0 1] directly.
function resize() {
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth;
  const scale = (cssW * dpr) / CFG.W;           // world units -> device pixels
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssW * dpr * CFG.H / CFG.W);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  render();
}

function render() {
  ctx.clearRect(0, 0, CFG.W, CFG.H);
  drawAirport(ctx, opts);
}

// UI toggles
[['optGrid', 'grid'], ['optZones', 'zones'], ['optLabels', 'labels']].forEach(([id, key]) => {
  const box = document.getElementById(id);
  box.checked = opts[key];
  box.addEventListener('change', () => { opts[key] = box.checked; render(); });
});

// Convert mouse position (screen pixels) to world coordinates.
// This is the inverse of the scale used for drawing.
canvas.addEventListener('mousemove', e => {
  const r = canvas.getBoundingClientRect();
  document.getElementById('mx').textContent = Math.round((e.clientX - r.left) * CFG.W / r.width);
  document.getElementById('my').textContent = Math.round((e.clientY - r.top) * CFG.H / r.height);
});

window.addEventListener('resize', resize);
resize();
