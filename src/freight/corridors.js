/**
 * Corridor risk score for named German freight corridors.
 *
 *   R = 0.35·C + 0.20·P + 0.25·H + 0.20·W
 *
 * C closures (Autobahn events on the corridor's roads), P truck parking,
 * H hydrology (Kaub level, river corridors only), W weather (DWD warnings).
 * A part with no data yet (parking and weather until their layers exist) or
 * that does not apply (H on a road-only corridor) is left out and the
 * remaining weights are rescaled to sum to 1. Each part is 0–100; R maps to
 * low (< 33), elevated (33–66) and high (> 66). Weights are starting
 * guesses, not calibrated values, and R is not a delay forecast.
 *
 * Portable: no Cesium, DOM or catalogs, so the shell, voice and MCP tools
 * can all score the same way.
 */
import { msg } from '../i18n/marker.js';
import { kaubHydrologyScore } from '../layers/riverLevels/records.js';
import { weatherScore } from '../layers/weatherWarnings/records.js';
import { parkingScore } from '../layers/truckParking/records.js';
import { appliesDuring } from './horizon.js';

/** Rest areas further than this from the corridor line are not on it. */
export const PARKING_BUFFER_KM = 15;

export const RISK_WEIGHTS = Object.freeze({ C: 0.35, P: 0.2, H: 0.25, W: 0.2 });

export const RISK_PARTS = Object.freeze({
  C: msg('Closures'),
  P: msg('Truck parking'),
  H: msg('Water level'),
  W: msg('Weather'),
});

/**
 * Points each event adds before C is scaled: a closed road weighs most,
 * routine exit closures and long-term roadworks almost nothing.
 */
export const CLOSURE_POINTS = Object.freeze({
  closure: 15,
  warning: 8,
  'short-roadworks': 1,
  'ramp-closure': 1,
  roadworks: 0.2,
});

/** Events further than this from the corridor line are not on it. */
export const CORRIDOR_BUFFER_KM = 25;

/**
 * The corridors, each a line through the cities it links ([lon, lat]) and the
 * Autobahns that carry it. River corridors also read the Kaub gauge.
 */
export const CORRIDORS = Object.freeze([
  Object.freeze({
    id: 'hamburg-ruhr',
    from: 'Hamburg',
    to: 'Dortmund',
    name: msg('Hamburg to the Ruhr'),
    roads: Object.freeze(['A1']),
    // Federal states crossed, for state holidays (truck driving bans).
    states: Object.freeze(['HH', 'NI', 'HB', 'NW']),
    river: null,
    path: Object.freeze([
      [10.0, 53.55],
      [9.4, 53.3],
      [8.8, 53.08],
      [8.05, 52.28],
      [7.63, 51.96],
      [7.47, 51.51],
    ]),
  }),
  Object.freeze({
    id: 'north-south-a7',
    from: 'Hamburg',
    to: 'Ulm',
    name: msg('North–South on the A7'),
    roads: Object.freeze(['A7']),
    // Federal states crossed, for state holidays (truck driving bans).
    states: Object.freeze(['HH', 'NI', 'HE', 'BY', 'BW']),
    river: null,
    path: Object.freeze([
      [10.0, 53.55],
      [9.73, 52.37],
      [9.48, 51.31],
      [9.93, 49.79],
      [9.99, 48.4],
      [10.18, 47.98],
    ]),
  }),
  Object.freeze({
    id: 'rhine-axis',
    from: 'Duisburg',
    to: 'Karlsruhe',
    name: msg('Rhine axis'),
    roads: Object.freeze(['A61', 'A3', 'A5']),
    // Federal states crossed, for state holidays (truck driving bans).
    states: Object.freeze(['NW', 'RP', 'HE', 'BW']),
    river: 'RHEIN',
    path: Object.freeze([
      [6.76, 51.43],
      [6.96, 50.94],
      [7.25, 50.6],
      [7.59, 50.36],
      [7.76, 50.09],
      [8.27, 50.0],
      [8.47, 49.49],
      [8.4, 49.0],
    ]),
  }),
]);

