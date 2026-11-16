/**
 * Real delays for the timetable trains, from Deutsche Bahn's Timetables API
 * (DB InfraGO, CC BY 4.0). It answers per station: `/plan` has the planned
 * stops of one hour, `/fchg` every known change (expected times and
 * cancellations). A planned stop matched to one of our trains at the same
 * station, the same scheduled minute and the same category gives that
 * train's delay and its real train number. Portable: no Node, Vue or Cesium.
 */
import { berlinTime } from './horizon.js';

/**
 * Major stations most long-distance trains pass, by DB's name (what the
 * Timetables API's station search finds).
 */
export const DELAY_HUBS = Object.freeze([
  'Hamburg Hbf',
  'Hannover Hbf',
  'Bremen Hbf',
  'Berlin Hbf',
  'Leipzig Hbf',
  'Dresden Hbf',
  'Erfurt Hbf',
  'Kassel-Wilhelmshöhe',
  'Fulda',
  'Frankfurt(Main)Hbf',
  'Frankfurt(M) Flughafen Fernbf',
  'Mannheim Hbf',
  'Karlsruhe Hbf',
  'Stuttgart Hbf',
  'Ulm Hbf',
  'München Hbf',
  'Augsburg Hbf',
  'Nürnberg Hbf',
  'Würzburg Hbf',
  'Köln Hbf',
  'Düsseldorf Hbf',
  'Duisburg Hbf',
  'Essen Hbf',
  'Dortmund Hbf',
  'Bielefeld Hbf',
  'Osnabrück Hbf',
  'Mainz Hbf',
  'Koblenz Hbf',
  'Göttingen',
  'Freiburg(Breisgau) Hbf',
]);

/** Where gtfs.de names a hub differently from DB. */
export const HUB_ALIASES = Object.freeze({
  'Erfurt Hbf': Object.freeze(['Erfurt, Hauptbahnhof']),
  'Freiburg(Breisgau) Hbf': Object.freeze([
    'Freiburg Hauptbahnhof',
    'Freiburg, Hauptbahnhof',
  ]),
});

/** Every station-name key under which a hub may appear in the timetable. */
export const hubKeys = (hub) =>
  [hub, ...(HUB_ALIASES[hub] || [])].map((name) => stationKey(name));

/** Station names compared without spaces, case or brackets. */
export const stationKey = (name) =>
  String(name || '')
    .toLowerCase()
    .replace(/[\s()]/g, '');

const attributes = (text) => {
  const out = {};
  for (const [, key, value] of String(text).matchAll(/([\w-]+)="([^"]*)"/g))
    out[key] = value
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');
  return out;
};

/** "2611161037" (Berlin time) as an instant, or null. */
export function timetableTime(value) {
  const match = /^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(String(value));
  if (!match) return null;
  const [, yy, mm, dd, hh, mi] = match.map(Number);
  return berlinTime(2000 + yy, mm, dd, hh, mi);
}

/**
 * The stops of a `/plan` or `/fchg` answer by stop id: the train's category
 * and number (plan only), and for arrival and departure the planned time,
 * the changed time and the changed status ("c" is cancelled).
 * @returns {Map<string, {category?: string, number?: string,
 *   ar?: {pt: number|null, ct: number|null, cs: string|null},
 *   dp?: {pt: number|null, ct: number|null, cs: string|null}}>}
 */
export function parseTimetableXml(xml) {
  const stops = new Map();
  for (const [, head, body] of String(xml).matchAll(
    /<s\b([^>]*?)(?:\/>|>([\s\S]*?)<\/s>)/g,
  )) {
    const { id } = attributes(head);
    if (!id) continue;
    const stop = {};
    for (const [, tag, attrs] of String(body || '').matchAll(
      /<(tl|ar|dp)\b([^>]*?)\/?>/g,
    )) {
      const a = attributes(attrs);
      if (tag === 'tl') {
        stop.category = String(a.c || '').toUpperCase();
        stop.number = String(a.n || '');
      } else
        stop[tag] = {
          pt: timetableTime(a.pt),
          ct: timetableTime(a.ct),
          cs: a.cs || null,
        };
    }
    stops.set(id, stop);
  }
  return stops;
}

/** The eva number of the station named `name` in a `/station` answer. */
export function parseStationEva(xml, name) {
  const want = stationKey(name);
  let first = null;
  for (const [, attrs] of String(xml).matchAll(/<station\b([^>]*?)\/?>/g)) {
    const a = attributes(attrs);
    if (!/^\d{7}$/.test(a.eva || '')) continue;
    if (stationKey(a.name) === want) return a.eva;
    first ??= a.eva;
  }
  return first;
}

/** Long-distance categories that may be written differently in the two sources. */
const SAME_CATEGORY = [
  ['EC', 'ECE'],
  ['NJ', 'EN'],
  ['RJ', 'RJX'],
];
const sameCategory = (a, b) =>
  a === b || SAME_CATEGORY.some((pair) => pair.includes(a) && pair.includes(b));

/**
 * One station's observations matched to our trains. `calls` are our trains'
 * scheduled stops at that station: `{id, category, arrival, departure}` as
 * instants. Planned stops come from `/plan` (category, number, planned
 * times) and are updated by `/fchg` (expected times, cancellation).
 * @returns {Array<{id: string, number: string, delay: number,
 *   cancelled: boolean, at: number}>} delay in seconds; `at` is the
 *   scheduled time of the observed stop
 */
export function matchStation(calls, planned, changes) {
  const out = [];
  const used = new Set();
  for (const [stopId, plan] of planned) {
    if (!plan.category) continue;
    const change = changes.get(stopId) || {};
    const event = plan.dp?.pt ? 'dp' : 'ar';
    const scheduled = plan[event]?.pt;
    if (!scheduled) continue;
    const call = calls.find(
      (row) =>
        !used.has(row.id) &&
        sameCategory(row.category, plan.category) &&
        Math.abs((event === 'dp' ? row.departure : row.arrival) - scheduled) <
          60_000,
    );
    if (!call) continue;
    used.add(call.id);
    const expected = change[event]?.ct ?? plan[event]?.ct ?? null;
    const status = change[event]?.cs ?? plan[event]?.cs ?? null;
    out.push({
      id: call.id,
      number: `${plan.category} ${plan.number}`.trim(),
      delay: expected ? Math.round((expected - scheduled) / 1000) : 0,
      cancelled: status === 'c',
      at: scheduled,
    });
  }
  return out;
}

/**
 * The one delay per train to show: the observation whose scheduled time is
 * closest to now, so a train that has left a hub carries the delay it left
 * with until the next hub reports.
 */
export function pickDelays(observations, now) {
  const best = new Map();
  for (const row of observations) {
    const previous = best.get(row.id);
    if (!previous || Math.abs(row.at - now) < Math.abs(previous.at - now))
      best.set(row.id, row);
  }
  const out = {};
  for (const [id, { number, delay, cancelled }] of best)
    out[id] = { number, delay, cancelled };
  return out;
}
