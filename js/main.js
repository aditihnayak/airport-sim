/* main.js - canvas setup, UI wiring, selection and dragging. */

const canvas = document.getElementById('scene');
const ctx = canvas.getContext('2d');
const opts = { grid: false, zones: true, labels: true, ids: true, bounds: false };

let fleet = createFleet();
let selected = null;
let drag = null;               // { dx, dy } offset between mouse and aircraft centre
let counter = 1;

const $ = id => document.getElementById(id);

/* High-DPI: the bitmap is larger than its CSS size. One scale matrix maps
 * our 1200x720 world units to device pixels (setTransform(a,b,c,d,e,f)). */
function resize() {
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth;
  const s = (cssW * dpr) / CFG.W;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssW * dpr * CFG.H / CFG.W);
  ctx.setTransform(s, 0, 0, s, 0, 0);
  render();
}

function render() {
  ctx.clearRect(0, 0, CFG.W, CFG.H);
  drawAirport(ctx, opts);                       // layer 1: static scene (Milestone 1)
  fleet.forEach(a => a.draw(ctx, opts));        // layer 2: aircraft on top
}

// Screen (CSS pixel) position -> world coordinates (inverse of the draw scale).
function toWorld(e) {
  const r = canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left) * CFG.W / r.width, y: (e.clientY - r.top) * CFG.H / r.height };
}

function pick(x, y) {                           // top-most aircraft under the point
  for (let i = fleet.length - 1; i >= 0; i--) if (fleet[i].contains(x, y)) return fleet[i];
  return null;
}

function select(a) {
  if (selected) selected.selected = false;
  selected = a;
  if (a) { a.selected = true; fleet.splice(fleet.indexOf(a), 1); fleet.push(a); }  // bring to front
  updateUI(); render();
}

/* ---- UI ---- */
function updateUI() {
  $('selId').textContent = selected ? selected.id : 'none';
  $('selControls').hidden = !selected;
  if (selected) {
    $('hdg').value = Math.round(selected.heading) % 360;
    $('scl').value = selected.scale;
    $('hdgVal').textContent = Math.round(selected.heading) % 360 + '\u00B0';
    $('sclVal').textContent = selected.scale.toFixed(2) + 'x';
    $('selPos').textContent = `x: ${Math.round(selected.x)}  y: ${Math.round(selected.y)}`;
  }
  $('fleet').innerHTML = fleet.map(a =>
    `<tr data-id="${a.id}" class="${a === selected ? 'sel' : ''}"><td><b>${a.id}</b></td>` +
    `<td>${a.info.label}</td><td>${a.state}</td></tr>`).join('');
}

$('fleet').addEventListener('click', e => {
  const row = e.target.closest('tr');
  if (row) select(fleet.find(a => a.id === row.dataset.id));
});

$('hdg').addEventListener('input', e => { selected.heading = +e.target.value; updateUI(); render(); });
$('scl').addEventListener('input', e => { selected.scale = +e.target.value; updateUI(); render(); });

$('btnAdd').addEventListener('click', () => {
  const codes = ['AI', '6E', 'UK', 'EK', 'LH', 'QR'];
  const id = codes[counter % codes.length] + (900 + counter++);
  const a = new Aircraft(id, $('newType').value, 600 + (counter % 5) * 30, 345, 0, 'STOPPED');
  fleet.push(a);
  select(a);
});
$('btnDelete').addEventListener('click', () => {
  fleet.splice(fleet.indexOf(selected), 1); selected = null; updateUI(); render();
});
$('btnReset').addEventListener('click', () => { fleet = createFleet(); selected = null; updateUI(); render(); });

[['optIds', 'ids'], ['optBounds', 'bounds'], ['optGrid', 'grid'], ['optZones', 'zones'], ['optLabels', 'labels']]
  .forEach(([id, key]) => {
    $(id).checked = opts[key];
    $(id).addEventListener('change', () => { opts[key] = $(id).checked; render(); });
  });

/* ---- Mouse: select + drag (dragging = changing the translation) ---- */
canvas.addEventListener('mousedown', e => {
  const p = toWorld(e), a = pick(p.x, p.y);
  select(a);
  if (a) { drag = { dx: p.x - a.x, dy: p.y - a.y }; canvas.className = 'drag'; }
});
window.addEventListener('mouseup', () => { drag = null; canvas.className = ''; });
canvas.addEventListener('mousemove', e => {
  const p = toWorld(e);
  $('mx').textContent = Math.round(p.x); $('my').textContent = Math.round(p.y);
  if (drag && selected) {
    selected.x = p.x - drag.dx; selected.y = p.y - drag.dy;
    $('selPos').textContent = `x: ${Math.round(selected.x)}  y: ${Math.round(selected.y)}`;
    render();
  } else {
    canvas.className = pick(p.x, p.y) ? 'hover' : '';
  }
});

window.addEventListener('resize', resize);
updateUI();
resize();