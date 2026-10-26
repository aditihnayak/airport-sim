/* simulation.js - aircraft behaviour (state machine) tied to the RunwayManager.
 *
 * ARRIVAL : HOLDING -> APPROACH -> LANDING_ROLL -> TAXI_TO_GATE -> AT_GATE
 * DEPARTURE: AT_GATE -> WAITING_RUNWAY -> PUSHBACK -> TURNING -> TAXI_TO_RUNWAY
 *            -> HOLD_SHORT -> TAKEOFF_ROLL -> CLIMBING -> DEPARTED
 * The aircraft only moves on when the RunwayManager says so.              */

const SIM = {
  TAXI: 75, TURN_CAP: 30, APPROACH: 130, EXIT_SPEED: 35,
  ACCEL: 28, DECEL: 45, TURN_RATE: 120,
  LIFTOFF: 150, CLIMB: 230, TAKEOFF_ACCEL: 55
};
const GROUND = new Set(['AT_GATE', 'WAITING_RUNWAY', 'PUSHBACK', 'TURNING', 'TAXI_TO_GATE',
  'TAXI_TO_RUNWAY', 'HOLD_SHORT', 'LANDING_ROLL', 'TAKEOFF_ROLL']);
const AIRLINES = ['AI', '6E', 'UK', 'EK', 'LH', 'QR'];

class Simulation {
  constructor() { this.reset(); }

  reset() {
    this.time = 0; this.events = []; this.aircraft = []; this.seq = 0; this.idN = 0; this.slot = 0;
    this.stats = { landed: 0, departed: 0, violations: 0 };
    this.stands = STANDS.map(s => ({ id: s.id, x: s.x, y: s.y, occupant: null }));
    this.manager = new RunwayManager(
      RUNWAYS.map(r => ({ id: r.id, name: r.name, x: r.cx, y: r.cy, length: r.len, width: r.w, direction: r.angle })),
      m => this.log(m));
    // Merge points on taxiway A where several flows meet: only one aircraft may use each at a time.
    this.junctions = ['A1040', 'A950', 'A900', 'A700'].map(n => ({ n, x: NODE[n][0], y: NODE[n][1], r: 32, owner: null, entered: false }));
    this.autoSpawn = true; this.spawnTimer = 9;
    this.spawnDeparture(this.stands[1], 'NARROW', 2);
    this.spawnDeparture(this.stands[3], 'WIDE', 7);
    this.spawnArrival('NARROW');
  }

  log(msg) { this.events.unshift({ t: this.time, msg }); if (this.events.length > 60) this.events.pop(); }

  /* ---------- creating aircraft ---------- */
  makeAircraft(type, kind) {
    const id = AIRLINES[this.idN % AIRLINES.length] + (100 + (this.idN * 37) % 900); this.idN++;
    const ac = new Aircraft(id, type, 0, 0, 0, '');
    ac.kind = kind; ac.seq = ++this.seq; this.aircraft.push(ac);
    return ac;
  }
  freeStand() {
    const free = this.stands.filter(s => !s.occupant);
    return free[Math.floor(Math.random() * free.length)] || null;
  }
  randomType() { const r = Math.random(); return r < 0.25 ? 'REGIONAL' : r < 0.75 ? 'NARROW' : 'WIDE'; }

  spawnArrival(type) {
    const stand = this.freeStand();
    if (!stand) { this.log('Arrival not created: no free stand'); return null; }
    const ac = this.makeAircraft(type || this.randomType(), 'ARRIVAL');
    ac.stand = stand; stand.occupant = ac;
    // Holding pattern: a circle just outside the top-left corner of the airport.
    ac.orbit = { cx: -30, cy: -30, r: 90 + 25 * (this.slot++ % 3), ang: Math.random() * Math.PI * 2 };
    ac.state = 'HOLDING'; ac.speed = SIM.APPROACH; ac.altitude = 1;
    this.orbitPose(ac, 0);
    this.log(`${ac.id} (${ac.info.label}) inbound, gate ${stand.id}`);
    this.manager.request(ac, 'LANDING');
    return ac;
  }

