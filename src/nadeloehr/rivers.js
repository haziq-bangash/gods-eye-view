/**
 * Plain-language presentation of Rhine and Elbe gauges for the Nadelöhr
 * shell. Pure: rows in (see src/layers/riverLevels/records.js), models out.
 */
import { formatDate, formatNumber, msg, t } from '../i18n/index.js';
import {
  KAUB,
  KAUB_BANDS,
  RIVER_NAMES,
  gaugeColor,
  kaubBand,
  kaubRow,
  trendDirection,
} from '../layers/riverLevels/records.js';

const STATE_COPY = Object.freeze({
  low: {
    label: msg('Low'),
    hint: msg('Below the mean low water at this gauge.'),
  },
  normal: {
    label: msg('Normal'),
    hint: msg('Between the mean low and mean high water at this gauge.'),
  },
  high: {
    label: msg('High'),
    hint: msg('Above the mean high water at this gauge.'),
  },
  unknown: {
    label: msg('No reference'),
    hint: msg(
      'This gauge has no mean levels to compare with, often because of the tide.',
    ),
  },
});

const TREND_COPY = Object.freeze({
  rising: msg('Rising'),
  falling: msg('Falling'),
  steady: msg('Steady'),
});

/** "59 cm". */
export const levelText = (levelCm) =>
  t('{level} cm', { level: formatNumber(levelCm) });

const signed = (cm) =>
  `${cm > 0 ? '+' : cm < 0 ? '−' : '±'}${formatNumber(Math.abs(cm))}`;

/** "+12 cm in 24 h" / "−5 cm in 24 h" / null. */
export function trendText(trendCm) {
  if (!Number.isFinite(trendCm)) return null;
  return t('{change} cm in 24 h', { change: signed(trendCm) });
}

/** "−5 cm", for a fact already headed "Last 24 h". */
export function trendChange(trendCm) {
  if (!Number.isFinite(trendCm)) return null;
  return t('{level} cm', { level: signed(trendCm) });
}

/** The river's name in the reader's language. */
export const riverName = (water) => t(RIVER_NAMES[water] || water || '');

/** Status label and hint: Kaub by its freight band, others by level state. */
export function gaugeStatus(row) {
  if (row?.shortname === KAUB) {
    const band = kaubBand(row.levelCm);
    if (band)
      return {
        label: t(KAUB_BANDS[band].label),
        hint: t(KAUB_BANDS[band].hint),
        band,
      };
  }
  const copy = STATE_COPY[row?.state] || STATE_COPY.unknown;
  return { label: t(copy.label), hint: t(copy.hint), band: null };
}

/** The home panel's headline: Kaub's level, band and trend, if reported. */
export function kaubSummary(rows) {
  const row = kaubRow(rows);
  if (!row) return null;
  const status = gaugeStatus(row);
  return {
    row,
    level: levelText(row.levelCm),
    status: status.label,
    hint: status.hint,
    color: gaugeColor(row),
    trend: trendText(row.trendCm),
    direction: trendDirection(row.trendCm),
  };
}

/** Key gauges (bar Kaub) for the home list, Rhine then Elbe, downstream. */
export function keyGauges(rows) {
  return Array.isArray(rows)
    ? rows.filter((row) => row?.key && row.shortname !== KAUB)
    : [];
}

/** One selected gauge, laid out like the disruption card. */
export function gaugeCard(row) {
  const status = gaugeStatus(row);
  const facts = [
    {
      key: 'level',
      label: t('Water level'),
      value: levelText(row.levelCm),
      emphasis: status.band !== null && status.band !== 'normal',
    },
  ];
  const direction = trendDirection(row.trendCm);
  if (direction)
    facts.push({
      key: direction,
      label: t('Last 24 h'),
      value: trendChange(row.trendCm),
    });
  if (Number.isFinite(row.measuredAt))
    facts.push({
      key: 'measured',
      label: t('Measured'),
      value: formatDate(row.measuredAt, { hour: '2-digit', minute: '2-digit' }),
    });
  return {
    id: row.stableId,
    title: row.name,
    river: riverName(row.water),
    km: Number.isFinite(row.km)
      ? t('River km {km}', {
          km: formatNumber(row.km, { maximumFractionDigits: 1 }),
        })
      : '',
    status: status.label,
    hint: status.hint,
    color: gaugeColor(row),
    isKaub: row.shortname === KAUB,
    trend: direction ? t(TREND_COPY[direction]) : null,
    outdated: row.outdated === true,
    facts,
  };
}
