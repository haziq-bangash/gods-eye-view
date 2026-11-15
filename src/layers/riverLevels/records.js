import { msg } from '../../i18n/marker.js';

/**
 * Rhine and Elbe water levels from PEGELONLINE (WSV, open data, no key).
 * The proxy fetches one bulk station list and a 24-hour series for a fixed
 * set of freight gauges, so the client never chooses a URL.
 */
export const PEGELONLINE_BASE =
  'https://www.pegelonline.wsv.de/webservices/rest-api/v2';
export const RIVER_WATERS = Object.freeze(['RHEIN', 'ELBE']);

/** The bulk station list with each gauge's latest water level (W). */
export const PEGELONLINE_STATIONS_URL = `${PEGELONLINE_BASE}/stations.json?waters=${RIVER_WATERS.join(',')}&includeTimeseries=true&includeCurrentMeasurement=true&timeseries=W`;

/** The last day of W readings for one station, by its PEGELONLINE uuid. */
export const pegelMeasurementsUrl = (uuid) =>
  `${PEGELONLINE_BASE}/stations/${encodeURIComponent(uuid)}/W/measurements.json?start=P1D`;

/** Kaub: the shallowest point of the Middle Rhine and the freight benchmark. */
export const KAUB = 'KAUB';

/**
 * Gauges barge operators watch, upstream to downstream. Only these get a
 * 24-hour trend (one extra request each), and they are drawn larger.
 */
export const KEY_GAUGES = Object.freeze([
  'MAXAU',
  'MANNHEIM',
  'MAINZ',
  KAUB,
  'KOBLENZ',
  'KÖLN',
  'DUISBURG-RUHRORT',
  'EMMERICH',
  'DRESDEN',
  'MAGDEBURG-STROMBRÜCKE',
  'WITTENBERGE',
]);
const KEY_SET = new Set(KEY_GAUGES);

export const RIVER_NAMES = Object.freeze({
  RHEIN: msg('Rhine'),
  ELBE: msg('Elbe'),
});

/** Level states against the gauge's mean low and mean high water. */
export const GAUGE_STATES = Object.freeze(['low', 'normal', 'high', 'unknown']);

/**
 * Reference levels at Kaub in cm. Marks I and II are WSV's published
 * high-water marks; the low-water steps are common freight rules of thumb
 * around the equivalent water level (GlW, 77 cm). Reference values, not
 * navigation advice.
 */
export const KAUB_LEVELS = Object.freeze({
  shippingStopped: 640,
  highWater: 460,
  reducedLoads: 150,
  lowWater: 100,
  veryLowWater: 78,
  severe: 40,
});

/** Kaub bands, most to least severe, with plain-language labels. */
export const KAUB_BANDS = Object.freeze({
  'shipping-stopped': {
    label: msg('Shipping stopped'),
    hint: msg('Above high-water mark II: barges may not sail.'),
  },
  'high-water': {
    label: msg('High water'),
    hint: msg('Above high-water mark I: barges sail slowly and with limits.'),
  },
  'very-low': {
    label: msg('Very low water'),
    hint: msg(
      'Below the equivalent water level: barges carry a fraction of their load.',
    ),
  },
  low: {
    label: msg('Low water'),
    hint: msg('Barges load well below capacity, and freight costs rise.'),
  },
  reduced: {
    label: msg('Reduced loads'),
    hint: msg('Large barges start to leave cargo behind.'),
  },
  normal: {
    label: msg('Normal'),
    hint: msg('Barges can load normally.'),
  },
});

const finite = (value) => (Number.isFinite(value) ? value : null);

/** The Kaub band for a level in cm (null when unknown). */
export function kaubBand(levelCm) {
  if (!Number.isFinite(levelCm)) return null;
  const L = KAUB_LEVELS;
  if (levelCm >= L.shippingStopped) return 'shipping-stopped';
  if (levelCm >= L.highWater) return 'high-water';
  if (levelCm < L.veryLowWater) return 'very-low';
  if (levelCm < L.lowWater) return 'low';
  if (levelCm < L.reducedLoads) return 'reduced';
  return 'normal';
}

/**
 * The hydrology sub-score H (0–100) from the Kaub level: 0 between reduced
 * loads and high water, rising linearly to 100 at the severe low level and
 * at high-water mark II.
 */
export function kaubHydrologyScore(levelCm) {
  if (!Number.isFinite(levelCm)) return null;
  const L = KAUB_LEVELS;
  let score = 0;
  if (levelCm < L.reducedLoads)
    score = ((L.reducedLoads - levelCm) / (L.reducedLoads - L.severe)) * 100;
  else if (levelCm >= L.highWater)
    score =
      60 + ((levelCm - L.highWater) / (L.shippingStopped - L.highWater)) * 40;
  return Math.round(Math.min(100, Math.max(0, score)));
}