  spawnDeparture(stand, type, delay = 3) {
    stand = stand || this.freeStand();
    if (!stand || stand.occupant) { this.log('Departure not created: no free stand'); return null; }
    const ac = this.makeAircraft(type || this.randomType(), 'DEPARTURE');
    ac.stand = stand; stand.occupant = ac;
    Object.assign(ac, { x: stand.x, y: stand.y, heading: 90, state: 'AT_GATE', timer: delay });
    return ac;
  }

  /* ---------- main update ---------- */
  update(dt) {
    this.time += dt;
    this.manager.update(dt);
    if (this.autoSpawn && (this.spawnTimer -= dt) <= 0) {
      this.spawnTimer = 9 + Math.random() * 7;
      if (this.aircraft.filter(a => a.state === 'HOLDING').length < 3) this.spawnArrival();
    }
    this.updateJunctions();
    this.aircraft.forEach(ac => this.step(ac, dt));
    this.aircraft = this.aircraft.filter(a => a.state !== 'DEPARTED');
    this.checkSafety();
  }

  step(ac, dt) {
    switch (ac.state) {
      case 'HOLDING':        return this.stepHolding(ac, dt);
      case 'APPROACH':       return this.stepApproach(ac, dt);
      case 'LANDING_ROLL':   return this.stepLandingRoll(ac, dt);
      case 'TAXI_TO_GATE':
        if (this.groundMove(ac, dt, true)) {
          ac.state = 'AT_GATE'; ac.timer = 6 + Math.random() * 5; ac.speed = 0;
          this.stats.landed++; this.log(`${ac.id} parked at ${ac.stand.id}`);
        } return;
      case 'AT_GATE':
        if ((ac.timer -= dt) <= 0) {
          ac.kind = 'DEPARTURE'; ac.state = 'WAITING_RUNWAY';
          this.manager.request(ac, 'TAKEOFF');
        } return;
      case 'WAITING_RUNWAY': {
        const rw = this.manager.assignmentOf(ac);
        if (rw && this.laneClear(ac)) this.startPushback(ac, rw);
        return;
      }
      case 'PUSHBACK':       return this.stepPushback(ac, dt);
      case 'TURNING':        return this.stepTurning(ac, dt);
      case 'TAXI_TO_RUNWAY':
        if (this.groundMove(ac, dt, true)) { ac.state = 'HOLD_SHORT'; ac.timer = 0.8; ac.speed = 0;
          this.log(`${ac.id} holding short of runway ${ac.rwy.name}`); }
        return;
      case 'HOLD_SHORT':
        if ((ac.timer -= dt) <= 0) this.startTakeoff(ac);
        return;
      case 'TAKEOFF_ROLL':
      case 'CLIMBING':       return this.stepTakeoff(ac, dt);
    }
  }

  /* ---------- helpers: speed, pose, separation ---------- */
  accelerateTo(ac, target, dt, up = SIM.ACCEL, down = SIM.DECEL) {
    ac.speed = ac.speed < target ? Math.min(target, ac.speed + up * dt) : Math.max(target, ac.speed - down * dt);
  }

  /* Place the aircraft on its path and turn its nose toward the direction of travel.
   * Turning is rate-limited, so heading changes smoothly instead of jumping. */
  pose(ac, dt, reverse = false) {
    const p = ac.path.at(ac.s);
    ac.x = p.x; ac.y = p.y;
    const diff = Geo.angleDiff(p.angle + (reverse ? 180 : 0), ac.heading), max = SIM.TURN_RATE * dt;
    ac.heading = Geo.norm(ac.heading + Geo.clamp(diff, -max, max));
  }

  advance(ac, dt, factor = 1, reverse = false) {
    ac.s = Math.min(ac.path.length, ac.s + ac.speed * dt * factor);
    this.pose(ac, dt, reverse);
  }

