/* airport.js - draws the whole scene. Painter's algorithm: items drawn
 * later appear on top, so the order inside drawAirport() matters. */

const C = CFG.COLORS;

function drawAirport(ctx, opts) {
  drawGround(ctx);
  if (opts.zones) drawZones(ctx);
  drawApron(ctx);
  drawTaxiways(ctx);           // under the runways so connectors tuck beneath them
  RUNWAYS.forEach(r => drawRunway(ctx, r));
  drawBuildings(ctx);
  drawStands(ctx);
  if (opts.labels) drawLabels(ctx);
  if (opts.grid) drawGrid(ctx);
}

/* ---- Ground and boundary ---- */
function drawGround(ctx) {
  Draw.rect(ctx, 0, 0, CFG.W, CFG.H, C.outside);
  Draw.polygon(ctx, BOUNDARY, C.grass);

  // Mowing stripes, clipped to the boundary polygon.
  ctx.save();
  ctx.beginPath();
  BOUNDARY.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  ctx.closePath(); ctx.clip();
  for (let y = 20; y < CFG.H; y += 40) Draw.rect(ctx, 0, y, CFG.W, 20, C.grassAlt);
  ctx.restore();

  Draw.polygon(ctx, BOUNDARY, null, C.fence, 3, [10, 6]);   // perimeter fence
}

function drawZones(ctx) {
  ZONES.forEach(z => {
    Draw.rect(ctx, z.x, z.y, z.w, z.h, `rgba(${z.color},0.13)`);
    ctx.setLineDash([6, 5]); ctx.lineWidth = 1.5; ctx.strokeStyle = `rgba(${z.color},0.8)`;
    ctx.strokeRect(z.x, z.y, z.w, z.h); ctx.setLineDash([]);
  });
}

/* ---- Taxiways, apron ---- */
function drawApron(ctx) {
  Draw.rect(ctx, APRON.x, APRON.y, APRON.w, APRON.h, C.apron, C.outline);
}

function drawTaxiways(ctx) {
  TAXIWAYS.forEach(t => Draw.polyline(ctx, t.pts, C.taxiway, t.w));
  TAXIWAYS.forEach(t => Draw.polyline(ctx, t.pts, C.yellow, 1.5, [10, 8]));  // centreline
}

/* ---- Runway ----
 * Everything is drawn in the runway's LOCAL frame: origin at its centre,
 * +x along its length. One withTransform() call (translate + rotate)
 * places the same drawing code at any position and angle, which is how
 * the vertical runway R3 reuses the code of the horizontal runways. */
function drawRunway(ctx, r) {
  Draw.withTransform(ctx, r.cx, r.cy, r.angle, 1, 1, () => {
    const L = r.len, W = r.w, h = L / 2;

    Draw.rect(ctx, -h, -W / 2, L, W, C.runway);                       // surface
    Draw.line(ctx, -h, -W / 2 + 3, h, -W / 2 + 3, C.marking, 1.5);    // edge lines
    Draw.line(ctx, -h,  W / 2 - 3, h,  W / 2 - 3, C.marking, 1.5);
    Draw.line(ctx, -h + 110, 0, h - 110, 0, C.marking, 3, [28, 20]);  // dashed centreline

    [-1, 1].forEach(side => {                 // side -1 = start end, +1 = far end
      const edge = side * h;                  // x of this threshold
      const inward = -side;                   // direction pointing into the runway

      for (let i = 0; i < 8; i++) {           // threshold stripes
        const y = -W / 2 + 6 + i * ((W - 12 - 3) / 7);
        Draw.rect(ctx, inward > 0 ? edge + 8 : edge - 8 - 26, y, 26, 3, C.marking);
      }
      [0.12, 0.17].forEach(f => {             // touchdown-zone bars
        const x = edge + inward * L * f;
        Draw.rect(ctx, x - 11, -13, 22, 3, C.marking);
        Draw.rect(ctx, x - 11,  10, 22, 3, C.marking);
      });
      const ax = edge + inward * L * 0.24;    // aiming-point block
      Draw.rect(ctx, ax - 22, -14, 44, 5, C.marking);
      Draw.rect(ctx, ax - 22,   9, 44, 5, C.marking);

      // Runway number: rotated 90 degrees so it reads upright for a pilot
      // approaching from this end.  (+90 deg at start end, -90 at far end)
      const label = side < 0 ? r.start : r.end;
      Draw.withTransform(ctx, edge + inward * 62, 0, side < 0 ? 90 : -90, 1, 1, () =>
        Draw.text(ctx, label, 0, 0, { size: 19, bold: true, color: C.marking }));
    });
  });
}

