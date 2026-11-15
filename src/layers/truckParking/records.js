/**
 * Truck parking at Autobahn rest areas (Autobahn GmbH API, `parking_lorry`
 * service). The feed lists each rest area's truck and car spaces and its
 * facilities; it publishes no live occupancy. Shared by the server proxy and
 * the browser, so it stays portable: no Cesium, DOM, Node or catalogs.
 */
import { AUTOBAHN_ROADS } from '../autobahn/records.js';

export const TRUCK_PARKING_ROADS = AUTOBAHN_ROADS;

export const truckParkingUrl = (road) =>
  `https://verkehr.autobahn.de/o/autobahn/${encodeURIComponent(road)}/services/parking_lorry`;

/**
 * Events that can shut a rest area or its access, and how close (km, on the
 * same road) they must be: a closed carriageway nearby, or an exit or entry
 * closure that is usually the rest area's own access.
 */
export const PARKING_AFFECTED_KM = Object.freeze({
  closure: 3,
  'ramp-closure': 1,
});

/**
 * Usable truck spaces per 100 km at which P reaches 0. German corridors
 * range from roughly 400 to 750, and every corridor is short of spaces at
 * night, so this is a reference value, not a measured demand.
 */
export const PARKING_REFERENCE_PER_100KM = 800;

const spacesIn = (lines, label) => {
  const match = new RegExp(`${label}\\s+Stellplätze:\\s*(\\d+)`, 'i').exec(
    lines.join(' '),
  );
  return match ? Number(match[1]) : 0;
};

/** Plain rest-area rows from one road's `parking_lorry` payload. */
export function normalizeTruckParkingPayload(road, payload) {
  const list = payload?.parking_lorry;
  if (!Array.isArray(list)) throw new Error('Malformed parking payload');
  const rows = [];
  for (const item of list) {
    const id = typeof item?.identifier === 'string' ? item.identifier : '';
    const lat = Number(item?.coordinate?.lat);
    const lon = Number(item?.coordinate?.long);
    if (!id || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (item.future === true) continue;
    const lines = Array.isArray(item.description)
      ? item.description.filter((line) => typeof line === 'string')
      : [];
    rows.push({
      stableId: id,
      road,
      name: String(item.subtitle || item.title || '').trim(),
      lat,
      lon,
      lorrySpaces: spacesIn(lines, 'LKW'),
      carSpaces: spacesIn(lines, 'PKW'),
      blocked: item.isBlocked === 'true' || item.isBlocked === true,
      features: (Array.isArray(item.lorryParkingFeatureIcons)
        ? item.lorryParkingFeatureIcons
        : []
      )
        .map((feature) => String(feature?.description || '').trim())
        .filter(Boolean)
        .slice(0, 12),
    });
  }
  return rows;
}

/** Rows from several roads, each rest area once (the first road wins). */
export function mergeTruckParkingRows(lists) {
  const seen = new Set();
  const rows = [];
  for (const list of lists)
    for (const row of list) {
      if (seen.has(row.stableId)) continue;
      seen.add(row.stableId);
      rows.push(row);
    }
  return rows;
}

function distanceKm([lon1, lat1], [lon2, lat2]) {
  const k = Math.PI / 180;
  const x = (lon2 - lon1) * k * Math.cos(((lat1 + lat2) / 2) * k);
  return Math.hypot(x, (lat2 - lat1) * k) * 6371;
}

/**
 * The ids of rest areas that are blocked, or lie within PARKING_AFFECTED_KM
 * of a closure or exit closure on their own road.
 */
export function affectedParkingIds(rows = [], events = []) {
  const byRoad = new Map();
  for (const event of events) {
    const radius = PARKING_AFFECTED_KM[event?.kind];
    if (!radius) continue;
    if (!Number.isFinite(event.lat) || !Number.isFinite(event.lon)) continue;
    if (!byRoad.has(event.road)) byRoad.set(event.road, []);
    byRoad.get(event.road).push({ point: [event.lon, event.lat], radius });
  }
  const ids = new Set();
  for (const row of rows) {
    if (row.blocked) {
      ids.add(row.stableId);
      continue;
    }
    const near = byRoad.get(row.road);
    if (
      near?.some(
        ({ point, radius }) => distanceKm(point, [row.lon, row.lat]) <= radius,
      )
    )
      ids.add(row.stableId);
  }
  return ids;
}

/** Straight-line length of a [lon, lat] path in km. */
export function pathLengthKm(path) {
  let km = 0;
  for (let i = 0; i < path.length - 1; i += 1)
    km += distanceKm(path[i], path[i + 1]);
  return km;
}

/**
 * P for a corridor: 100 × (1 − usable truck spaces per 100 km ÷ reference),
 * clamped to 0–100. Usable spaces are those at rest areas on the corridor
 * that are not blocked or next to an active closure.
 * @param {{path: number[][], roads: string[]}} corridor
 * @param {object[]} rows - Rest areas already on the corridor (see the
 *   caller's distance filter).
 */
export function parkingScore(corridor, rows = [], events = []) {
  const affected = affectedParkingIds(rows, events);
  let total = 0;
  let usable = 0;
  for (const row of rows) {
    total += row.lorrySpaces;
    if (!affected.has(row.stableId)) usable += row.lorrySpaces;
  }
  const km = Math.max(1, pathLengthKm(corridor.path));
  const perHundredKm = (usable / km) * 100;
  return {
    value: Math.round(
      Math.min(
        100,
        Math.max(0, 100 * (1 - perHundredKm / PARKING_REFERENCE_PER_100KM)),
      ),
    ),
    totalSpaces: total,
    usableSpaces: usable,
    perHundredKm: Math.round(perHundredKm),
    restAreas: rows.length,
    affectedAreas: rows.filter((row) => affected.has(row.stableId)).length,
  };
}