/** Low, elevated or high for a score. */
export function riskLevel(score) {
  if (!Number.isFinite(score)) return null;
  if (score > 66) return 'high';
  if (score >= 33) return 'elevated';
  return 'low';
}

export const RISK_LEVEL_LABELS = Object.freeze({
  low: msg('Low'),
  elevated: msg('Elevated'),
  high: msg('High'),
});

/** Great-circle distance in km (equirectangular; fine at corridor scale). */
function distanceKm([lon1, lat1], [lon2, lat2]) {
  const k = Math.PI / 180;
  const x = (lon2 - lon1) * k * Math.cos(((lat1 + lat2) / 2) * k);
  const y = (lat2 - lat1) * k;
  return Math.hypot(x, y) * 6371;
}

/** Shortest distance in km from a point to a polyline. */
export function distanceToPathKm(point, path) {
  let best = Infinity;
  for (let i = 0; i < path.length - 1; i += 1) {
    const [a, b] = [path[i], path[i + 1]];
    // Project in a local flat frame around the segment.
    const k = Math.cos((((a[1] + b[1]) / 2) * Math.PI) / 180);
    const ax = a[0] * k;
    const bx = b[0] * k;
    const px = point[0] * k;
    const dx = bx - ax;
    const dy = b[1] - a[1];
    const t =
      dx || dy
        ? Math.max(
            0,
            Math.min(
              1,
              ((px - ax) * dx + (point[1] - a[1]) * dy) / (dx * dx + dy * dy),
            ),
          )
        : 0;
    best = Math.min(
      best,
      distanceKm(point, [a[0] + (b[0] - a[0]) * t, a[1] + dy * t]),
    );
  }
  return best;
}

/** The Autobahn events that lie on a corridor (and, on a route, its way). */
export function corridorEvents(corridor, events) {
  const near = nearPath(
    corridor,
    events,
    corridor.bufferKm ?? CORRIDOR_BUFFER_KM,
  );
  return corridor.directional
    ? near.filter((row) => goesTheSameWay(row, corridor.path))
    : near;
}

/** An event's line heads within this many degrees of the route to count. */
export const SAME_WAY_DEGREES = 60;
/** Lines shorter than this give no reliable heading. */
const HEADING_MIN_KM = 0.15;
/** Notices that say one event covers both carriageways. */
const BOTH_WAYS =
  /beide\s*(?:FR|Ri\.?Fa|Fahrtrichtungen|Richtungen)|(?:FR|Ri\.?Fa)\.?\s*beide|in beiden Richtungen/i;

/** Compass bearing in degrees from a to b ([lon, lat]), flat at this scale. */
function bearing(a, b) {
  const k = Math.cos((((a[1] + b[1]) / 2) * Math.PI) / 180);
  const deg = (Math.atan2((b[0] - a[0]) * k, b[1] - a[1]) * 180) / Math.PI;
  return (deg + 360) % 360;
}

/** The route's heading near `point`: over about 2 km either side of it. */
export function pathHeadingAt(path, point) {
  if (!Array.isArray(path) || path.length < 2) return null;
  let nearest = 0;
  let best = Infinity;
  for (let i = 0; i < path.length; i += 1) {
    const d = distanceKm(point, path[i]);
    if (d < best) {
      best = d;
      nearest = i;
    }
  }
  const walk = (step) => {
    let i = nearest;
    let walked = 0;
    while (i + step >= 0 && i + step < path.length && walked < 2) {
      walked += distanceKm(path[i], path[i + step]);
      i += step;
    }
    return path[i];
  };
  const [a, b] = [walk(-1), walk(1)];
  return a === b ? null : bearing(a, b);
}

