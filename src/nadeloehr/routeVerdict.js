/**
 * A checked route's answer in plain words: does a truck get through for the
 * chosen time, and what is in the way. Pure: the scored route, its
 * alternatives and the truck bans in; a headline and lines out.
 */
import { distanceToPathKm } from '../freight/corridors.js';
import {
  WARNING_LEVELS,
  WARNING_LEVEL_LABELS,
  warningGroup,
} from '../layers/weatherWarnings/records.js';
import { formatDate, formatNumber, t, tn } from '../i18n/index.js';
import { disruptionPlace } from './disruptions.js';
import { scheduleNow } from './schedule.js';

/** An alternative counts as avoiding a closure when it stays this far away. */
export const DETOUR_CLEAR_KM = 3;
/** Traffic warnings listed one by one, most first. */
export const TRAFFIC_LINES_MAX = 5;
/** Weather from this DWD level up is a problem; below it, a note. */
const PROBLEM_LEVEL = WARNING_LEVELS.indexOf('moderate');

const clock = (ms) => formatDate(ms, { hour: '2-digit', minute: '2-digit' });

/** "1 h 5 min", "35 min". */
export function durationText(seconds) {
  const minutes = Math.max(0, Math.round(seconds / 60));
  const hours = Math.floor(minutes / 60);
  return hours
    ? t('{hours} h {minutes} min', {
        hours: formatNumber(hours),
        minutes: formatNumber(minutes % 60),
      })
    : t('{minutes} min', { minutes: formatNumber(minutes) });
}

/**
 * The quickest alternative that keeps clear of every closure, and how much
 * longer it takes: { summary, extraS, geometry } or null.
 */
export function detourAround(route, closures) {
  if (!closures.length || !Array.isArray(route?.alternatives)) return null;
  const clear = route.alternatives
    .filter((other) =>
      closures.every(
        (row) =>
          distanceToPathKm([row.lon, row.lat], other.geometry) >
          DETOUR_CLEAR_KM,
      ),
    )
    .sort((a, b) => a.durationS - b.durationS);
  const best = clear[0];
  if (!best) return null;
  return {
    summary: best.summary || '',
    extraS: Math.max(0, best.durationS - route.durationS),
    geometry: best.geometry,
  };
}

/** How far to either side of a closure a forced way round passes. */
export const DETOUR_OFFSET_KM = 20;

/**
 * Two points DETOUR_OFFSET_KM to either side of a closure, square to the
 * route there ([lon, lat] each), for routing a way round through when the
 * router's own alternatives all pass the closure. Null when the closure is
 * not near the route.
 */
export function detourVias(path, closure, offsetKm = DETOUR_OFFSET_KM) {
  if (!Array.isArray(path) || path.length < 2) return null;
  const point = [closure?.lon, closure?.lat];
  if (!point.every(Number.isFinite)) return null;
  const kx = 111 * Math.cos((point[1] * Math.PI) / 180);
  const ky = 111;
  const km = ([lon, lat]) => [lon * kx, lat * ky];
  const here = km(point);
  let nearest = 0;
  let best = Infinity;
  path.forEach((p, i) => {
    const [x, y] = km(p);
    const d = Math.hypot(x - here[0], y - here[1]);
    if (d < best) {
      best = d;
      nearest = i;
    }
  });
  if (distanceToPathKm(point, path) > DETOUR_CLEAR_KM) return null;
  // The route's heading over ~5 km either side of the closure.
  const along = (step) => {
    let i = nearest;
    let walked = 0;
    while (i + step >= 0 && i + step < path.length && walked < 5) {
      const [x1, y1] = km(path[i]);
      i += step;
      const [x2, y2] = km(path[i]);
      walked += Math.hypot(x2 - x1, y2 - y1);
    }
    return km(path[i]);
  };
  const [ax, ay] = along(-1);
  const [bx, by] = along(1);
  const length = Math.hypot(bx - ax, by - ay);
  if (!length) return null;
  const [nx, ny] = [-(by - ay) / length, (bx - ax) / length];
  return [1, -1].map((side) => [
    Math.round(((here[0] + side * nx * offsetKm) / kx) * 1e5) / 1e5,
    Math.round(((here[1] + side * ny * offsetKm) / ky) * 1e5) / 1e5,
  ]);
}

/** When a closure applies, from its notice: "22:00–05:00", or ''. */
function closureWhen(row, now) {
  const schedule = scheduleNow(row.details, now);
  if (!schedule?.from || !schedule?.to) return '';
  const sameDay =
    formatDate(schedule.from, { day: 'numeric' }) ===
    formatDate(schedule.to, { day: 'numeric' });
  const from =
    schedule.active || sameDay
      ? clock(schedule.from)
      : formatDate(schedule.from, {
          weekday: 'short',
          hour: '2-digit',
          minute: '2-digit',
        });
  return `${from}–${clock(schedule.to)}`;
}

