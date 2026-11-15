/**
 * Time in German freight terms: "now", "tonight" and "tomorrow" as ranges of
 * Europe/Berlin time, and the validity schedules Autobahn GmbH writes into
 * its German notices ("17.11.26 von 06:00 bis 07:00 Uhr", "Jeden Montag …
 * zwischen dem … und dem … von 20:00 bis 05:00 Uhr"). Portable: no DOM,
 * Node or catalogs.
 */
import { msg } from '../i18n/marker.js';

export const HORIZONS = Object.freeze(['now', 'tonight', 'tomorrow']);
export const HORIZON_LABELS = Object.freeze({
  now: msg('Now'),
  tonight: msg('Tonight'),
  tomorrow: msg('Tomorrow'),
});

const ZONE = 'Europe/Berlin';
const DAY_MS = 86_400_000;
const PARTS = new Intl.DateTimeFormat('en-GB', {
  timeZone: ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  weekday: 'short',
});
const WEEKDAY_INDEX = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/** Berlin calendar fields of an instant. */
export function berlinParts(ms) {
  const out = {};
  for (const { type, value } of PARTS.formatToParts(new Date(ms)))
    out[type] = value;
  return {
    year: Number(out.year),
    month: Number(out.month),
    day: Number(out.day),
    hour: Number(out.hour),
    minute: Number(out.minute),
    weekday: WEEKDAY_INDEX[out.weekday],
  };
}

/** The instant of a Berlin wall-clock time (daylight saving included). */
export function berlinTime(year, month, day, hour = 0, minute = 0) {
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  let guess = wall;
  // Two passes settle the offset, also across a DST change.
  for (let i = 0; i < 2; i += 1) {
    const p = berlinParts(guess);
    const seen = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    guess += wall - seen;
  }
  return guess;
}

/** [from, to] ms for a horizon at `now`; "now" is a single instant. */
export function horizonRange(horizon, now = Date.now()) {
  const p = berlinParts(now);
  const at = (dayOffset, hour) =>
    berlinTime(p.year, p.month, p.day + dayOffset, hour);
  if (horizon === 'tonight') {
    // After midnight and before 06:00 it already is tonight.
    if (p.hour < 6) return [now, at(0, 6)];
    return [Math.max(now, at(0, 18)), at(1, 6)];
  }
  if (horizon === 'tomorrow') {
    const offset = p.hour < 6 ? 0 : 1;
    return [at(offset, 6), at(offset, 22)];
  }
  return [now, now];
}

// ── Notice schedules ──────────────────────────────────────────────────

const DATE = String.raw`(\d{2})\.(\d{2})\.(\d{2})`;
const TIME = String.raw`(\d{1,2}):(\d{2})`;
const WEEKDAYS_DE = Object.freeze({
  Sonntag: 0,
  Montag: 1,
  Dienstag: 2,
  Mittwoch: 3,
  Donnerstag: 4,
  Freitag: 5,
  Samstag: 6,
});

const day = (d, m, y) => [2000 + Number(y), Number(m), Number(d)];
const minutes = (h, m) => Number(h) * 60 + Number(m);

/**
 * The validity schedule written in a notice's lines:
 * `{ windows: [[start, end], …], recurring: [{ weekdays, from, to, start,
 * end }] }` with instants in ms and recurring times in minutes after
 * midnight (end may pass midnight).
 */