  // Taxi along ac.path. Slows for corners, for the end of the path (stop=true) and for traffic ahead.
  groundMove(ac, dt, stop) {
    const p = ac.path, rem = p.length - ac.s;
    let target = Math.min(SIM.TAXI, p.capAhead(ac.s, 55), this.separationLimit(ac), this.junctionLimit(ac));
    if (stop) target = Math.min(target, Math.max(3, Math.sqrt(2 * SIM.DECEL * 0.7 * rem)));
    this.accelerateTo(ac, target, dt, SIM.ACCEL, 70);
    this.advance(ac, dt);
    if (stop && rem < 0.3) { ac.s = p.length; ac.speed = 0; return true; }
    return false;
  }

  /* Ground traffic rule 1 (same lane): look at aircraft in a narrow cone in front (within ~110 units)
   * and keep a gap behind them. Aircraft at gates / pushing back are treated as obstacles too. */
  separationLimit(ac) {
    const a = ac.path.at(ac.s).angle * Math.PI / 180, fx = Math.cos(a), fy = Math.sin(a);
    let limit = Infinity;
    for (const o of this.aircraft) {
      if (o === ac || !GROUND.has(o.state)) continue;
      const dx = o.x - ac.x, dy = o.y - ac.y;
      if (Math.hypot(dx, dy) > 110) continue;
      const fwd = dx * fx + dy * fy, lat = Math.abs(dx * fy - dy * fx);
      if (fwd <= 0) continue;
      const parked = ['AT_GATE', 'WAITING_RUNWAY', 'HOLD_SHORT', 'PUSHBACK', 'TURNING'].includes(o.state);
      const same = parked || Math.abs(Geo.angleDiff(o.heading, ac.heading)) < 35;
      if (!same || lat > (parked ? 46 : 26)) continue;
      const gap = fwd - (ac.length + o.length) / 2 - 10;
      limit = Math.min(limit, Math.max(0, gap) * 1.5);
    }
    return limit;
  }

  /* Ground traffic rule 2 (merge points): each junction is a circular zone that ONE aircraft
   * owns at a time. Others brake to a stop before the zone until the owner has left it. */
  pathEntry(ac, J) {                    // distance along the path until the aircraft enters zone J (null = never soon)
    if (!ac.path) return null;
    if (Math.hypot(ac.x - J.x, ac.y - J.y) < J.r) return 0;
    for (let d = 4; d <= 180 && ac.s + d <= ac.path.length; d += 4) {
      const p = ac.path.at(ac.s + d);
      if (Math.hypot(p.x - J.x, p.y - J.y) < J.r) return d;
    }
    return null;
  }

  updateJunctions() {
    const moving = ['TAXI_TO_GATE', 'TAXI_TO_RUNWAY', 'LANDING_ROLL'];
    this.junctions.forEach(J => {
      const o = J.owner;
      if (o) {
        const d = Math.hypot(o.x - J.x, o.y - J.y);
        if (d < J.r) J.entered = true;
        if (!this.aircraft.includes(o) || !moving.includes(o.state) || (J.entered && d > J.r + 6)) J.owner = null;
      }
      if (!J.owner) {                   // grant to the aircraft that will arrive first
        let best = null, bestD = 80;
        this.aircraft.forEach(ac => {
          if (!moving.includes(ac.state)) return;
          const d = this.pathEntry(ac, J);
          if (d !== null && d < bestD) { best = ac; bestD = d; }
        });
        J.owner = best; J.entered = best !== null && bestD === 0;
      }
    });
  }

  junctionLimit(ac) {
    let limit = Infinity;
    this.junctions.forEach(J => {
      if (J.owner === ac) return;
      const d = this.pathEntry(ac, J);
      if (d === null || d === 0) return;
      const stopD = d - (ac.length / 2 + 10);
      limit = Math.min(limit, stopD <= 0 ? 0 : Math.sqrt(2 * SIM.DECEL * 0.7 * stopD));
    });
    return limit;
  }

