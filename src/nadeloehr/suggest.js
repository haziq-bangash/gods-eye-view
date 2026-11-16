/**
 * Suggestions while typing. German cities come from a bundled list and show
 * at the first letter; the place search (Photon) adds the rest when it
 * answers. Pure: no Vue, no DOM.
 */
import { normalizeToponym } from '../keylessGeocoder.js';
import { GERMAN_CITIES } from './germanCitiesData.js';

/** Most suggestions shown at once. */
export const SUGGESTIONS_MAX = 6;

/** A bundled city as the search's place result. */
function cityResult(city) {
  return {
    type: 'place',
    id: `city:${city.name}`,
    instant: true,
    place: {
      name: city.name,
      label: city.name,
      lat: city.lat,
      lng: city.lon,
      types: ['locality'],
    },
  };
}

/**
 * Bundled German cities whose name (German or English) starts with the
 * text, or has a word that does ("Main" finds Frankfurt am Main); biggest
 * first.
 */
export function cityMatches(text, limit = SUGGESTIONS_MAX) {
  const needle = normalizeToponym(text);
  if (!needle) return [];
  const starts = [];
  const words = [];
  for (const city of GERMAN_CITIES) {
    const names = [city.name, ...city.alt].map(normalizeToponym);
    if (names.some((name) => name.startsWith(needle))) starts.push(city);
    else if (
      needle.length >= 3 &&
      names.some((name) =>
        name.split(/\s+/).some((word) => word.startsWith(needle)),
      )
    )
      words.push(city);
  }
  return [...starts, ...words].slice(0, limit).map(cityResult);
}

const near = (a, b) =>
  Math.abs(a.lat - b.lat) < 0.15 && Math.abs(a.lng - b.lng) < 0.2;

/**
 * Instant results first, then the place search's, without the same city
 * twice (a search result near a bundled city of the same name is that city).
 */
export function mergeSuggestions(instant, found, limit = SUGGESTIONS_MAX) {
  const out = [...instant];
  for (const result of found) {
    const place = result.place;
    const twin =
      place &&
      out.some(
        (other) =>
          other.place &&
          normalizeToponym(other.place.name) === normalizeToponym(place.name) &&
          near(other.place, place),
      );
    if (!twin) out.push(result);
  }
  return out.slice(0, limit);
}

/** The next highlighted index for an arrow key, wrapping; -1 is none. */
export function moveActive(index, count, step) {
  if (!count) return -1;
  if (index < 0) return step > 0 ? 0 : count - 1;
  return (index + step + count) % count;
}
