/**
 * Plain-language presentation of Autobahn disruptions for the Nadelöhr shell.
 * Pure: rows in (see src/layers/autobahn/records.js), display models out.
 */
import { formatDate, formatNumber, msg, t, tn } from '../i18n/index.js';

/** What each kind means to someone who just wants to drive. */
const KIND_COPY = Object.freeze({
  closure: {
    title: msg('Road closed'),
    hint: msg('The motorway is closed here. Plan a detour.'),
    color: 'var(--status-closure)',
  },
  'ramp-closure': {
    title: msg('Exit or entry closed'),
    hint: msg('A junction ramp is closed. The motorway itself stays open.'),
    color: 'var(--status-ramp)',
  },
  warning: {
    title: msg('Traffic warning'),
    hint: msg('Slow or stopped traffic, an accident or a hazard ahead.'),
    color: 'var(--status-warning)',
  },
  'short-roadworks': {
    title: msg('Short roadworks'),
    hint: msg('Roadworks for hours or days. Expect lane closures.'),
    color: 'var(--status-shortwork)',
  },
  roadworks: {
    title: msg('Roadworks'),
    hint: msg('Long-term roadworks. Usually fewer or narrower lanes.'),
    color: 'var(--status-roadworks)',
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

/** CSS colour for a kind, matching the map markers. */
export function disruptionColor(kind) {
  return KIND_COPY[kind]?.color || 'var(--muted-foreground)';
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

/** Most disruptive first, then the biggest delay, then the road. */
export function sortDisruptions(rows = []) {
  const rank = (kind) => {
    const index = DISRUPTION_KINDS.indexOf(kind);
    return index < 0 ? DISRUPTION_KINDS.length : index;
  };
  return [...rows].sort(
    (a, b) =>
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
export function disruptionCard(row) {
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
  if (Number.isFinite(row.startTime))
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
    details: Array.isArray(row.details) ? row.details.slice(0, 6) : [],
  };
}
