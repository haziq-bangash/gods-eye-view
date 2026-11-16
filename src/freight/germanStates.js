/**
 * Which German state a point lies in, and which states a route crosses
 * (portable: no Cesium, no DOM). State holidays ban trucks only in that
 * state, so a checked route needs its states the way a corridor lists them.
 *
 * Outlines: Natural Earth 10m (public domain), about 1 km precise, which is
 * plenty to tell which states a motorway route passes through.
 */
import { GERMAN_STATE_SHAPES } from './germanStatesData.js';

function decodeRing(encoded, decimals) {
  const factor = 10 ** decimals;
  const ring = [];
  let x = 0;
  let y = 0;
  for (let i = 0; i + 1 < encoded.length; i += 2) {
    x += encoded[i];
    y += encoded[i + 1];
    ring.push([x / factor, y / factor]);
  }
  return ring;
}

function boxOf(rings) {
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  for (const ring of rings)
    for (const [lon, lat] of ring) {
      if (lon < w) w = lon;
      if (lon > e) e = lon;
      if (lat < s) s = lat;
      if (lat > n) n = lat;
    }
  return [w, s, e, n];
}

let decoded = null;
/** Decoded once, on first use: [{ code, box, polygons: [[outer, ...holes]] }]. */
function shapes() {
  decoded ??= GERMAN_STATE_SHAPES.map((state) => {
    const polygons = state.polygons.map((polygon) =>
      polygon.map((ring) => decodeRing(ring, state.decimals)),
    );
    return { code: state.code, box: boxOf(polygons.flat()), polygons };
  });
  return decoded;
}

function inRing([lon, lat], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (
      yi > lat !== yj > lat &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
    )
      inside = !inside;
  }
  return inside;
}

/** The two-letter code of the state at [lon, lat], or null outside Germany. */
export function stateAt(point) {
  const [lon, lat] = point || [];
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  for (const state of shapes()) {
    const [w, s, e, n] = state.box;
    if (lon < w || lon > e || lat < s || lat > n) continue;
    for (const [outer, ...holes] of state.polygons)
      if (inRing(point, outer) && !holes.some((hole) => inRing(point, hole)))
        return state.code;
  }
  return null;
}

/**
 * The states a route ([lon, lat] points) passes through, in the order it
 * enters them. Samples about every `stepKm`; points abroad are skipped.
 */
export function statesAlong(path, stepKm = 2) {
  const codes = [];
  if (!Array.isArray(path)) return codes;
  const stepDeg = stepKm / 111;
  let last = null;
  const visit = (point) => {
    const code = stateAt(point);
    if (code && !codes.includes(code)) codes.push(code);
  };
  for (const point of path) {
    if (
      !last ||
      Math.hypot(point[0] - last[0], point[1] - last[1]) >= stepDeg ||
      point === path.at(-1)
    ) {
      visit(point);
      last = point;
    }
  }
  return codes;
}
