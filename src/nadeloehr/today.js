/**
 * The "Today" view models: the number strip, the one highlighted message
 * and the corridor cards. Pure: Autobahn rows, gauge rows and scored
 * corridors in (src/freight/corridors.js), plain display models out.
 */
import { formatNumber, msg, t, tn } from '../i18n/index.js';
import { RISK_LEVEL_LABELS, RISK_PARTS } from '../freight/corridors.js';
import {
  GAUGE_COLORS,
  KAUB_BANDS,
  gaugeColor,
  kaubBand,
  kaubRow,
  levelDuring,
} from '../layers/riverLevels/records.js';
import { SEVERITY_COLORS } from './disruptions.js';
import {
  warningActive,
  warningLevelLabel,
  warningTitle,
  worstLevel,
} from './warnings.js';
import { WARNING_COLORS } from '../layers/weatherWarnings/records.js';

export const RISK_COLORS = Object.freeze({
  low: '#34c759',
  elevated: '#ff9500',
  high: '#ff3b30',
});
/** One plain sentence per score part, for the ⓘ in the breakdown. */
const PART_EXPLAIN = Object.freeze({
  C: msg(
    'Closed roads, traffic warnings and exit closures on this corridor. A closed road counts most; routine roadworks barely count.',
  ),
  P: msg(
    'How many truck spaces there are per 100 km at rest areas along the way, minus rest areas next to a closure. Fewer spaces means a higher score.',
  ),
  H: msg(
    'The Rhine water level at Kaub. Below 150 cm barges must leave cargo behind, so more freight moves to road; very high water stops shipping.',
  ),
  W: msg(
    'The strongest official DWD weather warning along the corridor: yellow 25, orange 50, red 75, dark red 100.',
  ),
});
export const LEVEL_EXPLAIN = msg(
  'Each part is scored 0–100 and weighted: closures 35%, truck parking 20%, water level 25%, weather 20%. Under 33 is low, 33 to 66 elevated, over 66 high. A rough guide, not a delay forecast.',
);
export const WATER_SCORE_EXPLAIN = msg(
  'How much the Kaub water level weighs on freight, from 0 (normal, 150–460 cm) up to 100 (40 cm or less, or shipping stopped). It is the water part of the Rhine corridor score.',
);

const PART_COLORS = Object.freeze({
  C: '#ff3b30',
  P: '#af52de',
  H: '#007aff',
  W: '#ffcc00',
});

const signed = (cm) =>
  `${cm > 0 ? '+' : cm < 0 ? '−' : '±'}${formatNumber(Math.abs(cm))}`;

/**
 * The strip's cards, left to right. Each may be tapped (see `action`).
 * `warnings` is null while the warnings layer is off.
 */
/** Does a warning apply during [from, to] (or at the instant when equal)? */
function warningIn(row, range) {
  if (!Array.isArray(range) || range[0] === range[1])
    return warningActive(row, range?.[0]);
  const [from, to] = range;
  return (
    (!Number.isFinite(row?.onset) || row.onset < to) &&
    (!Number.isFinite(row?.expires) || row.expires > from)
  );
}

/** Kaub's level for the horizon: the reading now, else the forecast low. */
function kaubLevelFor(kaub, range) {
  return kaub ? levelDuring(kaub, range || [Date.now(), Date.now()]) : null;
}

