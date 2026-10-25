/* path.js - geometry helpers and the Path class (Milestone 3).
 * A Path is a polyline of sampled points. An aircraft stores only "s", the
 * distance travelled along the path; position and direction come from at(s).
 * This is arc-length parametrisation: speed * dt is added to s every frame. */

const Geo = {
  clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
  dist: (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]),
  norm: d => ((d % 360) + 360) % 360,
  // shortest signed rotation (degrees) that turns 'from' into 'to'
  angleDiff: (to, from) => (((to - from) % 360) + 540) % 360 - 180
};

class Path {
  constructor(pts, caps) {
    this.pts = pts;
    this.caps = caps || pts.map(() => Infinity);   // speed limit at each point (turns)
    this.cum = [0];                                // cumulative length at each point
    for (let i = 1; i < pts.length; i++) this.cum.push(this.cum[i - 1] + Geo.dist(pts[i - 1], pts[i]));
    this.length = this.cum[this.cum.length - 1];
  }

  indexAt(s) {                                     // binary search: segment containing s
    let lo = 0, hi = this.cum.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (this.cum[m] <= s) lo = m; else hi = m; }
    return lo;
  }

  // Position and tangent angle (degrees) at distance s: linear interpolation.
  at(s) {
    s = Geo.clamp(s, 0, this.length);
    const i = this.indexAt(s), a = this.pts[i], b = this.pts[i + 1] || a;
    const seg = (this.cum[i + 1] - this.cum[i]) || 1, t = (s - this.cum[i]) / seg;
    return { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t,
             angle: Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI };
  }

  // Lowest speed limit within the next d units (so aircraft slow down BEFORE a turn).
  capAhead(s, d) {
    const i = this.indexAt(s), j = Math.min(this.indexAt(Math.min(this.length, s + d)) + 1, this.pts.length - 1);
    let c = Infinity;
    for (let k = i; k <= j; k++) c = Math.min(c, this.caps[k]);
    return c;
  }

  /* Corner rounding. At every vertex P with a bend, the sharp corner is replaced
   * by a QUADRATIC BEZIER curve:  B(t) = (1-t)^2 A + 2(1-t)t P + t^2 B
   * where A and B lie 'radius' units before/after P and P is the control point.
   * The curve starts along the incoming direction and ends along the outgoing
   * one, so aircraft turn smoothly instead of snapping. */
  static fromWaypoints(wp, radius = 22, turnCap = 30) {
    const w = wp.filter((p, i) => i === 0 || Geo.dist(p, wp[i - 1]) > 0.5);
    const pts = [w[0]], caps = [Infinity];
    for (let i = 1; i < w.length - 1; i++) {
      const prev = w[i - 1], P = w[i], next = w[i + 1];
      const l1 = Geo.dist(prev, P), l2 = Geo.dist(P, next);
      const u = [(P[0] - prev[0]) / l1, (P[1] - prev[1]) / l1];
      const v = [(next[0] - P[0]) / l2, (next[1] - P[1]) / l2];
      if (u[0] * v[0] + u[1] * v[1] > 0.9995) continue;           // straight: no corner
      const d = Math.min(radius, l1 / 2, l2 / 2);
      const A = [P[0] - u[0] * d, P[1] - u[1] * d], B = [P[0] + v[0] * d, P[1] + v[1] * d];
      for (let k = 0; k <= 8; k++) {
        const t = k / 8, a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
        pts.push([a * A[0] + b * P[0] + c * B[0], a * A[1] + b * P[1] + c * B[1]]);
        caps.push(turnCap);
      }
    }
    pts.push(w[w.length - 1]); caps.push(Infinity);
    return new Path(pts, caps);
  }

  /* Cubic Bezier from p0 (leaving with heading deg0) to p3 (arriving with heading deg3):
   * B(t) = (1-t)^3 P0 + 3(1-t)^2 t P1 + 3(1-t) t^2 P2 + t^3 P3
   * P1 and P2 are "handles" placed along the headings, which guarantees the
   * aircraft's direction matches at both ends (a smooth join to the final approach). */
  static bezierPoints(p0, deg0, p3, deg3, n = 36) {
    const k = Math.min(0.45 * Geo.dist(p0, p3), 450), r = d => d * Math.PI / 180;
    const p1 = [p0[0] + Math.cos(r(deg0)) * k, p0[1] + Math.sin(r(deg0)) * k];
    const p2 = [p3[0] - Math.cos(r(deg3)) * k, p3[1] - Math.sin(r(deg3)) * k];
    const out = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, m = 1 - t;
      const a = m * m * m, b = 3 * m * m * t, c = 3 * m * t * t, d = t * t * t;
      out.push([a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]]);
    }
    return out;
  }
}