/**
 * Plain-language presentation of DWD weather warnings for the Nadelöhr
 * shell. Pure: rows in (see src/layers/weatherWarnings/records.js), models
 * out. The official text stays German and is shown as such.
 */
import { formatDate, t } from '../i18n/index.js';
import {
  WARNING_COLORS,
  WARNING_LEVELS,
  WARNING_LEVEL_LABELS,
  warningGroup,
} from '../layers/weatherWarnings/records.js';

const WHEN = { weekday: 'short', hour: '2-digit', minute: '2-digit' };

/** "Wind" — the event group in plain words. */
export const warningTitle = (row) => t(warningGroup(row?.group).label);

/** "Strong weather warning" — DWD's level in plain words. */
export const warningLevelLabel = (row) =>
  t(WARNING_LEVEL_LABELS[row?.level] || WARNING_LEVEL_LABELS.minor);

export const warningColor = (row) =>
  WARNING_COLORS[row?.level] || WARNING_COLORS.minor;

/** "Now until Sun 20:00" / "Sun 08:00 – Sun 20:00". */
export function warningWindow(row, now = Date.now()) {
  const until = Number.isFinite(row?.expires)
    ? formatDate(row.expires, WHEN)
    : null;
  if (!Number.isFinite(row?.onset) || row.onset <= now)
    return until ? t('Now until {time}', { time: until }) : t('Now');
  const from = formatDate(row.onset, WHEN);
  return until
    ? t('{from} – {until}', { from, until })
    : t('From {time}', { time: from });
}

/** Whether a warning is in force at `now`. */
export const warningActive = (row, now = Date.now()) =>
  (!Number.isFinite(row?.onset) || row.onset <= now) &&
  (!Number.isFinite(row?.expires) || row.expires > now);

/** The worst level among rows, or null. */
export function worstLevel(rows = []) {
  let worst = -1;
  for (const row of rows)
    worst = Math.max(worst, WARNING_LEVELS.indexOf(row?.level));
  return worst < 0 ? null : WARNING_LEVELS[worst];
}

/** One selected warning, laid out like the other cards. */
export function warningCard(row, now = Date.now()) {
  return {
    id: row.stableId,
    title: warningTitle(row),
    level: warningLevelLabel(row),
    color: warningColor(row),
    when: warningWindow(row, now),
    hint: t(warningGroup(row.group).hint),
    event: row.event,
    headline: row.headline,
    description: row.description,
    instruction: row.instruction,
  };
}
