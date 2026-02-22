/**
 * Arc segment utilities: midpoint, three-point arc calculation, angle conventions.
 *
 * All arc math (world coords, angle 0 = North, atan2(dx, dy)) lives here
 * so midpoint and arc logic can be debugged and tested in one place.
 */

const TWO_PI = 2 * Math.PI;

/**
 * Get the midpoint of an arc segment (middle by angle along the arc).
 * Segment: { segmentType: "arc", center, start, end, radius, rotation?: "cw"|"ccw" }.
 * Convention: angle 0 = North, point = (cx + r*sin(a), cy + r*cos(a)).
 *
 * @param {Object} segment - Arc segment with center, start, end, radius, rotation
 * @returns {{ x: number, y: number } | null} World coords of midpoint or null
 */
export function getArcMidPoint(segment) {
  if (!segment || segment.segmentType !== "arc" || !segment.center || !segment.start || !segment.end) {
    return null;
  }
  const cx = segment.center.x;
  const cy = segment.center.y;
  const r = segment.radius;
  const rot = segment.rotation || segment.rot || "cw";
  const a1 = Math.atan2(
    (segment.start.x ?? segment.startX) - cx,
    (segment.start.y ?? segment.startY) - cy
  );
  const a3 = Math.atan2(
    (segment.end.x ?? segment.endX) - cx,
    (segment.end.y ?? segment.endY) - cy
  );
  // Angular span: dCcw = (a3 - a1) mod 2π, dCw = (a1 - a3) mod 2π
  const dCcw = (a3 - a1 + TWO_PI) % TWO_PI;
  const dCw = (a1 - a3 + TWO_PI) % TWO_PI;
  // Midpoint = start + half span along the drawn arc (sense matched to canvas/ctx.arc counterclockwise flag)
  const midAngle =
    rot === "ccw"
      ? a1 - dCw / 2
      : a1 + dCcw / 2;
  return { x: cx + r * Math.sin(midAngle), y: cy + r * Math.cos(midAngle) };
}

/**
 * Calculate arc parameters from three points (circumscribed circle, pt1 -> pt3 through pt2).
 * Same convention as backend: North=0, atan2(dx, dy).
 *
 * @param {{ x: number, y: number }} pt1 - Start point
 * @param {{ x: number, y: number }} pt2 - Point on arc (middle)
 * @param {{ x: number, y: number }} pt3 - End point
 * @returns {{ center: {x,y}, radius, start: {x,y}, end: {x,y}, rotation: "cw"|"ccw" } | null}
 */
export function calculateArcFromThreePoints(pt1, pt2, pt3) {
  const x1 = pt1.x, y1 = pt1.y, x2 = pt2.x, y2 = pt2.y, x3 = pt3.x, y3 = pt3.y;
  if ((x1 === x2 && y1 === y2) || (x2 === x3 && y2 === y3) || (x1 === x3 && y1 === y3)) {
    return null;
  }
  const m1x = (x1 + x2) / 2, m1y = (y1 + y2) / 2;
  const v1x = y1 - y2, v1y = x2 - x1;
  const m2x = (x2 + x3) / 2, m2y = (y2 + y3) / 2;
  const v2x = y2 - y3, v2y = x3 - x2;
  const denom = v1x * v2y - v1y * v2x;
  if (Math.abs(denom) < 1e-12) return null;
  const t = ((m2x - m1x) * v2y - (m2y - m1y) * v2x) / denom;
  const cx = m1x + t * v1x, cy = m1y + t * v1y;
  const radius = Math.sqrt((x1 - cx) ** 2 + (y1 - cy) ** 2);
  if (!Number.isFinite(radius) || radius <= 0) return null;
  const a1 = Math.atan2(x1 - cx, y1 - cy);
  const a2 = Math.atan2(x2 - cx, y2 - cy);
  const a3 = Math.atan2(x3 - cx, y3 - cy);
  const norm = (a) => { let x = a % TWO_PI; if (x < 0) x += TWO_PI; return x; };
  const ang1 = norm(a1), ang2 = norm(a2), ang3 = norm(a3);
  const dCwSpan = (ang3 - ang1 + TWO_PI) % TWO_PI;
  const dCcwSpan = (ang1 - ang3 + TWO_PI) % TWO_PI;
  const a2From1Cw = (ang2 - ang1 + TWO_PI) % TWO_PI;
  const rotation = (a2From1Cw > 0 && a2From1Cw <= dCwSpan) ? "cw" : "ccw";
  return {
    center: { x: cx, y: cy },
    radius,
    start: { x: x1, y: y1 },
    end: { x: x3, y: y3 },
    rotation,
  };
}

