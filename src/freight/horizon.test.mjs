import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appliesDuring,
  berlinParts,
  berlinTime,
  horizonRange,
  parseSchedule,
} from './horizon.js';

const iso = (ms) => new Date(ms).toISOString();

test('Berlin wall-clock times convert across daylight saving', () => {
  assert.equal(iso(berlinTime(2026, 11, 15, 12)), '2026-11-15T11:00:00.000Z');
  assert.equal(iso(berlinTime(2026, 7, 1, 12)), '2026-07-01T10:00:00.000Z');
  // Day overflow rolls into the next month.
  assert.equal(iso(berlinTime(2026, 11, 31, 6)), '2026-12-01T05:00:00.000Z');
  assert.equal(berlinParts(Date.UTC(2026, 10, 15, 23, 30)).day, 16);
});

test('tonight and tomorrow follow the Berlin clock', () => {
  const noon = berlinTime(2026, 11, 15, 12);
  assert.deepEqual(horizonRange('now', noon), [noon, noon]);
  assert.deepEqual(horizonRange('tonight', noon), [
    berlinTime(2026, 11, 15, 18),
    berlinTime(2026, 11, 16, 6),
  ]);
  assert.deepEqual(horizonRange('tomorrow', noon), [
    berlinTime(2026, 11, 16, 6),
    berlinTime(2026, 11, 16, 22),
  ]);
  const late = berlinTime(2026, 11, 15, 21);
  assert.equal(horizonRange('tonight', late)[0], late);
  const small = berlinTime(2026, 11, 16, 2);
  assert.deepEqual(horizonRange('tonight', small), [
    small,
    berlinTime(2026, 11, 16, 6),
  ]);
  assert.deepEqual(horizonRange('tomorrow', small), [
    berlinTime(2026, 11, 16, 6),
    berlinTime(2026, 11, 16, 22),
  ]);
});

test('every notice format the feed uses is read', () => {
  const { windows, recurring } = parseSchedule([
    'Die Baustelle ist zu folgenden Zeiträumen gültig:',
    '17.11.26 von 06:00 bis 07:00 Uhr',
    '18.11.26 von 20:00 bis 05:00 Uhr',
    '19.11.26 21:00 bis zum 20.11.26 05:00 Uhr.',
    '21.11.26 21:00 Uhr bis zum 22.11.26 05:00 Uhr.',
    'Jeden Montag, Dienstag und Freitag zwischen dem 16.11.26 und dem 27.11.26 von 20:00 bis 05:00 Uhr.',
    'Jeden Tag zwischen dem 16.11.26 und dem 17.11.26 von 09:00 bis 15:00 Uhr.',
    '(Ende der Gesamtmaßnahme: 01.01.31)',
  ]);
  assert.deepEqual(windows, [
    [berlinTime(2026, 11, 17, 6), berlinTime(2026, 11, 17, 7)],
    [berlinTime(2026, 11, 18, 20), berlinTime(2026, 11, 19, 5)],
    [berlinTime(2026, 11, 19, 21), berlinTime(2026, 11, 20, 5)],
    [berlinTime(2026, 11, 21, 21), berlinTime(2026, 11, 22, 5)],
  ]);
  assert.deepEqual(recurring[0].weekdays, [1, 2, 5]);
  assert.deepEqual(recurring[0].from, [2026, 11, 16]);
  assert.equal(recurring[0].start, 20 * 60);
  assert.deepEqual(recurring[1].weekdays, [0, 1, 2, 3, 4, 5, 6]);
  const begun = parseSchedule([
    'Beginn: 15.11.26 um 08:00 Uhr',
    'Ende: 20.11.26 um 18:00 Uhr',
  ]);
  assert.deepEqual(begun.windows, [
    [berlinTime(2026, 11, 15, 8), berlinTime(2026, 11, 20, 18)],
  ]);
});

test('rows apply by schedule; unscheduled current rows always, announced never', () => {
  const night = horizonRange('tonight', berlinTime(2026, 11, 16, 12)); // Monday
  const tomorrow = horizonRange('tomorrow', berlinTime(2026, 11, 16, 12));
  const monFriNights = {
    schedule: parseSchedule([
      'Jeden Montag und Freitag zwischen dem 16.11.26 und dem 27.11.26 von 20:00 bis 05:00 Uhr.',
    ]),
  };
  assert.equal(appliesDuring(monFriNights, night), true);
  assert.equal(appliesDuring(monFriNights, tomorrow), false);
  const oneMorning = {
    future: true,
    schedule: parseSchedule(['17.11.26 von 06:00 bis 07:00 Uhr']),
  };
  assert.equal(appliesDuring(oneMorning, tomorrow), true);
  assert.equal(appliesDuring(oneMorning, night), false);
  assert.equal(appliesDuring({}, night), true);
  assert.equal(appliesDuring({ future: true }, night), false);
});

test('an open-ended notice survives JSON and still applies', () => {
  const row = JSON.parse(
    JSON.stringify({
      schedule: parseSchedule(['Beginn: 15.11.26 um 11:41 Uhr']),
    }),
  );
  assert.deepEqual(row.schedule.windows, [
    [berlinTime(2026, 11, 15, 11, 41), null],
  ]);
  assert.equal(
    appliesDuring(row, [
      berlinTime(2026, 11, 15, 14),
      berlinTime(2026, 11, 15, 14),
    ]),
    true,
  );
  assert.equal(
    appliesDuring(row, [
      berlinTime(2026, 11, 15, 9),
      berlinTime(2026, 11, 15, 9),
    ]),
    false,
  );
});

test('live traffic warnings count now, not tonight or tomorrow', () => {
  const jam = { kind: 'warning' };
  const t = berlinTime(2026, 11, 15, 12);
  assert.equal(appliesDuring(jam, [t, t]), true);
  assert.equal(appliesDuring(jam, horizonRange('tonight', t)), false);
});
