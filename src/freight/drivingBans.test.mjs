import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bansDuring,
  bansOn,
  berlinTime,
  easterSunday,
  holidays,
  nextBan,
} from './drivingBans.js';

const day = (ms) => new Date(ms).toISOString().slice(0, 10);

test('Easter Sunday for known years', () => {
  assert.equal(day(easterSunday(2024)), '2024-03-31');
  assert.equal(day(easterSunday(2025)), '2025-04-20');
  assert.equal(day(easterSunday(2026)), '2026-04-05');
  assert.equal(day(easterSunday(2027)), '2027-03-28');
});

test('2026 holidays: movable dates and state lists', () => {
  const byName = Object.fromEntries(holidays(2026).map((h) => [h.name, h]));
  assert.equal(byName['Good Friday'].date, '2026-04-03');
  assert.equal(byName['Ascension Day'].date, '2026-05-14');
  assert.equal(byName['Whit Monday'].date, '2026-05-25');
  assert.equal(byName['Corpus Christi'].date, '2026-06-04');
  assert.deepEqual(
    [...byName['Corpus Christi'].states],
    ['BW', 'BY', 'HE', 'NW', 'RP', 'SL'],
  );
  assert.equal(byName['Day of Repentance'].date, '2026-11-18');
  assert.equal(byName['Day of Repentance'].states.join(), 'SN');
  assert.equal(byName['German Unity Day'].states.length, 16);
  assert.ok(byName['Reformation Day'].states.includes('NI'));
});

test('Berlin wall-clock times, in winter, summer and on change days', () => {
  assert.equal(
    new Date(berlinTime('2026-01-04', 0)).toISOString(),
    '2026-01-03T23:00:00.000Z',
  );
  assert.equal(
    new Date(berlinTime('2026-07-05', 22)).toISOString(),
    '2026-07-05T20:00:00.000Z',
  );
  // 29 March 2026: clocks go forward at 02:00.
  assert.equal(
    new Date(berlinTime('2026-03-29', 0)).toISOString(),
    '2026-03-28T23:00:00.000Z',
  );
  assert.equal(
    new Date(berlinTime('2026-03-29', 22)).toISOString(),
    '2026-03-29T20:00:00.000Z',
  );
  // 25 October 2026: clocks go back at 03:00.
  assert.equal(
    new Date(berlinTime('2026-10-25', 22)).toISOString(),
    '2026-10-25T21:00:00.000Z',
  );
});

test('Sundays ban 0–22 h everywhere; a weekday holiday only in its states', () => {
  const sunday = bansOn('2026-11-15');
  assert.equal(sunday.length, 1);
  assert.equal(sunday[0].kind, 'sunday');
  assert.equal(sunday[0].states.length, 16);
  const corpus = bansOn('2026-06-04');
  assert.equal(corpus.length, 1);
  assert.equal(corpus[0].name, 'Corpus Christi');
  assert.equal(bansOn('2026-11-17').length, 0, 'an ordinary Tuesday');
});

test('summer Saturdays add a 7–20 h ban in July and August only', () => {
  const july = bansOn('2026-07-18');
  assert.equal(july.length, 1);
  assert.equal(july[0].kind, 'summer-saturday');
  assert.equal(
    new Date(july[0].from).toISOString(),
    '2026-07-18T05:00:00.000Z',
  );
  assert.equal(bansOn('2026-09-05').length, 0);
});

test('bans during a window, filtered by the states a corridor crosses', () => {
  // Wednesday evening to Thursday evening around Corpus Christi 2026.
  const start = berlinTime('2026-06-03', 18);
  const end = berlinTime('2026-06-04', 18);
  assert.equal(bansDuring(start, end, { states: ['HH', 'NI'] }).length, 0);
  const hit = bansDuring(start, end, { states: ['HH', 'NI', 'HE', 'BY'] });
  assert.equal(hit.length, 1);
  assert.deepEqual([...hit[0].statesHit].sort(), ['BY', 'HE']);
  // A ban that already ended (Sunday after 22:00) does not count.
  assert.equal(
    bansDuring(berlinTime('2026-11-15', 22), berlinTime('2026-11-16', 6))
      .length,
    0,
  );
});

test('the next ban from a weekday is the coming Sunday', () => {
  const ban = nextBan(berlinTime('2026-11-11', 12), { states: ['NW'] });
  assert.equal(ban.date, '2026-11-15');
  assert.equal(ban.kind, 'sunday');
  // In force now counts as next.
  const now = nextBan(berlinTime('2026-11-15', 10));
  assert.equal(now.date, '2026-11-15');
});