  laneClear(ac) {                       // is the taxiway in front of the gate free for pushback?
    return !this.aircraft.some(o => o !== ac && GROUND.has(o.state) && o.state !== 'AT_GATE' &&
      o.state !== 'WAITING_RUNWAY' && Math.hypot(o.x - ac.stand.x, o.y - 400) < 230);
  }

  offscreen(ac) { return ac.x < 0 || ac.y < 0 || ac.x > CFG.W || ac.y > CFG.H; }

  /* ---------- arrival ---------- */
  orbitPose(ac, dt) {
    const o = ac.orbit; o.ang += ac.speed / o.r * dt;
    ac.x = o.cx + o.r * Math.cos(o.ang); ac.y = o.cy + o.r * Math.sin(o.ang);
    ac.heading = Geo.norm(o.ang * 180 / Math.PI + 90);              // tangent of the circle
  }

  stepHolding(ac, dt) {
    this.orbitPose(ac, dt);
    const rw = this.manager.assignmentOf(ac);                       // wait here until a runway is granted
    if (!rw) return;
    const op = RWY_OPS[rw.id];
    ac.rwy = rw;
    // Cubic Bezier from the current position/heading to the start of final approach.
    const bez = Path.bezierPoints([ac.x, ac.y], ac.heading, op.fix, op.landHeading);
    ac.path = new Path([...bez, op.touch]); ac.s = 0;
    ac.touchS = ac.path.length; ac.thresholdS = ac.touchS - Geo.dist(op.threshold, op.touch);
    ac.occupied = false; ac.state = 'APPROACH';
    this.log(`${ac.id} cleared to land on ${rw.name}`);
  }

  stepApproach(ac, dt) {
    this.accelerateTo(ac, SIM.APPROACH, dt, 20, 20);
    this.advance(ac, dt, this.offscreen(ac) ? 2.5 : 1);             // skip quickly while out of sight
    ac.altitude = Geo.clamp((ac.touchS - ac.s) / 450, 0, 1);        // descend: scale shrinks toward touchdown
    if (!ac.occupied && ac.s >= ac.thresholdS) {
      ac.occupied = this.manager.occupy(ac.rwy, ac);                // landing operation begins
    }
    if (ac.s >= ac.touchS - 0.01) this.touchdown(ac);
  }

  touchdown(ac) {
    const op = RWY_OPS[ac.rwy.id], exit = op.exit[ac.type === 'WIDE' ? 'wide' : 'small'];
    const nodes = Network.route(exit, 'S' + ac.stand.x);
    ac.path = Path.fromWaypoints([op.touch, ...Network.points(nodes)], 22, SIM.TURN_CAP); ac.s = 0;
    ac.rollEndS = Geo.dist(op.touch, NODE[exit]);                   // distance to the exit junction
    ac.altitude = 0; ac.state = 'LANDING_ROLL';
    this.log(`${ac.id} touched down on ${ac.rwy.name}`);
  }

  stepLandingRoll(ac, dt) {
    const brakeEnd = ac.rollEndS - 24;                              // where the exit curve starts
    if (ac.s < brakeEnd) {
      // Constant deceleration that reaches exit speed exactly at the exit: v^2 = u^2 - 2 a d
      if (ac.speed > SIM.EXIT_SPEED) {
        const a = Geo.clamp((ac.speed ** 2 - SIM.EXIT_SPEED ** 2) / (2 * Math.max(brakeEnd - ac.s, 1)), 6, 90);
        ac.speed = Math.max(SIM.EXIT_SPEED, ac.speed - a * dt);
      }
      this.advance(ac, dt);
    } else this.groundMove(ac, dt, false);
    if (ac.s > brakeEnd && !ac.rwy.overlaps(ac)) {                  // fully clear of the runway
      this.manager.release(ac.rwy, ac);
      ac.state = 'TAXI_TO_GATE';
      this.log(`${ac.id} vacated ${ac.rwy.name}, taxiing to ${ac.stand.id}`);
    }
  }