/**
 * @param {object} input
 * @param {object} input.route - { durationS, alternatives?: [...] }
 * @param {object} input.scored - scoreRoute()'s result for the chosen time.
 * @param {?object} input.bans - banNotice() for the route's states.
 * @param {string} [input.horizon] - 'now' | 'tonight' | 'tomorrow'.
 * @param {number} [input.now]
 * @param {boolean} [input.detourPending] - A way round is being routed.
 * @param {boolean} [input.weatherChecked] - False while the warnings layer
 *   is off, so the verdict says the weather was not looked at.
 * @returns {{tone: 'clear'|'caution'|'blocked', problems: number,
 *   headline: string, lines: object[], detour: ?object}}
 */
export function routeVerdict({
  route,
  scored,
  bans = null,
  horizon = 'now',
  now = Date.now(),
  weatherChecked = true,
  detourPending = false,
}) {
  const lines = [];
  const events = scored?.events || [];
  const closures = events.filter((row) => row.kind === 'closure');
  const detour = detourAround(route, closures);

  for (const row of closures) {
    const when = closureWhen(row, now);
    lines.push({
      kind: 'closure',
      problem: true,
      row,
      title: t('{road} closed', { road: row.road || t('Road') }),
      detail: [disruptionPlace(row), when].filter(Boolean).join(' · '),
    });
  }
  if (closures.length)
    lines.push({
      kind: 'detour',
      problem: false,
      title:
        detourPending && !detour
          ? t('Looking for a way round…')
          : detour
            ? detour.summary
              ? t('Way round via {roads}: +{time}', {
                  roads: detour.summary,
                  time: durationText(detour.extraS),
                })
              : t('A way round takes +{time}', {
                  time: durationText(detour.extraS),
                })
            : t('No way round found'),
      detail:
        detourPending && !detour
          ? ''
          : detour
            ? t(
                'Avoids the closure completely, by car. The signed diversion may be shorter.',
              )
            : t('Follow the signed diversion.'),
    });

  // Jams and accidents are only news for the moment they are reported.
  // Together they count as one problem; each gets a line to open.
  const traffic =
    horizon === 'now' ? events.filter((row) => row.kind === 'warning') : [];
  traffic.slice(0, TRAFFIC_LINES_MAX).forEach((row, index) =>
    lines.push({
      kind: 'traffic',
      problem: index === 0,
      row,
      title: t('{road}: traffic warning', { road: row.road || t('Road') }),
      detail: disruptionPlace(row),
    }),
  );

  for (const ban of bans?.active || [])
    lines.push({
      kind: 'ban',
      problem: true,
      title: t('Truck ban: {name}', { name: ban.label }),
      detail: ban.body,
    });

  const weather = (scored?.warnings || []).filter(
    (row) => WARNING_LEVELS.indexOf(row.level) >= PROBLEM_LEVEL,
  );
  const seen = new Set();
  for (const row of weather) {
    const key = `${row.level}|${row.group}`;
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push({
      kind: 'weather',
      problem: true,
      level: row.level,
      title: `${t(WARNING_LEVEL_LABELS[row.level])}: ${t(warningGroup(row.group).label)}`,
      detail: row.headline || '',
    });
    if (seen.size >= 3) break;
  }

  // Without the warnings layer there is nothing to check the weather with.
  if (!weatherChecked)
    lines.push({
      kind: 'weather-off',
      problem: false,
      title: t('Weather not checked'),
      detail: t('Turn on weather warnings to include them.'),
    });

  if (!bans?.active?.length && bans?.next)
    lines.push({
      kind: 'next-ban',
      problem: false,
      title: t('Next truck ban: {when}', { when: bans.next.when }),
      detail: bans.next.body,
    });

  const problems = lines.filter((line) => line.problem).length;
  const blocked = closures.length > 0 || Boolean(bans?.active?.length);
  const WHEN = {
    now: t('Right now'),
    tonight: t('Tonight'),
    tomorrow: t('Tomorrow'),
  };
  const when = WHEN[horizon] || WHEN.now;
  return {
    tone: blocked ? 'blocked' : problems ? 'caution' : 'clear',
    problems,
    headline: problems
      ? tn(
          problems,
          '{when}: {count} problem on the way',
          '{when}: {count} problems on the way',
          {
            when,
            count: formatNumber(problems),
          },
        )
      : t('{when}: clear run', { when }),
    lines,
    detour,
  };
}
