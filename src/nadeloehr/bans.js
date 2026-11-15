/**
 * Truck driving bans as display models: the ban in force for the chosen
 * time (now, tonight, tomorrow) or else the next one, in plain words.
 * Rules live in src/freight/drivingBans.js.
 */
import { formatDate, msg, t } from '../i18n/index.js';
import { STATES, bansDuring, nextBan } from '../freight/drivingBans.js';

const BAN_NAMES = Object.freeze({
  Sunday: msg('Sunday'),
  'Summer Saturday': msg('Summer Saturday'),
  "New Year's Day": msg("New Year's Day"),
  Epiphany: msg('Epiphany'),
  "International Women's Day": msg("International Women's Day"),
  'Good Friday': msg('Good Friday'),
  'Easter Monday': msg('Easter Monday'),
  'Labour Day': msg('Labour Day'),
  'Ascension Day': msg('Ascension Day'),
  'Whit Monday': msg('Whit Monday'),
  'Corpus Christi': msg('Corpus Christi'),
  'Assumption Day': msg('Assumption Day'),
  "World Children's Day": msg("World Children's Day"),
  'German Unity Day': msg('German Unity Day'),
  'Reformation Day': msg('Reformation Day'),
  "All Saints' Day": msg("All Saints' Day"),
  'Day of Repentance': msg('Day of Repentance'),
  'Christmas Day': msg('Christmas Day'),
  'Boxing Day': msg('Boxing Day'),
});

/** The one-sentence rule behind the notice, for its ⓘ. */
export const BAN_EXPLAIN = msg(
  'On Sundays and public holidays, lorries over 7.5 t and lorries with a trailer may not drive from 00:00 to 22:00 (§ 30 StVO); a state holiday applies only in that state. From 1 July to 31 August, Saturdays 07:00–20:00 are banned on the main holiday routes too. Exceptions exist, for example for fresh food and combined transport. A planning aid, not legal advice.',
);

const ALL_STATES = Object.keys(STATES).length;
const clock = (ms) => formatDate(ms, { hour: '2-digit', minute: '2-digit' });
const dayLabel = (ms) =>
  formatDate(ms, { weekday: 'short', day: 'numeric', month: 'short' });

/** The window a horizon asks about: this moment, or the tonight/tomorrow range. */
export function banWindow(horizon, range, now) {
  if (horizon === 'now' || !Array.isArray(range)) return [now, now + 1];
  return range;
}

/** Same-day bans merged: one row per date, names joined, states united. */
function byDay(bans) {
  const days = new Map();
  for (const ban of bans) {
    const day = days.get(ban.date) || {
      date: ban.date,
      kinds: [],
      names: [],
      states: new Set(),
      everywhere: false,
      from: ban.from,
      to: ban.to,
    };
    day.kinds.push(ban.kind);
    day.names.push(t(BAN_NAMES[ban.name] || ban.name));
    for (const code of ban.statesHit) day.states.add(code);
    if (ban.states.length >= ALL_STATES) day.everywhere = true;
    day.from = Math.min(day.from, ban.from);
    day.to = Math.max(day.to, ban.to);
    days.set(ban.date, day);
  }
  return [...days.values()];
}

function describe(day, { inForce }) {
  const codes = [...day.states];
  const everywhere = day.everywhere || codes.length >= ALL_STATES;
  const where = everywhere
    ? t('across Germany')
    : t('in {states}', { states: codes.join(', ') });
  const hours = `${clock(day.from)}–${clock(day.to)}`;
  const onlySummer = day.kinds.every((kind) => kind === 'summer-saturday');
  return {
    date: day.date,
    name: day.names.join(' · '),
    // The day's name with its states when it is not a nationwide ban.
    label: everywhere
      ? day.names.join(' · ')
      : `${day.names.join(' · ')}, ${codes.join(', ')}`,
    states: codes,
    stateNames: codes.map((code) => STATES[code]).join(', '),
    hours,
    until: inForce ? clock(day.to) : null,
    when: `${dayLabel(day.from)}, ${hours}`,
    body: onlySummer
      ? t('Lorries over 7.5 t may not use the main holiday routes, {hours}.', {
          hours,
        })
      : t('No lorries over 7.5 t or with a trailer, {hours}, {where}.', {
          hours,
          where,
        }),
  };
}

/**
 * What to show: { active: [...], next } for the chosen time. `states`
 * limits it to bans that apply there (a corridor's states); null means
 * anywhere in Germany. `active` lists the bans overlapping the window;
 * when there are none, `next` is the coming one within a week, else null.
 */
export function banNotice({ horizon, range, now, states = null }) {
  const [start, end] = banWindow(horizon, range, now);
  const active = byDay(bansDuring(start, end, { states })).map((day) =>
    describe(day, { inForce: horizon === 'now' }),
  );
  if (active.length) return { active, next: null };
  const upcoming = nextBan(Math.max(now, end), { states, days: 7 });
  return {
    active,
    next: upcoming ? describe(byDay([upcoming])[0], { inForce: false }) : null,
  };
}
