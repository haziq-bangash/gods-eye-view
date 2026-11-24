/**
 * Push alerts for pinned roads and places (portable: no Vue, no DOM).
 *
 * A subscriber has pins (Autobahns and places) and may opt in to Kaub. Each
 * check turns the current closures and the Kaub level into "items" with
 * stable keys; items whose key the subscriber has not been told about yet
 * become notifications. The first check after subscribing only records what
 * is already there, so nobody gets a burst of old closures.
 *
 * Used by the server (validating subscriptions) and by
 * scripts/send-alerts.mjs (the scheduled check).
 */
import { distanceToPathKm } from './corridors.js';
import { kaubBand } from '../layers/riverLevels/records.js';

/** Closures this close to a pinned place count for it (as in the panel). */
export const ALERT_PLACE_RADIUS_KM = 30;
export const MAX_ALERT_PINS = 20;
/** Notifications per subscriber per check; more become one summary. */
export const MAX_ALERTS_PER_CHECK = 3;

const ROAD = /^A\d{1,3}$/;
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
  /^[a-z0-9-]+\.push\.services\.mozilla\.com$/,
  /^web\.push\.apple\.com$/,
  /^[a-z0-9-]+\.notify\.windows\.com$/,
  /^android\.googleapis\.com$/,
];
const B64URL = /^[A-Za-z0-9_-]+={0,2}$/;

/** A browser push subscription we are willing to store, or null. */
export function normalizePushSubscription(value) {
  const endpoint = String(value?.endpoint || '');
  let url;
  try {
    url = new URL(endpoint);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || endpoint.length > 1024) return null;
  if (!PUSH_HOSTS.some((host) => host.test(url.hostname))) return null;
  const p256dh = String(value?.keys?.p256dh || '');
  const auth = String(value?.keys?.auth || '');
  if (!B64URL.test(p256dh) || p256dh.length > 200) return null;
  if (!B64URL.test(auth) || auth.length > 100) return null;
  return { endpoint, keys: { p256dh, auth } };
}

/** Pins as stored for alerts: { roads, places } with limits applied. */
export function normalizeAlertPins(value) {
  const roads = [
    ...new Set(
      (Array.isArray(value?.roads) ? value.roads : [])
        .map(String)
        .filter((road) => ROAD.test(road)),
    ),
  ].slice(0, MAX_ALERT_PINS);
  const places = (Array.isArray(value?.places) ? value.places : [])
    .filter(
      (place) =>
        place &&
        typeof place.name === 'string' &&
        Number.isFinite(place.lat) &&
        Number.isFinite(place.lon) &&
        Math.abs(place.lat) <= 90 &&
        Math.abs(place.lon) <= 180,
    )
    .map((place) => ({
      id: String(place.id || `${place.lat},${place.lon}`).slice(0, 120),
      name: place.name.trim().slice(0, 80),
      lat: Math.round(place.lat * 1e4) / 1e4,
      lon: Math.round(place.lon * 1e4) / 1e4,
    }))
    .slice(0, MAX_ALERT_PINS - roads.length);
  return { roads, places };
}

const ACTIVE = (row) => row?.kind === 'closure' && row.future !== true;
const where = (row) =>
  [row.road, row.section].filter(Boolean).join(' ') || row.road || '';