/** "DUISBURG-RUHRORT" → "Duisburg-Ruhrort"; mixed-case names are kept. */
export function gaugeDisplayName(name) {
  const text = String(name || '').trim();
  if (!text || text !== text.toUpperCase()) return text;
  return text
    .toLowerCase()
    .replace(
      /(^|[\s\-/.(])(\p{L})/gu,
      (_, gap, letter) => gap + letter.toUpperCase(),
    );
}

function gaugeState(raw) {
  return raw === 'low' || raw === 'normal' || raw === 'high' ? raw : 'unknown';
}

/**
 * Plain rows from the PEGELONLINE bulk station list. Stations without a
 * position or a current W reading are skipped.
 */
export function normalizePegelStations(payload) {
  if (!Array.isArray(payload)) throw new Error('Malformed PEGELONLINE payload');
  const rows = [];
  const seen = new Set();
  for (const station of payload) {
    const id = typeof station?.uuid === 'string' ? station.uuid : '';
    const lat = finite(station?.latitude);
    const lon = finite(station?.longitude);
    const water = station?.water?.shortname;
    if (!id || seen.has(id) || lat === null || lon === null) continue;
    if (!RIVER_WATERS.includes(water)) continue;
    const series = Array.isArray(station.timeseries)
      ? station.timeseries.find((entry) => entry?.shortname === 'W')
      : null;
    const current = series?.currentMeasurement;
    const levelCm = finite(current?.value);
    const measuredAt = Date.parse(current?.timestamp);
    if (levelCm === null || !Number.isFinite(measuredAt)) continue;
    seen.add(id);
    const shortname = String(station.shortname || '').toUpperCase();
    rows.push({
      stableId: id,
      shortname,
      name: gaugeDisplayName(station.longname || station.shortname),
      water,
      km: finite(station.km),
      lat,
      lon,
      levelCm,
      measuredAt,
      state: gaugeState(current.stateMnwMhw),
      outdated: current.stateMnwMhw === 'out-dated',
      key: KEY_SET.has(shortname),
      trendCm: null,
    });
  }
  // Downstream order within each river, Rhine first.
  rows.sort(
    (a, b) =>
      RIVER_WATERS.indexOf(a.water) - RIVER_WATERS.indexOf(b.water) ||
      (a.km ?? 0) - (b.km ?? 0),
  );
  return rows;
}

/**
 * The change in cm over the series (latest minus the first reading at least
 * 18 hours older); null when the series is too short to say.
 */
export function levelTrend(measurements) {
  if (!Array.isArray(measurements)) return null;
  const points = measurements
    .map((entry) => ({
      at: Date.parse(entry?.timestamp),
      value: finite(entry?.value),
    }))
    .filter(({ at, value }) => Number.isFinite(at) && value !== null)
    .sort((a, b) => a.at - b.at);
  if (points.length < 2) return null;
  const last = points.at(-1);
  const first = points[0];
  if (last.at - first.at < 18 * 60 * 60 * 1000) return null;
  return Math.round(last.value - first.value);
}

/** Rising, falling or steady from a 24-hour change in cm. */
export function trendDirection(trendCm) {
  if (!Number.isFinite(trendCm)) return null;
  if (trendCm >= 3) return 'rising';
  if (trendCm <= -3) return 'falling';
  return 'steady';
}

/** The Kaub row of a list, if present. */
export function kaubRow(rows) {
  return Array.isArray(rows)
    ? rows.find((row) => row?.shortname === KAUB) || null
    : null;
}

/** Marker colours (Apple system colours) by level state and Kaub band. */
export const GAUGE_COLORS = Object.freeze({
  low: '#ff9500',
  normal: '#007aff',
  high: '#af52de',
  unknown: '#8e8e93',
  'shipping-stopped': '#ff3b30',
  'high-water': '#af52de',
  'very-low': '#ff3b30',
  reduced: '#ffcc00',
});

/** One gauge's colour: Kaub by its freight band, others by level state. */
export function gaugeColor(row) {
  const band = row?.shortname === KAUB ? kaubBand(row.levelCm) : null;
  if (band) return GAUGE_COLORS[band];
  return GAUGE_COLORS[row?.state] || GAUGE_COLORS.unknown;
}

/**
 * Hourly [timeMs, levelCm] points from a measurement series, oldest first:
 * enough for a 24-hour chart without sending all 96 readings.
 */
export function hourlySeries(measurements) {
  if (!Array.isArray(measurements)) return [];
  const byHour = new Map();
  for (const entry of measurements) {
    const at = Date.parse(entry?.timestamp);
    const value = finite(entry?.value);
    if (!Number.isFinite(at) || value === null) continue;
    byHour.set(Math.floor(at / 3_600_000), [at, value]);
  }
  return [...byHour.values()].sort((a, b) => a[0] - b[0]);
}

/** The official water-level forecast (BfG, published by PEGELONLINE as WV). */
export const pegelForecastUrl = (uuid) =>
  `${PEGELONLINE_BASE}/stations/${encodeURIComponent(uuid)}/WV/measurements.json?start=P0D&end=P4D`;

/**
 * Forecast points as [timeMs, levelCm, isEstimate], oldest first. Beyond the
 * forecast the BfG publishes lower-confidence estimates, flagged here.
 */
export function forecastSeries(points) {
  if (!Array.isArray(points)) return [];
  return points
    .map((entry) => [
      Date.parse(entry?.timestamp),
      finite(entry?.value),
      entry?.type === 'estimate',
    ])
    .filter(([at, value]) => Number.isFinite(at) && value !== null)
    .sort((a, b) => a[0] - b[0]);
}

/**
 * A gauge's level for a time range: the current reading for "now" (an
 * instant), else the lowest forecast value inside the range — the level
 * that limits barges. Null when the forecast does not cover the range.
 */
export function levelDuring(row, [from, to]) {
  if (from === to) return finite(row?.levelCm);
  const inside = (Array.isArray(row?.forecast) ? row.forecast : []).filter(
    ([at]) => at >= from && at <= to,
  );
  return inside.length ? Math.min(...inside.map(([, value]) => value)) : null;
}