/**
 * Get tangent direction (azimuth in degrees, North=0°, clockwise) at an arc endpoint.
 *
 * @param {Object} segment - Arc segment with center, start, end, rotation
 * @param {"arc_start_pt"|"arc_end_pt"} type - Which endpoint
 * @returns {number | null} Azimuth in 0..360 or null
 */
export function getArcTangentAzimuthAtPoint(segment, type) {
  if (!segment || segment.segmentType !== "arc" || !segment.center || (type !== "arc_start_pt" && type !== "arc_end_pt")) {
    return null;
  }
  const cx = segment.center.x;
  const cy = segment.center.y;
  const pt = type === "arc_start_pt" ? segment.start : segment.end;
  const angleFromCenter = Math.atan2(pt.x - cx, pt.y - cy);
  const rot = segment.rotation || "cw";
  // Tangent perpendicular to radius; CW: -90°, CCW: +90°
  let tangentAngle = rot === "cw" ? angleFromCenter - Math.PI / 2 : angleFromCenter + Math.PI / 2;
  // arc_end_pt: we need arrival direction (along arc), not departure; opposite by 180°
  if (type === "arc_end_pt") {
    tangentAngle += Math.PI;
  }
  let azimuth = tangentAngle * 180 / Math.PI;
  if (azimuth < 0) azimuth += 360;
  if (azimuth >= 360) azimuth -= 360;
  return azimuth;
}

/**
 * Check if a world point (angle from center) lies on the arc (between start and end in rotation direction).
 *
 * @param {Object} segment - Arc segment
 * @param {number} worldX - Point X
 * @param {number} worldY - Point Y
 * @returns {boolean}
 */
export function isPointOnArc(segment, worldX, worldY) {
  if (!segment || segment.segmentType !== "arc" || !segment.center || !segment.start || !segment.end) {
    return false;
  }
  const cx = segment.center.x, cy = segment.center.y, r = segment.radius;
  const dx = worldX - cx, dy = worldY - cy;
  const distToCenter = Math.sqrt(dx * dx + dy * dy);
  const tolerance = 1e-6 * (r || 1);
  if (Math.abs(distToCenter - r) > tolerance) return false;
  const angle = Math.atan2(dx, dy);
  const a1 = Math.atan2(segment.start.x - cx, segment.start.y - cy);
  const a3 = Math.atan2(segment.end.x - cx, segment.end.y - cy);
  const norm = (a) => { let x = a % TWO_PI; if (x < 0) x += TWO_PI; return x; };
  const ang = norm(angle), ang1 = norm(a1), ang3 = norm(a3);
  const rot = segment.rotation || segment.rot || "cw";
  if (rot === "cw") {
    const d = (ang3 - ang1 + TWO_PI) % TWO_PI;
    const from1 = (ang - ang1 + TWO_PI) % TWO_PI;
    return from1 >= 0 && from1 <= d;
  }
  const d = (ang1 - ang3 + TWO_PI) % TWO_PI;
  const from3 = (ang - ang3 + TWO_PI) % TWO_PI;
  return from3 >= 0 && from3 <= d;
}