/**
 * Whether an event applies to traffic going the route's way. Autobahn GmbH
 * draws an event's line in its direction of travel ("Hamburg -> Hannover"
 * runs south), so a closure on the other carriageway, or on a road the
 * route crosses, heads elsewhere. Exit ramps, both-way notices and events
 * without a usable line count, as before.
 */
export function goesTheSameWay(row, path) {
  if (row?.kind === 'ramp-closure') return true;
  if ((row?.details || []).some((line) => BOTH_WAYS.test(String(line))))
    return true;
  const line = row?.line;
  if (!Array.isArray(line) || line.length < 2) return true;
  const [first, last] = [line[0], line.at(-1)];
  if (distanceKm(first, last) < HEADING_MIN_KM) return true;
  const route = pathHeadingAt(path, [row.lon, row.lat]);
  if (route === null) return true;
  const diff = Math.abs(((bearing(first, last) - route + 540) % 360) - 180);
  return diff <= SAME_WAY_DEGREES;
}

/** [west, south, east, north] of a path, widened by `km`. */
function pathBox(path, km) {
  const lons = path.map(([lon]) => lon);
  const lats = path.map(([, lat]) => lat);
  const dLat = km / 111;
  const dLon =
    km /
    (111 *
      Math.cos(
        (((Math.min(...lats) + Math.max(...lats)) / 2) * Math.PI) / 180,
      ));
  return [
    Math.min(...lons) - dLon,
    Math.min(...lats) - dLat,
    Math.max(...lons) + dLon,
    Math.max(...lats) + dLat,
  ];
}

/**
 * Rows on the corridor: on one of its roads (any road when it lists none,
 * as a checked route does) and within `km` of its line.
 */
function nearPath(corridor, rows, km) {
  const roads =
    Array.isArray(corridor.roads) && corridor.roads.length
      ? corridor.roads
      : null;
  const [w, s, e, n] = pathBox(corridor.path, km);
  return (Array.isArray(rows) ? rows : []).filter(
    (row) =>
      (!roads || roads.includes(row?.road)) &&
      Number.isFinite(row?.lat) &&
      Number.isFinite(row?.lon) &&
      row.lon >= w &&
      row.lon <= e &&
      row.lat >= s &&
      row.lat <= n &&
      distanceToPathKm([row.lon, row.lat], corridor.path) <= km,
  );
}

/**
 * Points at which C reaches about 63: one closure gives ~22, two ~39,
 * four ~63, eight ~86. The curve saturates, so a bad day is high without
 * every busy corridor pinning at 100.
 */
export const CLOSURE_SCALE = 60;

/** C: 0–100 from the events on the corridor, with counts by kind. */
export function closureScore(events) {
  const counts = {};
  let points = 0;
  for (const event of events) {
    counts[event.kind] = (counts[event.kind] || 0) + 1;
    points += CLOSURE_POINTS[event.kind] || 0;
  }
  return {
    value: Math.round(100 * (1 - Math.exp(-points / CLOSURE_SCALE))),
    counts,
    points,
  };
}

/**
 * Score one corridor.
 * @param {object} corridor - One of CORRIDORS.
 * @param {{events?: object[], kaubLevelCm?: ?number, parking?: ?number,
 *   warnings?: ?object[], weather?: ?number, now?: number}} inputs -
 *   P comes from the rest areas on the corridor (`restAreas`, null while
 *   the parking layer is off); `parking` overrides it with a fixed score.
 *   W comes from the DWD warning rows crossing the corridor (null when the
 *   warnings layer is off); `weather` overrides it with a fixed score.
 * @returns {{id: string, score: ?number, level: ?string, parts: object[],
 *   counts: object, events: object[]}}
 */