export function parseSchedule(lines = []) {
  const windows = [];
  const recurring = [];
  let begin = null;
  let finish = null;
  for (const raw of Array.isArray(lines) ? lines : []) {
    const line = String(raw || '').trim();
    let m;
    if (
      (m = new RegExp(String.raw`^Beginn:\s*${DATE}\s+um\s+${TIME}`).exec(line))
    )
      begin = berlinTime(...day(m[1], m[2], m[3]), Number(m[4]), Number(m[5]));
    else if (
      (m = new RegExp(String.raw`^Ende:\s*${DATE}\s+um\s+${TIME}`).exec(line))
    )
      finish = berlinTime(...day(m[1], m[2], m[3]), Number(m[4]), Number(m[5]));
    else if (
      (m = new RegExp(
        String.raw`^Jeden\s+(.+?)\s+zwischen\s+dem\s+${DATE}\s+und\s+dem\s+${DATE}\s+von\s+${TIME}\s+bis\s+${TIME}`,
      ).exec(line))
    ) {
      const names = m[1];
      const weekdays = /^Tag\b/.test(names)
        ? [0, 1, 2, 3, 4, 5, 6]
        : Object.entries(WEEKDAYS_DE)
            .filter(([name]) => names.includes(name))
            .map(([, index]) => index);
      if (weekdays.length)
        recurring.push({
          weekdays,
          from: day(m[2], m[3], m[4]),
          to: day(m[5], m[6], m[7]),
          start: minutes(m[8], m[9]),
          end: minutes(m[10], m[11]),
        });
    } else if (
      (m = new RegExp(
        String.raw`^${DATE}\s+von\s+${TIME}\s+bis\s+${TIME}`,
      ).exec(line))
    ) {
      const [y, mo, d] = day(m[1], m[2], m[3]);
      const start = berlinTime(y, mo, d, Number(m[4]), Number(m[5]));
      let end = berlinTime(y, mo, d, Number(m[6]), Number(m[7]));
      if (end <= start)
        end = berlinTime(y, mo, d + 1, Number(m[6]), Number(m[7]));
      windows.push([start, end]);
    } else if (
      (m = new RegExp(
        String.raw`^${DATE}\s+${TIME}(?:\s*Uhr)?\s+bis\s+zum\s+${DATE}\s+${TIME}`,
      ).exec(line))
    ) {
      windows.push([
        berlinTime(...day(m[1], m[2], m[3]), Number(m[4]), Number(m[5])),
        berlinTime(...day(m[6], m[7], m[8]), Number(m[9]), Number(m[10])),
      ]);
    }
  }
  if (begin !== null || finish !== null)
    // An open end stays null: it must survive JSON, where Infinity cannot.
    windows.push([begin, finish]);
  return { windows, recurring };
}

/** Window [a0, a1) against a range [b0, b1), or the instant b0 when equal. */
const overlaps = (a0, a1, b0, b1) =>
  b0 === b1 ? a0 <= b0 && b0 < a1 : a0 < b1 && b0 < a1;

/** Does a recurring rule apply at any time in [from, to]? */
function recurringOverlaps(rule, from, to) {
  const ruleStart = berlinTime(...rule.from);
  const ruleEnd = berlinTime(...rule.to) + DAY_MS;
  // Each Berlin day from the day before `from` (overnight windows) to `to`.
  for (let t = from - DAY_MS; t <= to + 1; t += DAY_MS) {
    const p = berlinParts(t);
    if (!rule.weekdays.includes(p.weekday)) continue;
    const midnight = berlinTime(p.year, p.month, p.day);
    if (midnight < ruleStart - DAY_MS || midnight >= ruleEnd) continue;
    const start = berlinTime(p.year, p.month, p.day, 0, rule.start);
    const end = berlinTime(
      p.year,
      p.month,
      p.day + (rule.end <= rule.start ? 1 : 0),
      0,
      rule.end,
    );
    if (overlaps(start, end, from, to)) return true;
  }
  return false;
}

/**
 * Whether a row applies at any time in [from, to]: by its schedule when it
 * has one, otherwise current rows apply (open-ended) and announced ones do
 * not. Live traffic warnings apply only now.
 */
export function appliesDuring(row, [from, to]) {
  // Traffic warnings (jams, accidents) describe the moment, not later.
  if (row?.kind === 'warning' && from !== to) return false;
  const schedule = row?.schedule;
  const timed =
    schedule && (schedule.windows?.length || schedule.recurring?.length);
  if (!timed) return row?.future !== true;
  return (
    schedule.windows.some(([s, e]) =>
      overlaps(s ?? -Infinity, e ?? Infinity, from, to),
    ) || schedule.recurring.some((rule) => recurringOverlaps(rule, from, to))
  );
}