const COPY = {
  en: {
    roadTitle: (road) => `${road} closed`,
    placeTitle: (name) => `Road closed near ${name}`,
    kaubTitle: (cm) => `Kaub now ${cm} cm`,
    kaub: {
      'shipping-stopped': 'Shipping stopped on the Rhine.',
      'high-water': 'High water: barges sail slowly and with limits.',
      'very-low': 'Very low water: barges carry a fraction of their load.',
      low: 'Low water: barges carry much less.',
      reduced: 'Reduced loads for barges.',
      normal: 'Back to normal for barges.',
    },
    summaryTitle: (count) => `${count} new closures on your roads and places`,
    summaryBody: 'Open Nadelöhr for the details.',
  },
  de: {
    roadTitle: (road) => `${road} gesperrt`,
    placeTitle: (name) => `Sperrung nahe ${name}`,
    kaubTitle: (cm) => `Pegel Kaub jetzt ${cm} cm`,
    kaub: {
      'shipping-stopped': 'Schifffahrt auf dem Rhein eingestellt.',
      'high-water': 'Hochwasser: Schiffe fahren langsam und mit Auflagen.',
      'very-low':
        'Sehr niedriger Pegel: Schiffe laden nur noch einen Bruchteil.',
      low: 'Niedriger Pegel: Schiffe laden deutlich weniger.',
      reduced: 'Schiffe fahren mit verringerter Ladung.',
      normal: 'Wieder normale Bedingungen für Schiffe.',
    },
    summaryTitle: (count) =>
      `${count} neue Sperrungen auf deinen Strecken und Orten`,
    summaryBody: 'Öffne Nadelöhr für die Details.',
  },
};
const copyFor = (locale) =>
  String(locale || '').startsWith('de') ? COPY.de : COPY.en;

/**
 * Everything that currently applies to a subscriber, keyed:
 * Map<key, { title, body, url }>.
 */
export function alertItems(sub, { events = [], kaubLevelCm = null } = {}) {
  const copy = copyFor(sub.locale);
  const items = new Map();
  const roads = new Set(sub.pins?.roads || []);
  const closures = events.filter(ACTIVE);
  for (const row of closures) {
    if (!roads.has(row.road)) continue;
    items.set(`c:${row.stableId}`, {
      title: copy.roadTitle(row.road),
      body: [row.section, row.direction].filter(Boolean).join(' · '),
      url: '/map',
    });
  }
  for (const place of sub.pins?.places || []) {
    for (const row of closures) {
      if (roads.has(row.road)) continue; // Already told as a road alert.
      if (!Number.isFinite(row.lat) || !Number.isFinite(row.lon)) continue;
      const km = distanceToPathKm(
        [row.lon, row.lat],
        [
          [place.lon, place.lat],
          [place.lon, place.lat],
        ],
      );
      if (km > ALERT_PLACE_RADIUS_KM) continue;
      items.set(`p:${place.id}:${row.stableId}`, {
        title: copy.placeTitle(place.name),
        body: [where(row), row.direction].filter(Boolean).join(' · '),
        url: '/map',
      });
    }
  }
  if (sub.kaub && Number.isFinite(kaubLevelCm)) {
    const band = kaubBand(kaubLevelCm);
    if (band)
      items.set(`k:${band}`, {
        title: copy.kaubTitle(Math.round(kaubLevelCm)),
        body: copy.kaub[band] || '',
        url: '/map',
      });
  }
  return items;
}

/**
 * The notifications to send and what to remember. `seen` is the list of
 * keys from the last check, or null for a new subscriber (whose first
 * check only records). Kaub alerts when its band changes, not on the first
 * reading.
 */
export function nextAlerts(sub, current) {
  const keys = [...current.keys()];
  if (!Array.isArray(sub.seen)) return { send: [], seen: keys };
  const seen = new Set(sub.seen);
  const fresh = keys.filter((key) => !seen.has(key));
  const hadKaub = sub.seen.some((key) => key.startsWith('k:'));
  const send = fresh
    .filter((key) => !key.startsWith('k:') || hadKaub)
    .map((key) => ({ key, ...current.get(key) }));
  if (send.length <= MAX_ALERTS_PER_CHECK) return { send, seen: keys };
  const copy = copyFor(sub.locale);
  const closures = send.filter((item) => !item.key.startsWith('k:'));
  const kaub = send.filter((item) => item.key.startsWith('k:'));
  return {
    send: [
      {
        key: 'summary',
        title: copy.summaryTitle(closures.length),
        body: copy.summaryBody,
        url: '/map',
      },
      ...kaub,
    ],
    seen: keys,
  };
}