/* ---- Buildings ---- */
function drawBuildings(ctx) {
  // Terminal: jet bridges first, then the building polygon on top.
  STANDS.forEach(s => Draw.line(ctx, s.x, 575, s.x, 540, '#7a828c', 8));
  Draw.polygon(ctx, TERMINAL, C.building, C.outline, 2);
  Draw.polygon(ctx, [[285, 612], [310, 590], [770, 590], [795, 612], [795, 655], [285, 655]], C.roof);

  Draw.polygon(ctx, HANGAR, '#c4c9d0', C.outline, 2);          // hangar (5-vertex polygon)
  Draw.line(ctx, 940, 468, 940, 540, '#8e9bab', 2);            // roof ridge

  // Control tower: base square + ring + glass cab (circles).
  Draw.rect(ctx, TOWER.x - 18, TOWER.y - 18, 36, 36, C.building, C.outline);
  Draw.circle(ctx, TOWER.x, TOWER.y, 12, '#8e9bab', C.outline, 2);
  Draw.circle(ctx, TOWER.x, TOWER.y, 5, '#5ab0e6');
}

function drawStands(ctx) {
  STANDS.forEach(s => {
    Draw.rect(ctx, s.x - 34, 440, 68, 100, null, 'rgba(255,255,255,0.55)');
    Draw.line(ctx, s.x - 12, s.y, s.x + 12, s.y, C.yellow, 2);   // stop mark
  });
}

/* ---- Labels and grid ---- */
function drawLabels(ctx) {
  ZONES.forEach(z => Draw.text(ctx, z.name, z.x + 8, z.y + 11,
    { size: 11, bold: true, align: 'left', color: `rgba(${z.color},1)` }));

  Draw.text(ctx, 'AIRPORT BOUNDARY', 62, 34, { size: 11, align: 'left', color: '#e8efe2' });

  RUNWAYS.forEach(r => {
    const y = r.angle ? r.cy + r.len / 2 + 26 : r.cy - r.w / 2 - 8;
    Draw.text(ctx, 'RWY ' + r.name, r.angle ? r.cx : r.cx, y, { size: 12, bold: true });
  });

  TAXIWAYS.filter(t => t.tag).forEach(t => {
    const [x, y] = t.badge;
    Draw.rect(ctx, x - 10, y - 10, 20, 20, '#111', C.yellow);
    Draw.text(ctx, t.tag, x, y, { size: 13, bold: true, color: C.yellow });
  });

  STANDS.forEach(s => Draw.text(ctx, s.id, s.x, 527, { size: 11, bold: true, color: '#20252b' }));
  Draw.text(ctx, 'TERMINAL', 540, 632, { size: 18, bold: true, color: '#33404f' });
  Draw.text(ctx, 'HANGAR', 940, 515, { size: 11, bold: true, color: '#33404f' });
  Draw.text(ctx, 'TOWER', TOWER.x, TOWER.y + 32, { size: 11, bold: true });
}

// Grid every 50 units; major lines and numbers every 100.
function drawGrid(ctx) {
  for (let x = 0; x <= CFG.W; x += 50) {
    const major = x % 100 === 0;
    Draw.line(ctx, x, 0, x, CFG.H, major ? 'rgba(255,255,255,.35)' : 'rgba(255,255,255,.15)', 1);
    if (major) Draw.text(ctx, x, x + 2, 8, { size: 10, align: 'left' });
  }
  for (let y = 0; y <= CFG.H; y += 50) {
    const major = y % 100 === 0;
    Draw.line(ctx, 0, y, CFG.W, y, major ? 'rgba(255,255,255,.35)' : 'rgba(255,255,255,.15)', 1);
    if (major && y) Draw.text(ctx, y, 3, y - 7, { size: 10, align: 'left' });
  }
}
