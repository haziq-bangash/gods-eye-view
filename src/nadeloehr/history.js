/**
 * Corridor risk over time, from the hourly history the GitHub Action
 * records (scripts/record-corridor-history.mjs). Pure: the history file and
 * a corridor id in, a 7-day series and a plain comparison out.
 */
import { formatNumber, t } from '../i18n/index.js';

/** Where the hourly history lives (the `history` branch of this fork). */
export const CORRIDOR_HISTORY_URL =
  'https://raw.githubusercontent.com/haziq-bangash/gods-eye-view/history/corridor-history.json';

const DAY_MS = 86_400_000;

/** [timeMs, score] for one corridor over the last `days`, oldest first. */
export function corridorSeries(
  history,
  id,
  { days = 7, now = Date.now() } = {},
) {
  const rows = Array.isArray(history?.rows) ? history.rows : [];
  return rows
    .map((row) => [Date.parse(row?.t), row?.corridors?.[id]?.score])
    .filter(
      ([at, score]) =>
        Number.isFinite(at) &&
        Number.isFinite(score) &&
        now - at <= days * DAY_MS,
    )
    .sort((a, b) => a[0] - b[0]);
}

/** The median score of a series, or null with too little data to say. */
export function usualScore(series, { minimum = 12 } = {}) {
  if (series.length < minimum) return null;
  const scores = series.map(([, score]) => score).sort((a, b) => a - b);
  const middle = Math.floor(scores.length / 2);
  return scores.length % 2
    ? scores[middle]
    : Math.round((scores[middle - 1] + scores[middle]) / 2);
}

/** "Higher than usual (typical 34)" — or why there is no comparison yet. */
export function comparedToUsual(score, series) {
  const usual = usualScore(series);
  if (usual === null || !Number.isFinite(score))
    return {
      tone: 'neutral',
      text: t('History builds up hourly; a comparison follows after a day.'),
    };
  const diff = score - usual;
  const typical = formatNumber(usual);
  if (diff >= 10)
    return {
      tone: 'up',
      text: t('Higher than usual (typically {usual})', { usual: typical }),
    };
  if (diff <= -10)
    return {
      tone: 'down',
      text: t('Lower than usual (typically {usual})', { usual: typical }),
    };
  return {
    tone: 'same',
    text: t('About usual (typically {usual})', { usual: typical }),
  };
}
