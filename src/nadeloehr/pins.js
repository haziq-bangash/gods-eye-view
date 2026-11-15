/**
 * "Mine": the Autobahns and places a reader pinned, kept in this browser,
 * and what applies to each right now (or tonight, tomorrow). The summary is
 * pure: pins and rows in, plain lines out.
 */
import { ref, watch } from 'vue';
import { formatNumber, t, tn } from '../i18n/index.js';
import { warningCovers } from '../layers/weatherWarnings/records.js';
import { severityOf } from './disruptions.js';
import { warningLevelLabel, warningTitle } from './warnings.js';

const KEY = 'nadeloehr.pins.v1';
/** Closures and warnings this close to a pinned place count for it. */
export const PLACE_RADIUS_KM = 30;

function read() {
  try {
    const value = JSON.parse(globalThis.localStorage?.getItem(KEY) || '{}');
    return {
      roads: Array.isArray(value.roads)
        ? value.roads.filter((road) => /^A\d{1,3}$/.test(road))
        : [],
      places: Array.isArray(value.places)
        ? value.places.filter(
            (place) =>
              place &&
              typeof place.name === 'string' &&
              Number.isFinite(place.lat) &&
              Number.isFinite(place.lon),
          )
        : [],
    };
  } catch {
    return { roads: [], places: [] };
  }
}

const pins = ref(read());
watch(
  pins,
  (value) => {
    try {
      globalThis.localStorage?.setItem(KEY, JSON.stringify(value));
    } catch {
      /* Private mode or full storage: the pins last for this visit. */
    }
  },
  { deep: true },
);

/** The pins and the verbs that change them. */
export function usePins() {
  return {
    pins,
    hasPins: () => pins.value.roads.length + pins.value.places.length > 0,
    isRoadPinned: (road) => pins.value.roads.includes(road),
    isPlacePinned: (place) =>
      pins.value.places.some((pin) => pin.id === placeId(place)),
    pinRoad(road) {
      if (!pins.value.roads.includes(road))
        pins.value = { ...pins.value, roads: [...pins.value.roads, road] };
    },
    unpinRoad(road) {
      pins.value = {
        ...pins.value,
        roads: pins.value.roads.filter((pinned) => pinned !== road),
      };
    },
    pinPlace(place) {
      const pin = toPin(place);
      if (!pin || pins.value.places.some((p) => p.id === pin.id)) return;
      pins.value = { ...pins.value, places: [...pins.value.places, pin] };
    },
    unpinPlace(id) {
      pins.value = {
        ...pins.value,
        places: pins.value.places.filter((pin) => pin.id !== id),
      };
    },
  };
}

/** A stable id for a place: its name and position to ~100 m. */
export function placeId(place) {
  const lat = Number(place?.lat);
  const lon = Number(place?.lng ?? place?.lon);
  return `${place?.name || ''}@${lat.toFixed(3)},${lon.toFixed(3)}`;
}

/** The stored form of a search result's place. */
export function toPin(place) {
  const lat = Number(place?.lat);
  const lon = Number(place?.lng ?? place?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !place?.name)
    return null;
  return { id: placeId(place), name: String(place.name), lat, lon };
}

function distanceKm([lon1, lat1], [lon2, lat2]) {
  const k = Math.PI / 180;
  const x = (lon2 - lon1) * k * Math.cos(((lat1 + lat2) / 2) * k);
  return Math.hypot(x, (lat2 - lat1) * k) * 6371;
}

/** "2 closed · 1 warning", or null when nothing critical or major. */
function eventLine(rows) {
  const closed = rows.filter((row) => severityOf(row.kind) === 'critical');
  const major = rows.filter((row) => severityOf(row.kind) === 'major');
  const parts = [];
  if (closed.length)
    parts.push(tn(closed.length, '{count} closure', '{count} closures'));
  if (major.length)
    parts.push(tn(major.length, '{count} warning', '{count} warnings'));
  return parts.length ? parts.join(' · ') : null;
}

/**
 * One line per pin: what applies to it, and a tone (alert when something
 * critical or a severe warning applies, notice for lesser, calm when clear).
 */
export function pinSummary(value, { events = [], warnings = [] } = {}) {
  const items = [];
  for (const road of value.roads) {
    const rows = events.filter((row) => row.road === road);
    const line = eventLine(rows);
    items.push({
      type: 'road',
      key: `road:${road}`,
      road,
      title: road,
      line: line || t('No closures or warnings'),
      tone: rows.some((row) => severityOf(row.kind) === 'critical')
        ? 'alert'
        : line
          ? 'notice'
          : 'calm',
    });
  }
  for (const place of value.places) {
    const point = [place.lon, place.lat];
    const near = events.filter(
      (row) =>
        Number.isFinite(row.lat) &&
        Number.isFinite(row.lon) &&
        distanceKm(point, [row.lon, row.lat]) <= PLACE_RADIUS_KM,
    );
    const line = eventLine(near);
    const over = warnings.filter((row) => warningCovers(row, point));
    const weather = over[0]
      ? `${warningTitle(over[0])}: ${warningLevelLabel(over[0]).toLowerCase()}`
      : null;
    const parts = [
      line &&
        t('{events} within {km} km', {
          events: line,
          km: formatNumber(PLACE_RADIUS_KM),
        }),
      weather,
    ].filter(Boolean);
    items.push({
      type: 'place',
      key: `place:${place.id}`,
      place,
      title: place.name,
      line: parts.join(' · ') || t('Nothing nearby'),
      tone:
        near.some((row) => severityOf(row.kind) === 'critical') ||
        over.some((row) => row.level === 'severe' || row.level === 'extreme')
          ? 'alert'
          : parts.length
            ? 'notice'
            : 'calm',
    });
  }
  return items;
}