export function todayKpis(
  events = [],
  gauges = [],
  { warnings = null, horizon = 'now', range = null } = {},
) {
  const count = (kind) => events.filter((row) => row.kind === kind).length;
  const closures = events.filter((row) => row.kind === 'closure');
  const roads = new Set(closures.map((row) => row.road)).size;
  const kpis = [
    {
      id: 'closed',
      label: t('Roads closed'),
      value: formatNumber(closures.length),
      note: tn(roads, 'on {count} Autobahn', 'on {count} Autobahns'),
      color: SEVERITY_COLORS.critical,
      action: { severity: 'critical' },
    },
    {
      id: 'warnings',
      label: t('Traffic warnings'),
      value: formatNumber(count('warning')),
      note: t('jams, accidents, hazards'),
      color: SEVERITY_COLORS.major,
      action: { severity: 'major' },
    },
    {
      id: 'exits',
      label: t('Exits closed'),
      value: formatNumber(count('ramp-closure')),
      note: t('mostly planned works'),
      color: SEVERITY_COLORS.minor,
      action: { severity: 'minor' },
    },
  ];
  const kaub = kaubRow(gauges);
  if (kaub) {
    const later = horizon !== 'now';
    const level = later ? kaubLevelFor(kaub, range) : kaub.levelCm;
    kpis.push({
      id: 'kaub',
      label: later ? t('Kaub · forecast') : t('Kaub · Rhine'),
      value: Number.isFinite(level) ? formatNumber(level) : '–',
      unit: t('cm'),
      note: later
        ? Number.isFinite(level)
          ? t('lowest forecast level')
          : t('no forecast for this time')
        : Number.isFinite(kaub.trendCm)
          ? t('{change} cm in 24 h', { change: signed(kaub.trendCm) })
          : t(KAUB_BANDS[kaubBand(kaub.levelCm)]?.label || msg('Water level')),
      color: Number.isFinite(level)
        ? gaugeColor({ ...kaub, levelCm: level })
        : GAUGE_COLORS.unknown,
      series: later
        ? (kaub.forecast || [])
            .filter(([at]) => !range || (at >= range[0] && at <= range[1]))
            .map(([, v]) => v)
        : Array.isArray(kaub.series)
          ? kaub.series.map(([, v]) => v)
          : [],
      action: { gauge: kaub },
    });
  }
  if (gauges.length) {
    const low = gauges.filter((row) => row.state === 'low').length;
    kpis.push({
      id: 'gauges',
      label: t('River gauges low'),
      value: formatNumber(low),
      unit: `/ ${formatNumber(gauges.length)}`,
      note: t('below mean low water'),
      color: GAUGE_COLORS.low,
      action: { rivers: true },
    });
  }
  if (Array.isArray(warnings)) {
    const now = warnings.filter((row) => warningIn(row, range));
    const worst = worstLevel(now);
    kpis.push({
      id: 'weather',
      label: t('Weather warnings'),
      value: formatNumber(now.length),
      note: worst
        ? t('highest: {level}', {
            level: warningLevelLabel({ level: worst }).toLowerCase(),
          })
        : horizon === 'now'
          ? t('none in force')
          : t('none expected'),
      color: worst ? WARNING_COLORS[worst] : '#34c759',
      action: { warnings: true },
    });
  }
  return kpis;
}

/**
 * The one message that matters most today: very low or high water at Kaub,
 * else the riskiest corridor, else a calm line.
 */
export function todayHeadline(
  gauges = [],
  scored = [],
  { warnings = [], horizon = 'now', range = null } = {},
) {
  const kaub = kaubRow(gauges);
  const kaubLevel =
    horizon === 'now' ? (kaub?.levelCm ?? null) : kaubLevelFor(kaub, range);
  const band = Number.isFinite(kaubLevel) ? kaubBand(kaubLevel) : null;
  const top = scored.find((entry) => Number.isFinite(entry.score));
  const corridorLine = top
    ? t('{corridor} is {level} ({score}/100).', {
        corridor: corridorTitle(top.corridor),
        level: t(RISK_LEVEL_LABELS[top.level]).toLowerCase(),
        score: formatNumber(top.score),
      })
    : '';
  if (
    kaub &&
    ['very-low', 'low', 'high-water', 'shipping-stopped'].includes(band)
  ) {
    const high = band === 'high-water' || band === 'shipping-stopped';
    return {
      tone: 'alert',
      title: high
        ? t('Rhine high water at Kaub: {level} cm', {
            level: formatNumber(kaubLevel),
          })
        : t('Rhine low water at Kaub: {level} cm', {
            level: formatNumber(kaubLevel),
          }),
      body: [t(KAUB_BANDS[band].hint), corridorLine].filter(Boolean).join(' '),
      gauge: kaub,
    };
  }
  // Severe or extreme weather on a corridor (or anywhere) comes next.
  const severe = (Array.isArray(warnings) ? warnings : []).filter(
    (row) =>
      (row.level === 'severe' || row.level === 'extreme') &&
      warningIn(row, range),
  );
  if (severe.length) {
    const first = severe[0];
    const onCorridor = scored.find((entry) =>
      entry.warnings?.some((row) => row.stableId === first.stableId),
    );
    return {
      tone: 'alert',
      title: t('{level}: {event}', {
        level: warningLevelLabel(first),
        event: warningTitle(first),
      }),
      body: onCorridor
        ? t('It crosses the {corridor} corridor.', {
            corridor: corridorTitle(onCorridor.corridor),
          })
        : t('Check the warning areas on the map before you set off.'),
      warning: first,
    };
  }
  if (top && top.level !== 'low')
    return {
      tone: top.level === 'high' ? 'alert' : 'notice',
      title: t('{corridor} is {level}', {
        corridor: corridorTitle(top.corridor),
        level: t(RISK_LEVEL_LABELS[top.level]).toLowerCase(),
      }),
      body: partWhy(top, top.parts[0]),
      corridorId: top.corridor.id,
    };
  return {
    tone: 'calm',
    title: t('Freight is moving normally'),
    body: corridorLine || t('No major closures on the watched corridors.'),
  };
}

