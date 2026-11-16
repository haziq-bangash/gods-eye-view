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
import { parseCoordinateQuery } from '../search/coordinateParser.js';
import { msg, t } from '../i18n/index.js';

const PHOTON = 'https://photon.komoot.io/api/';
const GERMANY_CENTER = Object.freeze({ lat: 51.1, lon: 10.45 });
const PHOTON_LANGS = new Set(['de', 'en', 'fr']);
const ROAD = /^\s*a\s*-?\s*(\d{1,3})\s*$/i;

/**
 * "Hamburg → München", "Hamburg -> München", "Hamburg nach München",
 * "Hamburg to Munich", "Hamburg – München": [from, to], else null. A plain
 * hyphen needs spaces around it, so "Duisburg-Ruhrort" stays one place.
 */
export function routeQuery(text) {
  const match =
    /^\s*(.+?)\s*(?:→|->|—|–|\s-\s|\snach\s|\sto\s|\sbis\s)\s*(.+?)\s*$/i.exec(
      String(text || ''),
    );
  if (!match) return null;
  const [, from, to] = match;
  return from.length >= 2 && to.length >= 2 ? [from, to] : null;
}

const COORDINATES = msg('Coordinates');

/**
 * Coordinates as a place result: decimal or degrees-minutes-seconds pairs,
 * UTM and MGRS grid references, plus codes and geo: links, as a dispatcher
 * might send a depot's position. Null for anything else.
 */
export function coordinateResult(text) {
  const point = parseCoordinateQuery(String(text || ''));
  if (!point) return null;
  return {
    type: 'place',
    id: `coord:${point.lat.toFixed(5)},${point.lon.toFixed(5)}`,
    instant: true,
    place: {
      name: point.label,
      label: t(COORDINATES),
      lat: point.lat,
      lng: point.lon,
      types: ['coordinates'],
    },
  };
}

/** "a 7", "A-7", "a7" → "A7"; anything else → null. */
export function autobahnQuery(text) {
  const match = ROAD.exec(String(text || ''));
  return match ? `A${Number(match[1])}` : null;
}

/** Results that need no network: roads, gauges and corridors. */
export function localResults(text, { events = [], gauges = [] } = {}) {
  const results = [];
  const coordinates = coordinateResult(text);
  if (coordinates) return [coordinates];
  const trip = routeQuery(text);
  if (trip)
    return [
      {
        type: 'route',
        id: `route:${trip.join('|')}`,
        from: trip[0],
        to: trip[1],
      },
    ];
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

/** Settlement size order; anything that is not a settlement comes after. */
const PLACE_RANK = Object.freeze({
  city: 0,
  town: 1,
  municipality: 2,
  borough: 2,
  suburb: 3,
  village: 4,
  quarter: 5,
  hamlet: 6,
});
const placeRank = (feature) =>
  feature?.properties?.osm_key === 'place'
    ? (PLACE_RANK[feature.properties.osm_value] ?? 5)
    : 5;

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
  if (
    query.length < 2 ||
    autobahnQuery(query) ||
    routeQuery(query) ||
    coordinateResult(query)
  )
    return [];
  const response = await fetchImpl(placeSearchUrl(query, locale), { signal });
  if (!response.ok) return [];
  const data = await response.json();
  const features = Array.isArray(data?.features) ? data.features : [];
  const seen = new Set();
  const places = [];
  // Stable sort: Germany first, then bigger settlements (so "München"
  // is Munich, not a hamlet near the middle of the map), then Photon's own
  // ranking.
  const ordered = [...features].sort(
    (a, b) =>
      Number(b?.properties?.countrycode === 'DE') -
        Number(a?.properties?.countrycode === 'DE') ||
      placeRank(a) - placeRank(b),
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
