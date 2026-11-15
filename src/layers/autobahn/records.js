/**
 * Normalize the Autobahn GmbH traffic feed (verkehr.autobahn.de) into compact
 * event rows. Shared by the server proxy and the browser, so it stays
 * portable: no Cesium, DOM, Node or catalogs.
 *
 * The feed is per road and per service. Each item carries a point, a
 * LineString and German description lines. Items flagged `future` are
 * announced but not yet in force, so they are left out.
 */

import { msg } from '../../i18n/marker.js';

/**
 * The roads fetched, in display order. A fixed corridor set rather than all
 * ~100 Autobahns keeps the proxy to a few requests per refresh on a
 * community-documented API: the A1/A2 Hamburg–Ruhr axis, the A7 north–south
 * axis, and the A3/A5/A61 roads along the Rhine, with the A40 through the Ruhr.
 */
export const AUTOBAHN_ROADS = Object.freeze([
  'A1',
  'A2',
  'A3',
  'A5',
  'A7',
  'A40',
  'A61',
]);

/** Feed services that carry events (truck parking is a separate service). */
export const AUTOBAHN_EVENT_SERVICES = Object.freeze([
  'closure',
  'roadworks',
  'warning',
]);

/** Feed display_type → row kind. Anything else is skipped. */
const KIND_BY_DISPLAY_TYPE = Object.freeze({
  CLOSURE: 'closure',
  CLOSURE_ENTRY_EXIT: 'ramp-closure',
  ROADWORKS: 'roadworks',
  SHORT_TERM_ROADWORKS: 'short-roadworks',
  WARNING: 'warning',
});

/** Row kinds, most disruptive first. */
export const AUTOBAHN_KINDS = Object.freeze([
  'closure',
  'ramp-closure',
  'warning',
  'short-roadworks',
  'roadworks',
]);

/**
 * How much each kind matters to someone moving freight: a closed road is
 * critical, a warning (jam, accident, hazard) major, and routine exit
 * closures and roadworks minor.
 */
export const AUTOBAHN_SEVERITIES = Object.freeze([
  'critical',
  'major',
  'minor',
]);
export const AUTOBAHN_SEVERITY_OF_KIND = Object.freeze({
  closure: 'critical',
  warning: 'major',
  'short-roadworks': 'minor',
  'ramp-closure': 'minor',
  roadworks: 'minor',
});
/** Apple system red, orange and brown: the same on the map and in lists. */
export const AUTOBAHN_SEVERITY_COLORS = Object.freeze({
  critical: '#ff3b30',
  major: '#ff9500',
  minor: '#a2845e',
});
/** The severity of a kind ('minor' for anything unknown). */
export function autobahnSeverity(kind) {
  return AUTOBAHN_SEVERITY_OF_KIND[kind] || 'minor';
}

const KIND_LABELS = Object.freeze({
  closure: msg('Closure'),
  'ramp-closure': msg('Junction closure'),
  warning: msg('Traffic warning'),
  'short-roadworks': msg('Short-term roadworks'),
  roadworks: msg('Roadworks'),
});

/** English label for a row kind (translate with t() where shown), or null. */
export function autobahnKindLabel(kind) {
  return KIND_LABELS[kind] || null;
}

/** Most points kept per event line; enough to follow the road at map scale. */
export const MAX_LINE_POINTS = 64;
const MAX_DETAIL_LINES = 10;
const MAX_DETAIL_CHARS = 240;

const ROAD_PATTERN = /^A\d{1,3}$/;

const textOrNull = (value) => {
  if (typeof value !== 'string') return null;
  const text = value.replace(/\s+/g, ' ').trim();
  return text ? text : null;
};

const numberOrNull = (value) => {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const validLon = (lon) => Number.isFinite(lon) && Math.abs(lon) <= 180;
const validLat = (lat) => Number.isFinite(lat) && Math.abs(lat) <= 90;

/** Keep at most `max` points, evenly spaced, always keeping both ends. */
export function simplifyLine(points, max = MAX_LINE_POINTS) {
  if (points.length <= max) return points;
  const result = [];
  const step = (points.length - 1) / (max - 1);
  for (let i = 0; i < max - 1; i++) result.push(points[Math.round(i * step)]);
  result.push(points[points.length - 1]);
  return result;
}

/** Valid [lon, lat] positions of a LineString, rounded to ~1 m, or []. */
function linePoints(geometry) {
  if (geometry?.type !== 'LineString' || !Array.isArray(geometry.coordinates))
    return [];
  const points = [];
  for (const position of geometry.coordinates) {
    if (!Array.isArray(position)) continue;
    const lon = Number(position[0]);
    const lat = Number(position[1]);
    if (!validLon(lon) || !validLat(lat)) continue;
    points.push([Math.round(lon * 1e5) / 1e5, Math.round(lat * 1e5) / 1e5]);
  }
  return points.length >= 2 ? points : [];
}

/** Great-circle length of a line in km. */
export function lineLengthKm(points) {
  const R = 6371.0088;
  const rad = Math.PI / 180;
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const [lon1, lat1] = points[i - 1];
    const [lon2, lat2] = points[i];
    const dLat = (lat2 - lat1) * rad;
    const dLon = (lon2 - lon1) * rad;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
    total += 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
  }
  return total;
}