/** "Hamburg → Dortmund". */
export const corridorTitle = (corridor) => `${corridor.from} → ${corridor.to}`;

/** Why one part of a corridor's score is what it is, in plain words. */
export function partWhy(entry, part) {
  if (!part.available)
    return part.key === 'P'
      ? t('Turn on truck parking to include it.')
      : t('Turn on weather warnings to include them.');
  if (part.key === 'P') {
    const p = entry.parking || {};
    return t(
      '{usable} of {total} truck spaces usable at {areas} rest areas ({perKm} per 100 km)',
      {
        usable: formatNumber(p.usableSpaces ?? 0),
        total: formatNumber(p.totalSpaces ?? 0),
        areas: formatNumber(p.restAreas ?? 0),
        perKm: formatNumber(p.perHundredKm ?? 0),
      },
    );
  }
  if (part.key === 'C') {
    const c = entry.counts || {};
    return t(
      '{closed} closed, {warnings} warnings, {exits} exits closed on {roads}',
      {
        closed: formatNumber(c.closure || 0),
        warnings: formatNumber(c.warning || 0),
        exits: formatNumber(c['ramp-closure'] || 0),
        roads: entry.corridor.roads?.length
          ? entry.corridor.roads.join(', ')
          : t('the route'),
      },
    );
  }
  if (part.key === 'H') return t('Kaub gauge on the Middle Rhine');
  if (part.key === 'W') {
    const [worst] = entry.warnings || [];
    return worst
      ? t('{event}: {level} along the corridor', {
          event: warningTitle(worst),
          level: warningLevelLabel(worst).toLowerCase(),
        })
      : t('No DWD warnings along the corridor');
  }
  return '';
}

/** A corridor card and its breakdown. */
export function corridorView(entry) {
  const parts = entry.parts.map((part) => ({
    key: part.key,
    label: t(RISK_PARTS[part.key]),
    value: part.value,
    available: part.available,
    weight: Math.round(part.weight * 100),
    color: PART_COLORS[part.key],
    // Share of the bar: this part's contribution to the score.
    share: part.available ? part.value * part.weight : 0,
    why: partWhy(entry, part),
    explain: t(PART_EXPLAIN[part.key]),
  }));
  const driver = [...parts]
    .filter((part) => part.available)
    .sort((a, b) => b.share - a.share)[0];
  return {
    id: entry.corridor.id,
    title: corridorTitle(entry.corridor),
    name: t(entry.corridor.name),
    roads: entry.corridor.roads || [],
    states: entry.corridor.states || [],
    river: entry.corridor.river ? t('Rhine') : null,
    score: entry.score,
    level: entry.level,
    levelLabel: entry.level ? t(RISK_LEVEL_LABELS[entry.level]) : '',
    color: RISK_COLORS[entry.level] || '#8e8e93',
    parts,
    driver:
      driver && driver.share > 0
        ? t('Mostly {part}', { part: driver.label.toLowerCase() })
        : t('Nothing notable'),
    missing: parts.filter((part) => !part.available).map((part) => part.label),
  };
}
