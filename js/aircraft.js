/* aircraft.js - Milestone 2: the Aircraft class and its graphics.
 *
 * Every aircraft is modelled ONCE in a LOCAL coordinate system:
 *   - origin (0,0) = centre of the aircraft
 *   - nose points along +x, length is about 64 units (x from -32 to +32)
 *   - wings extend along +y / -y
 * To place it in the airport we apply a transformation: scale -> rotate -> translate.
 * HEADING: degrees, 0 = east, 90 = south, 180 = west, 270 = north
 * (clockwise, because the canvas y axis points down). */

const AIRCRAFT_TYPES = {
  REGIONAL: { label: 'Regional', span: 46, scale: 0.55, body: '#eef4ff', accent: '#2f80ed', minRunway: 400, engines: [0.45] },
  NARROW:   { label: 'Narrow-body', span: 54, scale: 0.70, body: '#ffffff', accent: '#e8590c', minRunway: 450, engines: [0.45] },
  WIDE:     { label: 'Wide-body', span: 50, scale: 0.85, body: '#f4f1e8', accent: '#2f9e44', minRunway: 800, engines: [0.35, 0.7] }
};

class Aircraft {
  constructor(id, type, x, y, heading, state = 'STOPPED') {
    this.id = id;
    this.type = type;
    this.x = x;                 // position (translation)
    this.y = y;
    this.heading = heading;     // rotation in degrees
    this.scale = AIRCRAFT_TYPES[type].scale;   // uniform scaling factor
    this.state = state;         // used by the simulation in later milestones
    this.speed = 0;             // units per second (0 in the Milestone 2 sandbox)
    // --- Milestone 3: movement / simulation fields ---
    this.altitude = 0;          // 0 = on ground, 1 = fully airborne (drives scale + shadow)
    this.kind = null;           // 'ARRIVAL' or 'DEPARTURE'
    this.path = null;           // Path being followed
    this.s = 0;                 // distance travelled along the path
    this.rwy = null;            // runway assigned by the RunwayManager
    this.stand = null;          // gate assigned to this aircraft
    this.seq = 0;               // creation order (used for right-of-way)
  }

  get length() { return 66 * this.scale; }      // nose-to-tail size in world units
  get radius() { return 33 * this.scale; }      // bounding-circle radius

  get info() { return AIRCRAFT_TYPES[this.type]; }

  /* Draw the aircraft: a shadow first, then the body.
   * The shadow is the SAME shape drawn again with a small translation,
   * so one model gives two objects through two transformations. */
  draw(ctx, opts) {
    // Altitude changes the SCALE (closer to the camera = bigger) and moves the
    // shadow further away from the aircraft.
    const k = this.scale * (1 + 0.6 * this.altitude);
    const sh = this.altitude;
    Draw.withTransform(ctx, this.x + 3 + 30 * sh, this.y + 4 + 36 * sh, this.heading, k, k,
      () => this.drawShape(ctx, `rgba(0,0,0,${0.28 - 0.12 * sh})`));

    Draw.withTransform(ctx, this.x, this.y, this.heading, k, k, () => {
      this.drawShape(ctx, null);
      if (opts.bounds || this.selected) this.drawBounds(ctx);
    });

    if (opts.ids) this.drawLabel(ctx);
  }

