/**
 * Plain-language presentation of Autobahn disruptions for the Nadelöhr shell.
 * Pure: rows in (see src/layers/autobahn/records.js), display models out.
 */
import { formatDate, formatNumber, msg, t, tn } from '../i18n/index.js';
import {
  AUTOBAHN_SEVERITIES,
  AUTOBAHN_SEVERITY_COLORS,
  autobahnSeverity,
} from '../layers/autobahn/records.js';
import { isScheduleLine, scheduleNow } from './schedule.js';

export {
  AUTOBAHN_SEVERITIES as SEVERITIES,
  AUTOBAHN_SEVERITY_COLORS as SEVERITY_COLORS,
  autobahnSeverity as severityOf,
};

const SEVERITY_COPY = Object.freeze({
  critical: { label: msg('Critical'), hint: msg('Roads closed') },
  major: { label: msg('Major'), hint: msg('Jams, accidents, hazards') },
  minor: { label: msg('Minor'), hint: msg('Exits and roadworks') },
});

/** "Critical" and its plain hint, translated. */
export function severityCopy(severity) {
  const copy = SEVERITY_COPY[severity] || SEVERITY_COPY.minor;
  return { label: t(copy.label), hint: t(copy.hint) };
}

/** Counts per severity, in severity order. */
export function severityCounts(rows = []) {
  const counts = Object.fromEntries(AUTOBAHN_SEVERITIES.map((s) => [s, 0]));
  for (const row of rows) counts[autobahnSeverity(row?.kind)] += 1;
  return AUTOBAHN_SEVERITIES.map((severity) => ({
    severity,
    count: counts[severity],
  }));
}

/** What each kind means to someone who just wants to drive. */
const KIND_COPY = Object.freeze({
  closure: {
    title: msg('Road closed'),
    hint: msg('The motorway is closed here. Plan a detour.'),
  },
  'ramp-closure': {
    title: msg('Exit or entry closed'),
    hint: msg('A junction ramp is closed. The motorway itself stays open.'),
  },
  warning: {
    title: msg('Traffic warning'),
    hint: msg('Slow or stopped traffic, an accident or a hazard ahead.'),
  },
  'short-roadworks': {
    title: msg('Short roadworks'),
    hint: msg('Roadworks for hours or days. Expect lane closures.'),
  },
  roadworks: {
    title: msg('Roadworks'),
    hint: msg('Long-term roadworks. Usually fewer or narrower lanes.'),
  },
});

/** Most disruptive first; used to sort lists and pick the headline. */
export const DISRUPTION_KINDS = Object.freeze([
  'closure',
  'ramp-closure',
  'warning',
  'short-roadworks',
  'roadworks',
]);

/** The short label for a kind ("Road closed"), translated. */
export function disruptionTitle(kind) {
  return t(KIND_COPY[kind]?.title || msg('Disruption'));
}

/** CSS colour for a kind: its severity's, as on the map. */
export function disruptionColor(kind) {
  return AUTOBAHN_SEVERITY_COLORS[autobahnSeverity(kind)];
}

/** Plural label for the summary chips: "10 closures". */
export function disruptionCountLabel(kind, count) {
  switch (kind) {
    case 'closure':
      return tn(count, '{count} road closed', '{count} roads closed');
    case 'ramp-closure':
      return tn(count, '{count} exit closed', '{count} exits closed');
    case 'warning':
      return tn(count, '{count} warning', '{count} warnings');
    case 'short-roadworks':
      return tn(count, '{count} short roadworks', '{count} short roadworks');
    default:
      return tn(count, '{count} roadworks', '{count} roadworks');
  }
}

/** Counts per kind, in disruption order, for the summary chips. */
export function disruptionSummary(rows = []) {
  const counts = new Map(DISRUPTION_KINDS.map((kind) => [kind, 0]));
  for (const row of rows)
    if (counts.has(row.kind)) counts.set(row.kind, counts.get(row.kind) + 1);
  return DISRUPTION_KINDS.map((kind) => ({ kind, count: counts.get(kind) }));
}

