/**
 * Nadelöhr's search: an Autobahn ("A7"), a river gauge ("Kaub"), a corridor
 * ("Rhein") or a place, Germany first. Places come from Photon (OSM,
 * keyless) with a proximity bias on Germany and German names, so "Köln"
 * finds Cologne rather than a look-alike abroad.
 */
import {
  normalizeToponym,
  normalizePhotonFeature,
} from '../keylessGeocoder.js';
import { CORRIDORS } from '../freight/corridors.js';

const PHOTON = 'https://photon.komoot.io/api/';
const GERMANY_CENTER = Object.freeze({ lat: 51.1, lon: 10.45 });
const PHOTON_LANGS = new Set(['de', 'en', 'fr']);
const ROAD = /^\s*a\s*-?\s*(\d{1,3})\s*$/i;

/** "a 7", "A-7", "a7" → "A7"; anything else → null. */
export function autobahnQuery(text) {
  const match = ROAD.exec(String(text || ''));
  return match ? `A${Number(match[1])}` : null;
}

/** Results that need no network: roads, gauges and corridors. */
export function localResults(text, { events = [], gauges = [] } = {}) {
  const results = [];
  const road = autobahnQuery(text);
  if (road)
    results.push({
      type: 'road',
      id: `road:${road}`,
      road,
      count: events.filter((row) => row.road === road).length,
    });
  const needle = normalizeToponym(text);
  if (needle.length < 2) return results;
  for (const gauge of gauges) {
    if (normalizeToponym(gauge.name).startsWith(needle))
      results.push({ type: 'gauge', id: `gauge:${gauge.stableId}`, gauge });
    if (results.length >= 4) break;
  }
  const rhine = ['rhein', 'rhine', 'rhin', 'reno'].some((word) =>
    word.startsWith(needle),
  );
  for (const corridor of CORRIDORS) {
    const names = [corridor.from, corridor.to].map(normalizeToponym);
    if (
      (rhine && corridor.river === 'RHEIN') ||
      names.some((n) => n === needle)
    )
      results.push({
        type: 'corridor',
        id: `corridor:${corridor.id}`,
        corridor,
      });
  }
  return results;
}

/** Photon's URL: Germany-biased, in the reader's language where it has one. */
export function placeSearchUrl(text, locale = 'de') {
  const url = new URL(PHOTON);
  url.searchParams.set('q', String(text).trim());
  url.searchParams.set('limit', '8');
  url.searchParams.set('lat', String(GERMANY_CENTER.lat));
  url.searchParams.set('lon', String(GERMANY_CENTER.lon));
  const lang = String(locale).slice(0, 2);
  url.searchParams.set('lang', PHOTON_LANGS.has(lang) ? lang : 'en');
  return url.toString();
}

/** Places for a query: German ones first, duplicates by name and area dropped. */
export async function searchPlacesDE(
  text,
  {
    locale = 'de',
    signal,
    fetchImpl = (...args) => globalThis.fetch(...args),
  } = {},
) {
  const query = String(text || '').trim();
  if (query.length < 2 || autobahnQuery(query)) return [];
  const response = await fetchImpl(placeSearchUrl(query, locale), { signal });
  if (!response.ok) return [];
  const data = await response.json();
  const features = Array.isArray(data?.features) ? data.features : [];
  const seen = new Set();
  const places = [];
  // Stable sort: Germany first, Photon's own ranking within each group.
  const ordered = [...features].sort(
    (a, b) =>
      Number(b?.properties?.countrycode === 'DE') -
      Number(a?.properties?.countrycode === 'DE'),
  );
  for (const feature of ordered) {
    const place = normalizePhotonFeature(feature);
    if (!place) continue;
    const key = `${place.name}|${place.label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    places.push({ type: 'place', id: `place:${key}`, place });
    if (places.length >= 5) break;
  }
  return places;
}