  /* ---------- departure ---------- */
  startPushback(ac, rw) {
    ac.rwy = rw; ac.path = new Path([[ac.stand.x, ac.stand.y], [ac.stand.x, 400]]); ac.s = 0;
    ac.state = 'PUSHBACK';
    this.log(`${ac.id} pushing back from ${ac.stand.id} (runway ${rw.name})`);
  }

  stepPushback(ac, dt) {
    const rem = ac.path.length - ac.s;
    this.accelerateTo(ac, Math.max(3, Math.min(14, Math.sqrt(2 * 20 * rem))), dt, 10, 30);
    this.advance(ac, dt, 1, true);                                  // move backwards, nose stays still
    if (rem < 0.3) {
      ac.s = ac.path.length; ac.speed = 0; ac.state = 'TURNING';
      ac.stand.occupant = null;                                     // gate is free again
      const nodes = Network.route('E' + ac.stand.x, RWY_OPS[ac.rwy.id].take.hold);
      ac.taxiPath = Path.fromWaypoints(Network.points(nodes), 22, SIM.TURN_CAP);
    }
  }

  stepTurning(ac, dt) {                                             // rotate on the spot toward the taxiway
    const diff = Geo.angleDiff(ac.taxiPath.at(0).angle, ac.heading), max = 70 * dt;
    ac.heading = Geo.norm(ac.heading + Geo.clamp(diff, -max, max));
    if (Math.abs(diff) < 1.5) { ac.path = ac.taxiPath; ac.s = 0; ac.state = 'TAXI_TO_RUNWAY'; }
  }

  startTakeoff(ac) {
    const op = RWY_OPS[ac.rwy.id];
    const pts = [NODE[op.take.hold], ...op.take.pts];
    ac.path = Path.fromWaypoints(pts, 22, SIM.TURN_CAP); ac.s = 0;
    let len = 0; for (let i = 0; i <= op.take.junction; i++) len += Geo.dist(pts[i], pts[i + 1]);
    ac.rollStartS = len + 22;                                       // end of the turn onto the runway
    ac.airborne = false; ac.state = 'TAKEOFF_ROLL';
    this.manager.occupy(ac.rwy, ac);                                // takeoff operation begins
    this.log(`${ac.id} lining up on ${ac.rwy.name}`);
  }

  stepTakeoff(ac, dt) {
    if (ac.s < ac.rollStartS) this.accelerateTo(ac, 28, dt, 25, 60);                 // slow turn onto runway
    else this.accelerateTo(ac, ac.airborne ? SIM.CLIMB : 260, dt, SIM.TAKEOFF_ACCEL, 60); // full power
    this.advance(ac, dt);
    if (!ac.airborne && ac.s > ac.rollStartS && ac.speed >= SIM.LIFTOFF) {
      ac.airborne = true; ac.state = 'CLIMBING'; this.log(`${ac.id} airborne from ${ac.rwy.name}`);
    }
    if (ac.airborne) ac.altitude = Math.min(1, ac.altitude + 0.5 * dt);              // scale grows as it climbs
    if (ac.airborne && ac.rwy && !ac.rwy.overlaps(ac)) { this.manager.release(ac.rwy, ac); ac.rwy = null; }
    if (ac.x > CFG.W + 90 || ac.x < -90 || ac.y < -90 || ac.y > CFG.H + 90) {
      if (ac.rwy) { this.manager.release(ac.rwy, ac); ac.rwy = null; }
      ac.state = 'DEPARTED'; this.stats.departed++; this.log(`${ac.id} left the airport area`);
    }
  }

  /* Safety monitor: an aircraft physically on a runway that it does not hold is a violation. */
  checkSafety() {
    this.manager.runways.forEach(rw => this.aircraft.forEach(a => {
      if (a !== rw.holder && a.altitude < 0.35 && rw.overlaps(a)) {   // airborne aircraft pass overhead
        this.stats.violations++; this.log(`!! CONFLICT: ${a.id} on ${rw.name} held by ${rw.holder ? rw.holder.id : 'nobody'}`);
      }
    }));
  }
}