  // The aircraft model, in local coordinates. 'flat' = single colour (shadow).
  drawShape(ctx, flat) {
    const t = this.info, hs = t.span / 2;
    const ink = '#3b4654';
    const body = flat || t.body, wing = flat || '#cdd6e3', accent = flat || t.accent;
    const line = flat ? null : ink;
    ctx.lineJoin = 'round';

    // Wings and tailplane are drawn for +y, then REFLECTED to -y using
    // scale(1, -1). A scale with a negative factor is a mirror image.
    const half = () => {
      Draw.polygon(ctx, [[8, 3.5], [-6, hs], [-14, hs], [-6, 3.5]], wing, line, 0.8);              // wing
      Draw.polygon(ctx, [[-24, 2], [-29, hs * 0.3], [-34, hs * 0.3], [-31, 2]], wing, line, 0.8);   // tailplane
      t.engines.forEach(f => {                                                                      // engines
        const ey = 3.5 + (hs - 3.5) * f, ex = 8 - 14 * f;
        Draw.rect(ctx, ex - 7, ey - 2, 10, 4, flat || '#7d8896');
      });
    };
    half();
    Draw.withTransform(ctx, 0, 0, 0, 1, -1, half);

    // Fuselage: straight sides plus curved nose (quadratic curves).
    ctx.beginPath();
    ctx.moveTo(-32, -1.5); ctx.lineTo(-18, -4); ctx.lineTo(18, -4);
    ctx.quadraticCurveTo(32, -3, 33, 0);
    ctx.quadraticCurveTo(32, 3, 18, 4);
    ctx.lineTo(-18, 4); ctx.lineTo(-32, 1.5); ctx.closePath();
    ctx.fillStyle = body; ctx.fill();
    if (line) { ctx.strokeStyle = line; ctx.lineWidth = 0.8; ctx.stroke(); }

    Draw.polygon(ctx, [[-22, -3.4], [-32, -1.5], [-32, 1.5], [-22, 3.4]], accent);               // tail livery
    if (!flat) Draw.polygon(ctx, [[22, -2.4], [27, -1.6], [27, 1.6], [22, 2.4]], '#2b3a4a');      // cockpit
  }

  // Oriented bounding box (a rectangle in local space, so it rotates with the aircraft).
  drawBounds(ctx) {
    ctx.lineWidth = this.selected ? 1.6 : 1;
    ctx.setLineDash([3, 2]);
    Draw.rect(ctx, -34, -this.info.span / 2 - 1, 68, this.info.span + 2, null, this.selected ? '#ffd43b' : '#ff6b6b');
    ctx.setLineDash([]);
  }

  // The ID is drawn in WORLD space (not rotated) so the text always stays readable.
  drawLabel(ctx) {
    const r = Math.max(34, this.info.span / 2) * this.scale + 10;
    const w = this.id.length * 7 + 10, y = this.y - r;
    Draw.rect(ctx, this.x - w / 2, y - 8, w, 16, this.selected ? '#ffd43b' : 'rgba(15,20,26,0.8)');
    Draw.text(ctx, this.id, this.x, y, { size: 11, bold: true, color: this.selected ? '#111' : '#fff' });
  }

  /* HIT TEST using the INVERSE transformation.
   * Instead of rotating the aircraft to the mouse, we move the mouse point
   * into the aircraft's local space: undo translate, undo rotate, undo scale.
   * Then a simple axis-aligned rectangle test is enough. */
  contains(px, py) {
    const a = -this.heading * Math.PI / 180;
    const dx = px - this.x, dy = py - this.y;
    const lx = (dx * Math.cos(a) - dy * Math.sin(a)) / this.scale;
    const ly = (dx * Math.sin(a) + dy * Math.cos(a)) / this.scale;
    return Math.abs(lx) <= 34 && Math.abs(ly) <= Math.max(this.info.span / 2, 6);
  }
}

// Initial demo fleet: different types, positions and orientations (all stationary).
function createFleet() {
  return [
    new Aircraft('AI101', 'NARROW',   300,  485, 90,  'PARKED'),
    new Aircraft('6E214', 'REGIONAL', 540,  485, 90,  'PARKED'),
    new Aircraft('EK507', 'WIDE',     780,  485, 90,  'PARKED'),
    new Aircraft('UK833', 'NARROW',   330,  150, 0,   'HOLDING'),
    new Aircraft('LH764', 'WIDE',     150,  205, 0,   'LINED UP'),
    new Aircraft('AI302', 'REGIONAL', 1100, 120, 90,  'LINED UP'),
    new Aircraft('BA118', 'NARROW',   720,  290, 180, 'STOPPED'),
    new Aircraft('QR572', 'NARROW',   500,  345, 45,  'STOPPED')   // 45 degree test aircraft
  ];
}