/** Most severe first, then by kind, the biggest delay, then the road. */
export function sortDisruptions(rows = []) {
  const rank = (kind) => {
    const index = DISRUPTION_KINDS.indexOf(kind);
    return index < 0 ? DISRUPTION_KINDS.length : index;
  };
  return [...rows].sort(
    (a, b) =>
      AUTOBAHN_SEVERITIES.indexOf(autobahnSeverity(a.kind)) -
        AUTOBAHN_SEVERITIES.indexOf(autobahnSeverity(b.kind)) ||
      rank(a.kind) - rank(b.kind) ||
      (b.delayMinutes || 0) - (a.delayMinutes || 0) ||
      String(a.road).localeCompare(String(b.road), 'en', { numeric: true }) ||
      String(a.stableId).localeCompare(String(b.stableId)),
  );
}

/** "A7 · Hamburg → Hannover" style one-liner for list rows. */
export function disruptionPlace(row) {
  return [row.section, row.direction].filter(Boolean).join(' · ');
}

/**
 * The place card for one event: title, where, a facts row like Apple Maps'
 * "Hours · Ratings · Distance", a plain hint, and the official lines.
 */
export function disruptionCard(row, now = Date.now()) {
  // When it applies, read from the notice; the card draws it as a bar.
  const schedule = scheduleNow(row.details, now);
  const facts = [];
  if (Number.isFinite(row.delayMinutes) && row.delayMinutes > 0)
    facts.push({
      key: 'delay',
      label: t('Delay'),
      value: t('+{minutes} min', { minutes: formatNumber(row.delayMinutes) }),
      emphasis: true,
    });
  if (Number.isFinite(row.lengthKm) && row.lengthKm > 0)
    facts.push({
      key: 'length',
      label: t('Length'),
      value: t('{length} km', {
        length: formatNumber(row.lengthKm, { maximumFractionDigits: 1 }),
      }),
    });
  if (Number.isFinite(row.averageSpeedKmh))
    facts.push({
      key: 'speed',
      label: t('Speed'),
      value: t('{speed} km/h', { speed: formatNumber(row.averageSpeedKmh) }),
    });
  if (Number.isFinite(row.startTime) && !schedule)
    facts.push({
      key: 'since',
      label: t('Since'),
      value: formatDate(row.startTime, {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }),
    });
  return {
    id: row.stableId,
    road: row.road,
    title: disruptionTitle(row.kind),
    kind: row.kind,
    color: disruptionColor(row.kind),
    place: row.section || '',
    direction: row.direction || '',
    hint: t(KIND_COPY[row.kind]?.hint || msg('Check the official notice.')),
    facts,
    schedule,
    // The notice without the dates the schedule bar already shows.
    details: (Array.isArray(row.details) ? row.details : [])
      .filter((line) => !schedule || !isScheduleLine(line))
      .slice(0, 6),
  };
}

const toRad = (deg) => (deg * Math.PI) / 180;
function distanceKm(lat1, lon1, lat2, lon2) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

/** How far truck parking may be from a disruption to be offered. */
export const NEAREST_PARKING_KM = 40;

/**
 * The closest rest area with truck spaces on the same Autobahn, not itself
 * blocked or next to a closure (`affected` ids): where a driver can wait or
 * plan a stop. Null when none is within NEAREST_PARKING_KM.
 * @returns {{row: object, km: number} | null}
 */
export function nearestParking(row, parking = [], affected = new Set()) {
  if (!row || !Number.isFinite(row.lat) || !Number.isFinite(row.lon))
    return null;
  let best = null;
  for (const area of parking) {
    if (area.road !== row.road || !(area.lorrySpaces > 0)) continue;
    if (area.blocked || affected.has(area.stableId)) continue;
    const km = distanceKm(row.lat, row.lon, area.lat, area.lon);
    if (km <= NEAREST_PARKING_KM && (!best || km < best.km))
      best = { row: area, km };
  }
  return best;
}