/** "Länge: 5.01 km" in the description, when the feed states one. */
function statedLengthKm(lines) {
  for (const line of lines) {
    const match = /Länge:\s*([\d.,]+)\s*km/i.exec(line);
    if (match) {
      const km = Number(match[1].replace(',', '.'));
      if (Number.isFinite(km) && km >= 0) return km;
    }
  }
  return null;
}

function detailLines(description) {
  if (!Array.isArray(description)) return [];
  const lines = [];
  for (const raw of description) {
    const line = textOrNull(raw);
    if (!line) continue;
    lines.push(
      line.length > MAX_DETAIL_CHARS
        ? `${line.slice(0, MAX_DETAIL_CHARS - 1)}…`
        : line,
    );
    if (lines.length >= MAX_DETAIL_LINES) break;
  }
  return lines;
}

/** "A1 | Hamburg-Allermöhe - Hamburg-Südost" → the section after the road. */
function sectionTitle(title) {
  const text = textOrNull(title);
  if (!text) return null;
  const bar = text.indexOf('|');
  return bar >= 0 ? textOrNull(text.slice(bar + 1)) : text;
}

/** Feed timestamps are ISO strings; keep them as epoch ms. */
function timeOrNull(value) {
  if (typeof value !== 'string') return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Normalize one item, or return null when it is not a current, placeable
 * event of a known kind.
 */
export function normalizeAutobahnItem(item, road) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
  if (item.future === true || item.future === 'true') return null;
  const kind = KIND_BY_DISPLAY_TYPE[item.display_type];
  if (!kind) return null;
  const stableId = textOrNull(item.identifier);
  if (!stableId) return null;

  const line = linePoints(item.geometry);
  let lat = numberOrNull(item.coordinate?.lat);
  let lon = numberOrNull(item.coordinate?.long);
  if (!validLat(lat) || !validLon(lon)) {
    if (!line.length) return null;
    [lon, lat] = line[0];
  }

  const details = detailLines(item.description);
  const stated = statedLengthKm(details);
  const lengthKm =
    stated ?? (line.length ? Math.round(lineLengthKm(line) * 100) / 100 : null);

  return {
    stableId,
    road,
    kind,
    section: sectionTitle(item.title),
    direction: textOrNull(item.subtitle),
    lat,
    lon,
    line: simplifyLine(line),
    lengthKm,
    blocked: item.isBlocked === true || item.isBlocked === 'true',
    startTime: timeOrNull(item.startTimestamp),
    delayMinutes: numberOrNull(item.delayTimeValue),
    averageSpeedKmh: numberOrNull(item.averageSpeed),
    trafficType: textOrNull(item.abnormalTrafficType),
    details,
  };
}

/**
 * Normalize one road/service response (`{ closure: [...] }`). Returns null
 * when the payload is not that shape, so the caller can count the request as
 * failed; individually bad items are skipped.
 */
export function normalizeAutobahnServicePayload(road, service, payload) {
  if (!ROAD_PATTERN.test(road)) return null;
  if (!AUTOBAHN_EVENT_SERVICES.includes(service)) return null;
  const items = payload?.[service];
  if (!Array.isArray(items)) return null;
  const rows = [];
  for (const item of items) {
    const row = normalizeAutobahnItem(item, road);
    if (row) rows.push(row);
  }
  return rows;
}

/**
 * Merge per-request row lists, keeping the first row for each identifier (the
 * feed repeats an event on every road it touches), most disruptive kinds first.
 */
export function mergeAutobahnRows(lists) {
  const byId = new Map();
  for (const rows of lists) {
    for (const row of rows || []) {
      if (!byId.has(row.stableId)) byId.set(row.stableId, row);
    }
  }
  const rank = (kind) => AUTOBAHN_KINDS.indexOf(kind);
  return [...byId.values()].sort(
    (a, b) =>
      rank(a.kind) - rank(b.kind) ||
      AUTOBAHN_ROADS.indexOf(a.road) - AUTOBAHN_ROADS.indexOf(b.road) ||
      a.stableId.localeCompare(b.stableId),
  );
}
