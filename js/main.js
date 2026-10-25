/* main.js - canvas, animation loop (requestAnimationFrame) and UI.
 * Two modes: SIM = the Milestone 3 simulation, SANDBOX = the Milestone 2 manual demo. */

const canvas = document.getElementById('scene');
const ctx = canvas.getContext('2d');
const opts = { grid: false, zones: true, labels: true, ids: true, bounds: false };
const $ = id => document.getElementById(id);

let mode = 'SIM';
let sim = new Simulation();
let sandbox = createFleet();
let selected = null, drag = null, counter = 1;
let running = true, speedMult = 1;

const fleet = () => (mode === 'SIM' ? sim.aircraft : sandbox);

/* High-DPI: one scale matrix maps the 1200x720 world onto the device pixels. */
function resize() {
  const dpr = window.devicePixelRatio || 1, cssW = canvas.clientWidth, s = (cssW * dpr) / CFG.W;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssW * dpr * CFG.H / CFG.W);
  ctx.setTransform(s, 0, 0, s, 0, 0);
  render();
}

function render() {
  ctx.clearRect(0, 0, CFG.W, CFG.H);
  drawAirport(ctx, opts);                                   // layer 1: static scene
  if (mode === 'SIM') drawRunwayStatus(ctx, sim.manager);   // layer 2: runway status colours
  // layer 3: aircraft, low ones first so airborne aircraft are drawn on top
  [...fleet()].sort((a, b) => a.altitude - b.altitude).forEach(a => a.draw(ctx, opts));
}

/* ---- Animation loop ----
 * requestAnimationFrame gives a timestamp each frame. dt = time since the last frame (seconds),
 * so movement is  position += speed * dt  and is independent of the monitor's refresh rate. */
let last = performance.now(), uiTimer = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (mode === 'SIM' && running) {
    const total = dt * speedMult, n = Math.max(1, Math.ceil(total / (1 / 40)));   // small sub-steps stay accurate at high speed
    for (let i = 0; i < n; i++) sim.update(total / n);
  }
  render();
  if ((uiTimer -= dt) <= 0) { uiTimer = 0.15; refreshUI(); }
  requestAnimationFrame(frame);
}

/* ---- Mouse helpers ---- */
function toWorld(e) {                                       // screen pixels -> world units (inverse of the draw scale)
  const r = canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left) * CFG.W / r.width, y: (e.clientY - r.top) * CFG.H / r.height };
}
function pick(x, y) {
  const f = fleet();
  for (let i = f.length - 1; i >= 0; i--) if (f[i].contains(x, y)) return f[i];
  return null;
}
function select(a) {
  if (selected) selected.selected = false;
  selected = a; if (a) a.selected = true;
  refreshUI();
}

/* ---- UI refresh ---- */
const mmss = t => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

function refreshUI() {
  if (selected && !fleet().includes(selected)) selected = null;   // aircraft left the airport
  $('selId').textContent = selected ? selected.id : 'none';
  $('selControls').hidden = !(selected && mode === 'SANDBOX');
  $('selInfo').textContent = selected && mode === 'SIM'
    ? `${selected.info.label} | ${selected.state}\nspeed ${selected.speed.toFixed(0)} | altitude ${selected.altitude.toFixed(2)}` +
      `\nrunway ${selected.rwy ? selected.rwy.name : '-'} | gate ${selected.stand ? selected.stand.id : '-'}` : '';
  if (selected && mode === 'SANDBOX') {
    $('hdg').value = Math.round(selected.heading) % 360; $('scl').value = selected.scale;
    $('hdgVal').textContent = Math.round(selected.heading) % 360 + '\u00B0';
    $('sclVal').textContent = selected.scale.toFixed(2) + 'x';
  }
  $('fleet').innerHTML = fleet().map(a =>
    `<tr data-id="${a.id}" class="${a === selected ? 'sel' : ''}"><td><b>${a.id}</b></td>` +
    `<td>${a.info.label}</td><td>${a.state.replace(/_/g, ' ')}</td></tr>`).join('');

  if (mode !== 'SIM') return;
  $('rwyTable').innerHTML = sim.manager.runways.map(r =>
    `<tr><td>${r.name}</td><td><span class="dot ${r.status}"></span>${r.status}</td>` +
    `<td>${r.holder ? r.holder.id + ' ' + r.operation.toLowerCase() : '-'}</td></tr>`).join('');
  const hold = sim.aircraft.filter(a => a.state === 'HOLDING').length;
  $('stats').textContent = `Landed ${sim.stats.landed} | Departed ${sim.stats.departed} | Holding ${hold}\n` +
    `Requests that had to wait: ${sim.manager.waits} | Runway conflicts: ${sim.stats.violations}`;
  $('stats').style.whiteSpace = 'pre-line';
  $('log').innerHTML = sim.events.slice(0, 14).map(e =>
    `<li class="${e.msg.startsWith('!!') ? 'warn' : ''}"><b>${mmss(e.t)}</b>${e.msg}</li>`).join('');
}

