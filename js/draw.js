/* draw.js - thin helpers over the Canvas 2D API (the "primitives" layer). */

const Draw = {
  rect(ctx, x, y, w, h, fill, stroke) {
    if (fill)   { ctx.fillStyle = fill;   ctx.fillRect(x, y, w, h); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.strokeRect(x, y, w, h); }
  },

  line(ctx, x1, y1, x2, y2, color, width = 1, dash = []) {
    ctx.beginPath();
    ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dash);
    ctx.stroke(); ctx.setLineDash([]);
  },

  // Polygon = ordered list of vertices joined by straight edges.
  polygon(ctx, pts, fill, stroke, width = 1, dash = []) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.setLineDash(dash); ctx.stroke(); ctx.setLineDash([]); }
  },

  // Open polyline drawn as a thick stroke (used for taxiways).
  polyline(ctx, pts, color, width, dash = []) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'butt';
    ctx.setLineDash(dash); ctx.stroke(); ctx.setLineDash([]);
  },

  circle(ctx, x, y, r, fill, stroke, width = 1) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
  },

  text(ctx, str, x, y, { size = 12, color = '#fff', bold = false, align = 'center' } = {}) {
    ctx.font = `${bold ? '700' : '500'} ${size}px "Segoe UI", sans-serif`;
    ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle';
    ctx.fillText(str, x, y);
  },

  /* TRANSFORMATION HELPER
   * Runs fn() inside a local coordinate system whose origin is (x, y),
   * rotated by `deg` degrees and scaled by (sx, sy).
   * Canvas applies:  M = T(x,y) * R(deg) * S(sx,sy)
   * i.e. a point p is scaled first, then rotated, then translated:
   *   p' = T * R * S * p
   * save()/restore() push and pop the current matrix so that other objects
   * are not affected. Aircraft will use this same helper in later milestones. */
  withTransform(ctx, x, y, deg, sx, sy, fn) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(deg * Math.PI / 180);
    ctx.scale(sx, sy);
    fn();
    ctx.restore();
  }
};
