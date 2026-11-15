/**
 * German truck driving bans (portable: no Cesium, no DOM).
 *
 * § 30 (3) StVO: on Sundays and public holidays, lorries over 7.5 t and
 * lorries with trailers may not drive from 00:00 to 22:00. A holiday counts
 * where it is a holiday, so state holidays ban trucks only in that state.
 * The Ferienreiseverordnung adds Saturdays from 1 July to 31 August, 07:00
 * to 20:00, on listed sections of the main holiday routes.
 *
 * Exemptions exist (fresh food, combined transport, empty runs for them…);
 * this is a planning hint, not legal advice.
 */
import {
  berlinParts as horizonParts,
  berlinTime as horizonTime,
} from './horizon.js';

/** Germany's 16 states, by their official two-letter codes. */
export const STATES = Object.freeze({
  BW: 'Baden-Württemberg',
  BY: 'Bavaria',
  BE: 'Berlin',
  BB: 'Brandenburg',
  HB: 'Bremen',
  HH: 'Hamburg',
  HE: 'Hesse',
  MV: 'Mecklenburg-Vorpommern',
  NI: 'Lower Saxony',
  NW: 'North Rhine-Westphalia',
  RP: 'Rhineland-Palatinate',
  SL: 'Saarland',
  SN: 'Saxony',
  ST: 'Saxony-Anhalt',
  SH: 'Schleswig-Holstein',
  TH: 'Thuringia',
});
const ALL = Object.freeze(Object.keys(STATES));

/** Easter Sunday (Gregorian), as a UTC date at midnight. */
export function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return Date.UTC(year, month - 1, day);
}

const DAY_MS = 86_400_000;
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);

/**
 * Public holidays in a year: [{ date: 'YYYY-MM-DD', name, states }]. Only
 * holidays that apply state-wide are listed (Corpus Christi in parts of
 * Saxony and Thuringia, the Assumption in parts of Bavaria and Augsburg's
 * Peace Festival are local and left out).
 */
export function holidays(year) {
  const easter = easterSunday(year);
  const fixed = (month, day) => iso(Date.UTC(year, month - 1, day));
  const fromEaster = (days) => iso(easter + days * DAY_MS);
  // Repentance Day: the Wednesday before 23 November.
  const nov23 = Date.UTC(year, 10, 23);
  const weekday = new Date(nov23).getUTCDay();
  const repentance = iso(nov23 - ((weekday - 3 + 7) % 7 || 7) * DAY_MS);
  const list = [
    [fixed(1, 1), "New Year's Day", ALL],
    [fixed(1, 6), 'Epiphany', ['BW', 'BY', 'ST']],
    [
      fixed(3, 8),
      "International Women's Day",
      year >= 2023 ? ['BE', 'MV'] : year >= 2019 ? ['BE'] : [],
    ],
    [fromEaster(-2), 'Good Friday', ALL],
    [fromEaster(1), 'Easter Monday', ALL],
    [fixed(5, 1), 'Labour Day', ALL],
    [fromEaster(39), 'Ascension Day', ALL],
    [fromEaster(50), 'Whit Monday', ALL],
    [fromEaster(60), 'Corpus Christi', ['BW', 'BY', 'HE', 'NW', 'RP', 'SL']],
    [fixed(8, 15), 'Assumption Day', ['SL']],
    [fixed(9, 20), "World Children's Day", year >= 2019 ? ['TH'] : []],
    [fixed(10, 3), 'German Unity Day', ALL],
    [
      fixed(10, 31),
      'Reformation Day',
      year >= 2018
        ? ['BB', 'HB', 'HH', 'MV', 'NI', 'SN', 'ST', 'SH', 'TH']
        : ['BB', 'MV', 'SN', 'ST', 'TH'],
    ],
    [fixed(11, 1), "All Saints' Day", ['BW', 'BY', 'NW', 'RP', 'SL']],
    [repentance, 'Day of Repentance', ['SN']],
    [fixed(12, 25), 'Christmas Day', ALL],
    [fixed(12, 26), 'Boxing Day', ALL],
  ];
  return list
    .filter(([, , states]) => states.length)
    .map(([date, name, states]) => ({
      date,
      name,
      states: Object.freeze([...states]),
    }));
}

// ── Berlin wall-clock helpers (shared with the time switch) ─────────────
const berlinDate = (ms) => {
  const p = horizonParts(ms);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
};
/** The instant of a Berlin wall-clock hour on a 'YYYY-MM-DD' date. */
export function berlinTime(date, hour) {
  const [y, m, d] = date.split('-').map(Number);
  return horizonTime(y, m, d, hour);
}
const weekdayOf = (date) => new Date(`${date}T12:00:00Z`).getUTCDay();
const addDays = (date, days) =>
  iso(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS);

/**
 * Ban windows on one Berlin date: [{ kind, name, from, to, states }], with
 * `from`/`to` as epoch ms. Sunday and holiday bans run 0–22 h; the summer
 * Saturday ban 7–20 h on listed holiday routes in every state.
 */
export function bansOn(date) {
  const year = Number(date.slice(0, 4));
  const out = [];
  const weekday = weekdayOf(date);
  if (weekday === 0)
    out.push({
      kind: 'sunday',
      name: 'Sunday',
      date,
      from: berlinTime(date, 0),
      to: berlinTime(date, 22),
      states: ALL,
    });
  for (const holiday of holidays(year)) {
    if (holiday.date !== date) continue;
    out.push({
      kind: 'holiday',
      name: holiday.name,
      date,
      from: berlinTime(date, 0),
      to: berlinTime(date, 22),
      states: holiday.states,
    });
  }
  const month = Number(date.slice(5, 7));
  if (weekday === 6 && (month === 7 || month === 8))
    out.push({
      kind: 'summer-saturday',
      name: 'Summer Saturday',
      date,
      from: berlinTime(date, 7),
      to: berlinTime(date, 20),
      states: ALL,
    });
  return out;
}

/**
 * Bans that overlap [start, end) (epoch ms), optionally only those that
 * apply in at least one of `states`. Each carries `statesHit`: the given
 * states it applies in (or all of its states when none were given).
 */
export function bansDuring(start, end, { states = null } = {}) {
  const out = [];
  let date = berlinDate(start);
  const last = berlinDate(Math.max(start, end - 1));
  for (let guard = 0; date <= last && guard < 40; guard += 1) {
    for (const ban of bansOn(date)) {
      if (ban.to <= start || ban.from >= end) continue;
      const statesHit = states
        ? ban.states.filter((code) => states.includes(code))
        : ban.states;
      if (statesHit.length) out.push({ ...ban, statesHit });
    }
    date = addDays(date, 1);
  }
  return out;
}

/**
 * The next ban starting at or after `now` within `days` days (or one in
 * force now), for the given states: the same shape as bansDuring's rows.
 */
export function nextBan(now, { states = null, days = 8 } = {}) {
  const [first] = bansDuring(now, now + days * DAY_MS, { states });
  return first || null;
}
