/** Card model and colours for one selected Autobahn event. Pure — no Cesium types. */

import { t, formatNumber, formatDate } from '../../i18n/index.js';
import {
  AUTOBAHN_SEVERITY_COLORS,
  autobahnKindLabel,
  autobahnSeverity,
} from './records.js';

export const AUTOBAHN_OVERLAY_SOURCE_ID = 'autobahn-traffic';

/** Marker/line CSS colour for a row kind: its severity's colour. */
export function autobahnAccent(kind) {
  return AUTOBAHN_SEVERITY_COLORS[autobahnSeverity(kind)];
}

/** Feed description lines shown on the card (German, as published). */
const CARD_DETAIL_LINES = 4;

function factsLine(row) {
  const facts = [];
  if (Number.isFinite(row.lengthKm) && row.lengthKm > 0)
    facts.push(
      t('{length} km', {
        length: formatNumber(row.lengthKm, { maximumFractionDigits: 1 }),
      }),
    );
  if (Number.isFinite(row.delayMinutes) && row.delayMinutes > 0)
    facts.push(
      t('+{minutes} min delay', { minutes: formatNumber(row.delayMinutes) }),
    );
  if (Number.isFinite(row.averageSpeedKmh))
    facts.push(
      t('avg {speed} km/h', { speed: formatNumber(row.averageSpeedKmh) }),
    );
  if (Number.isFinite(row.startTime))
    facts.push(
      t('since {time}', {
        time: formatDate(row.startTime, {
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        }),
      }),
    );
  return facts.length ? facts.join(' · ') : null;
}

/**
 * Build the overlay-host entry for one selected event. The caller supplies
 * `position` (Cartesian) separately — this model stays JSON-safe for tests.
 * @param {Object} row - Normalized event row (see records.js).
 * @returns {Object} World-overlay entry without `position`.
 */
export function buildAutobahnCard(row) {
  const label = autobahnKindLabel(row.kind);
  const kind = label ? t(label) : row.kind;
  const details = [];
  if (row.section) details.push(row.section);
  if (row.direction) details.push(row.direction);
  const facts = factsLine(row);
  if (facts) details.push(facts);
  for (const line of (row.details || []).slice(0, CARD_DETAIL_LINES))
    details.push(line);
  details.push(t('Informational only · follow official signs'));
  return {
    id: `autobahn-card:${row.stableId}`,
    selected: true,
    interactive: false,
    title: `${row.road} · ${kind.toUpperCase()}`,
    details,
    accent: autobahnAccent(row.kind),
    priority: Number.MAX_SAFE_INTEGER,
    gapPx: 15,
    verticalOnly: true,
    placement: 'above',
  };
}