export function scoreCorridor(
  corridor,
  {
    events = [],
    kaubLevelCm = null,
    parking = null,
    restAreas = null,
    warnings = null,
    weather = null,
    now = Date.now(),
    range = null,
  } = {},
) {
  // A time range ([from, to]: tonight, tomorrow) or now. Events apply by
  // their schedule; the caller passes Kaub's level for the range.
  const when = Array.isArray(range) ? range : [now, now];
  events = (Array.isArray(events) ? events : []).filter((event) =>
    appliesDuring(event, when),
  );
  const onCorridor = corridorEvents(corridor, events);
  const closures = closureScore(onCorridor);
  const hydrology = corridor.river ? kaubHydrologyScore(kaubLevelCm) : null;
  const onPath = Array.isArray(warnings)
    ? weatherScore(corridor.path, warnings, { now, range })
    : null;
  const parkingDetail = Array.isArray(restAreas)
    ? parkingScore(
        corridor,
        nearPath(
          corridor,
          restAreas,
          corridor.parkingBufferKm ?? PARKING_BUFFER_KM,
        ),
        events,
      )
    : null;
  const parkingValue = Number.isFinite(parking)
    ? parking
    : (parkingDetail?.value ?? null);
  const weatherValue = Number.isFinite(weather)
    ? weather
    : (onPath?.value ?? null);
  const raw = [
    { key: 'C', value: closures.value, applies: true },
    {
      key: 'P',
      value: parkingValue,
      applies: true,
    },
    { key: 'H', value: hydrology, applies: Boolean(corridor.river) },
    {
      key: 'W',
      value: weatherValue,
      applies: true,
    },
  ];
  const used = raw.filter((part) => part.applies && part.value !== null);
  const total = used.reduce((sum, part) => sum + RISK_WEIGHTS[part.key], 0);
  const parts = raw
    .filter((part) => part.applies)
    .map((part) => ({
      key: part.key,
      value: part.value,
      available: part.value !== null,
      // The weight this part actually carries after rescaling.
      weight:
        part.value !== null && total > 0 ? RISK_WEIGHTS[part.key] / total : 0,
    }));
  const score = total
    ? Math.round(
        parts.reduce((sum, part) => sum + (part.value ?? 0) * part.weight, 0),
      )
    : null;
  return {
    id: corridor.id,
    score,
    level: riskLevel(score),
    parts,
    counts: closures.counts,
    points: closures.points,
    warnings: onPath?.warnings ?? [],
    parking: parkingDetail,
    events: onCorridor,
  };
}

/** Score every corridor, highest risk first. */
export function scoreCorridors(inputs, corridors = CORRIDORS) {
  return corridors
    .map((corridor) => ({ corridor, ...scoreCorridor(corridor, inputs) }))
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
}

/** A checked route's events lie on it; rest areas sit right beside it. */
export const ROUTE_EVENT_KM = 1.5;
export const ROUTE_PARKING_KM = 1;

/** Keep a point every ~`stepKm` of a detailed route line (and its ends). */
export function thinPath(path, stepKm = 0.5) {
  if (!Array.isArray(path) || path.length < 3) return path || [];
  const out = [path[0]];
  for (const point of path.slice(1, -1))
    if (distanceKm(out.at(-1), point) >= stepKm) out.push(point);
  out.push(path.at(-1));
  return out;
}

/**
 * Score a driven route like a corridor: events within ROUTE_EVENT_KM of its
 * line on any road, rest areas within ROUTE_PARKING_KM, the DWD warnings it
 * crosses; no water part (a road route).
 * @param {{from: string, to: string, path: number[][]}} route
 */
export function scoreRoute(route, inputs = {}) {
  const corridor = Object.freeze({
    id: 'route',
    from: route.from,
    to: route.to,
    name: msg('Your route'),
    roads: null,
    river: null,
    path: thinPath(route.path),
    // A route goes one way: events on the other carriageway are not on it.
    directional: true,
    bufferKm: ROUTE_EVENT_KM,
    parkingBufferKm: ROUTE_PARKING_KM,
  });
  return {
    corridor,
    ...scoreCorridor(corridor, { ...inputs, kaubLevelCm: null }),
  };
}
