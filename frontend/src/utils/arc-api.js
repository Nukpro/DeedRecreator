/**
 * Arc API — создание дуг через backend API.
 * Все методы принимают siteSessionId и при ошибке выбрасывают Error с message из ответа.
 */

const BASE = "/api/geometry";

async function parseErrorResponse(response) {
  const err = await response.json().catch(async () => ({ message: await response.text() }));
  return err.message || `Request failed: ${response.status}`;
}

/**
 * Создать дугу по трём точкам.
 * @param {number} siteSessionId
 * @param {{ x: number, y: number }} pt1
 * @param {{ x: number, y: number }} pt2
 * @param {{ x: number, y: number }} pt3
 * @returns {Promise<{ success: boolean, version: number, arc: object }>}
 */
export async function createFromThreePoints(siteSessionId, pt1, pt2, pt3) {
  const response = await fetch(`${BASE}/${siteSessionId}/arc/from-three-points`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pt1: { x: pt1.x, y: pt1.y },
      pt2: { x: pt2.x, y: pt2.y },
      pt3: { x: pt3.x, y: pt3.y }
    })
  });
  if (!response.ok) {
    throw new Error(await parseErrorResponse(response));
  }
  return response.json();
}

/**
 * Create arc by start point, tangent, radius, rotation and length or delta.
 * @param {number} siteSessionId
 * @param {{ pt1: { x: number, y: number }, tang?: number | null, radius: number, rotation: 'cw'|'ccw', length?: number, delta?: number }} params
 * @returns {Promise<{ success: boolean, version: number, arc: object }>}
 */
export async function createByTanRadiusRotation(siteSessionId, params) {
  const body = {
    pt1: { x: params.pt1.x, y: params.pt1.y },
    radius: params.radius,
    rotation: params.rotation
  };
  if (params.tang != null && !Number.isNaN(params.tang)) {
    body.tang = params.tang;
  }
  if (params.length != null && !Number.isNaN(params.length)) {
    body.length = params.length;
  }
  if (params.delta != null && !Number.isNaN(params.delta)) {
    body.delta = params.delta;
  }
  const response = await fetch(`${BASE}/${siteSessionId}/arc/by-tan-radius-rotation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    throw new Error(await parseErrorResponse(response));
  }
  return response.json();
}

/**
 * Update segment (e.g. arc) — PUT /api/geometry/:siteSessionId/segment/:segmentId.
 * Body: startX, startY, endX, endY, layer (optional), attributes (optional).
 * @param {number} siteSessionId
 * @param {string} segmentId
 * @param {{ startX: number, startY: number, endX: number, endY: number, layer?: string, attributes?: object }} data
 * @returns {Promise<{ success: boolean, version: number }>}
 */
export async function updateSegment(siteSessionId, segmentId, data) {
  const response = await fetch(`${BASE}/${siteSessionId}/segment/${segmentId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      startX: data.startX,
      startY: data.startY,
      endX: data.endX,
      endY: data.endY,
      ...(data.layer != null && { layer: data.layer }),
      ...(data.attributes != null && { attributes: data.attributes })
    })
  });
  if (!response.ok) {
    throw new Error(await parseErrorResponse(response));
  }
  return response.json();
}

/** Move arc center (backend not implemented yet). */
export async function moveCenter(siteSessionId, segmentId, center) {
  throw new Error("Arc move center is not implemented yet.");
}

/**
 * Update existing arc by three points.
 * Backend uses ArcSegment.create_from_three_points() under the hood and
 * replaces the existing arc segment while keeping its ID and layer.
 *
 * @param {number} siteSessionId
 * @param {string} segmentId
 * @param {{ x: number, y: number }} pt1
 * @param {{ x: number, y: number }} pt2
 * @param {{ x: number, y: number }} pt3
 * @param {{ attributes?: object, rotation?: 'cw'|'ccw' }=} opts - optional extra data (rotation is currently ignored by backend)
 * @returns {Promise<{ success: boolean, version: number, arc: object }>}
 */
export async function updateFromThreePoints(siteSessionId, segmentId, pt1, pt2, pt3, opts = {}) {
  const body = {
    pt1: { x: pt1.x, y: pt1.y },
    pt2: { x: pt2.x, y: pt2.y },
    pt3: { x: pt3.x, y: pt3.y }
  };
  if (opts.attributes != null) {
    body.attributes = opts.attributes;
  }
  // `rotation` is passed through for possible future use, but currently ignored by backend
  if (opts.rotation != null) {
    body.rotation = opts.rotation;
  }

  const response = await fetch(`${BASE}/${siteSessionId}/arc/${segmentId}/from-three-points`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    throw new Error(await parseErrorResponse(response));
  }
  return response.json();
}