function setMode(m) {
  mode = m; select(null);
  $('modeSim').classList.toggle('on', m === 'SIM'); $('modeSb').classList.toggle('on', m === 'SANDBOX');
  $('simUI').hidden = m !== 'SIM'; $('sbUI').hidden = m !== 'SANDBOX';
  refreshUI();
}

/* ---- Controls ---- */
$('modeSim').onclick = () => setMode('SIM');
$('modeSb').onclick = () => setMode('SANDBOX');
$('btnPlay').onclick = () => { running = !running; $('btnPlay').textContent = running ? 'Pause' : 'Resume'; };
$('btnArr').onclick = () => { sim.spawnArrival(); refreshUI(); };
$('btnDep').onclick = () => { sim.spawnDeparture(null, null, 1); refreshUI(); };
$('btnRestart').onclick = () => { sim = new Simulation(); select(null); };
$('optAuto').onchange = e => { sim.autoSpawn = e.target.checked; };
$('spd').oninput = e => { speedMult = +e.target.value; $('spdVal').textContent = speedMult + 'x'; };

[['optIds', 'ids'], ['optBounds', 'bounds'], ['optGrid', 'grid'], ['optZones', 'zones'], ['optLabels', 'labels']]
  .forEach(([id, key]) => { $(id).checked = opts[key]; $(id).onchange = () => { opts[key] = $(id).checked; }; });

$('fleet').onclick = e => { const row = e.target.closest('tr'); if (row) select(fleet().find(a => a.id === row.dataset.id)); };

// Sandbox controls (Milestone 2 behaviour, unchanged)
$('hdg').oninput = e => { if (selected) selected.heading = +e.target.value; };
$('scl').oninput = e => { if (selected) selected.scale = +e.target.value; };
$('btnAdd').onclick = () => {
  const id = AIRLINES[counter % AIRLINES.length] + (900 + counter++);
  const a = new Aircraft(id, $('newType').value, 600 + (counter % 5) * 30, 345, 0, 'STOPPED');
  sandbox.push(a); select(a);
};
$('btnDelete').onclick = () => { sandbox.splice(sandbox.indexOf(selected), 1); select(null); };
$('btnSbReset').onclick = () => { sandbox = createFleet(); select(null); };

canvas.addEventListener('mousedown', e => {
  const p = toWorld(e), a = pick(p.x, p.y);
  select(a);
  if (a && mode === 'SANDBOX') {
    sandbox.splice(sandbox.indexOf(a), 1); sandbox.push(a);          // bring to front
    drag = { dx: p.x - a.x, dy: p.y - a.y }; canvas.className = 'drag';
  }
});
window.addEventListener('mouseup', () => { drag = null; canvas.className = ''; });
canvas.addEventListener('mousemove', e => {
  const p = toWorld(e);
  $('mx').textContent = Math.round(p.x); $('my').textContent = Math.round(p.y);
  if (drag && selected) { selected.x = p.x - drag.dx; selected.y = p.y - drag.dy; }
  else canvas.className = pick(p.x, p.y) ? 'hover' : '';
});

window.addEventListener('resize', resize);
setMode('SIM');
resize();
requestAnimationFrame(frame);