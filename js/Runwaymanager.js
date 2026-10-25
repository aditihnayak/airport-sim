/* runwayManager.js - runway state and allocation (Milestone 3).
 * Life cycle of one runway:
 *    AVAILABLE --reserve--> RESERVED --occupy--> OCCUPIED --release--> AVAILABLE
 * A runway has at most ONE holder, so two aircraft can never share it.      */

class Runway {
  constructor(c) {
    Object.assign(this, c);          // id, name, x, y, length, width, direction
    this.status = 'AVAILABLE';
    this.holder = null;              // aircraft that owns the runway
    this.operation = null;           // 'LANDING' or 'TAKEOFF'
    this.lastUsed = -Infinity;       // for fair (least recently used) allocation
    this.uses = 0;
  }

  /* Does the aircraft's bounding circle touch the runway rectangle?
   * Inverse transform: move the aircraft into the runway's local frame
   * (undo translate, undo rotate) where the runway is an axis-aligned
   * rectangle, then measure the distance to the nearest point of it. */
  overlaps(ac) {
    const a = -this.direction * Math.PI / 180, dx = ac.x - this.x, dy = ac.y - this.y;
    const lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a);
    const nx = Geo.clamp(lx, -this.length / 2, this.length / 2), ny = Geo.clamp(ly, -this.width / 2, this.width / 2);
    return Math.hypot(lx - nx, ly - ny) < ac.radius;
  }
}

class RunwayManager {
  constructor(configs, logFn) {
    this.runways = configs.map(c => new Runway(c));
    this.queue = [];                 // pending requests {ac, op, time, waited}
    this.time = 0;
    this.log = logFn || (() => {});
    this.waits = 0;                  // requests that had to wait (conflicts avoided)
  }

  update(dt) { this.time += dt; this.process(); }

  // Request a runway. Returns the runway once granted, otherwise null (keep waiting).
  request(ac, op) {
    if (!this.assignmentOf(ac) && !this.queue.some(q => q.ac === ac)) {
      this.queue.push({ ac, op, time: this.time, waited: false });
      this.log(`${ac.id} requests a runway for ${op.toLowerCase()}`);
    }
    this.process();
    return this.assignmentOf(ac);
  }

  assignmentOf(ac) { return this.runways.find(r => r.holder === ac) || null; }

  // Suitable = AVAILABLE and long enough for this aircraft type. Pick the least recently used.
  findAvailable(ac) {
    return this.runways
      .filter(r => r.status === 'AVAILABLE' && r.length >= ac.info.minRunway)
      .sort((a, b) => a.lastUsed - b.lastUsed)[0] || null;
  }

  reserve(rw, ac, op) {
    rw.status = 'RESERVED'; rw.holder = ac; rw.operation = op;
    this.log(`Runway ${rw.name} RESERVED for ${ac.id} (${op.toLowerCase()})`);
  }

  occupy(rw, ac) {
    if (rw.holder !== ac || rw.status !== 'RESERVED') { this.log(`!! ${ac.id} tried to use ${rw.name} without a reservation`); return false; }
    rw.status = 'OCCUPIED';
    this.log(`Runway ${rw.name} OCCUPIED by ${ac.id}`);
    return true;
  }

  release(rw, ac) {
    if (rw.holder !== ac) return false;
    rw.status = 'AVAILABLE'; rw.holder = null; rw.operation = null; rw.lastUsed = this.time; rw.uses++;
    this.log(`Runway ${rw.name} released by ${ac.id}`);
    this.process();
    return true;
  }

  // Serve the queue: arrivals first (they cannot wait forever in the air), then first-come-first-served.
  process() {
    [...this.queue]
      .sort((a, b) => (a.op === 'LANDING' ? 0 : 1) - (b.op === 'LANDING' ? 0 : 1) || a.time - b.time)
      .forEach(q => {
        const rw = this.findAvailable(q.ac);
        if (rw) { this.reserve(rw, q.ac, q.op); this.queue.splice(this.queue.indexOf(q), 1); }
        else if (!q.waited) { q.waited = true; this.waits++; this.log(`${q.ac.id} must wait: no suitable runway free`); }
      });
  }
}