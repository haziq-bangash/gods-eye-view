import assert from 'node:assert/strict';
import test from 'node:test';
import { isScheduleLine, parseSchedule, scheduleNow } from './schedule.js';

// Berlin is UTC+1 in November.
const at = (y, mo, d, hh, mm) => Date.UTC(y, mo - 1, d, hh - 1, mm);

const PHASE = [
  'Zeitraum dieser Bauphase:',
  'Beginn: 21.11.26 um 21:00 Uhr',
  'Ende: 22.11.26 um 12:00 Uhr',
  '(Ende der Gesamtmaßnahme: 27.12.28)',
  'A3: Frankfurt -> Würzburg, zwischen 5.2 km hinter AS Frankfurt am Main-Süd',
];
const NIGHTS = [
  'Die Baustelle ist zu folgenden Zeiträumen gültig:',
  '14.11.26 19:00 bis zum 15.11.26 06:00 Uhr.',
  '16.11.26 22:00 bis zum 17.11.26 05:30 Uhr.',
  '18.11.26 von 22:00 bis 05:00 Uhr',
  '(Ende der Gesamtmaßnahme: 30.10.27)',
];

test('reads a construction phase and the project end', () => {
  const { windows, projectEnd } = parseSchedule(PHASE);
  assert.deepEqual(windows, [
    [at(2026, 11, 21, 21, 0), at(2026, 11, 22, 12, 0)],
  ]);
  assert.equal(projectEnd, at(2028, 12, 27, 23, 59));
});

test('reads time windows, including one past midnight on a single date', () => {
  const { windows } = parseSchedule(NIGHTS);
  assert.deepEqual(windows, [
    [at(2026, 11, 14, 19, 0), at(2026, 11, 15, 6, 0)],
    [at(2026, 11, 16, 22, 0), at(2026, 11, 17, 5, 30)],
    [at(2026, 11, 18, 22, 0), at(2026, 11, 19, 5, 0)],
  ]);
});

test('reports the window in force, its progress and what follows', () => {
  const night = scheduleNow(NIGHTS, at(2026, 11, 17, 2, 0));
  assert.equal(night.active, true);
  assert.equal(night.from, at(2026, 11, 16, 22, 0));
  assert.equal(night.to, at(2026, 11, 17, 5, 30));
  assert.ok(Math.abs(night.progress - 4 / 7.5) < 1e-9);
  assert.equal(night.later, 1);
  // 30 October 2027 is still summer time (UTC+2).
  assert.equal(night.projectEnd, Date.UTC(2027, 9, 30, 21, 59));
  const daytime = scheduleNow(NIGHTS, at(2026, 11, 17, 12, 0));
  assert.equal(daytime.active, false);
  assert.equal(daytime.from, at(2026, 11, 18, 22, 0));
  assert.equal(scheduleNow(['Länge: 2 km'], 0), null);
});

test('marks the schedule lines a card can fold away', () => {
  assert.equal(isScheduleLine('Beginn: 21.11.26 um 21:00 Uhr'), true);
  assert.equal(
    isScheduleLine('16.11.26 22:00 bis zum 17.11.26 05:30 Uhr.'),
    true,
  );
  assert.equal(isScheduleLine('(Ende der Gesamtmaßnahme: 30.10.27)'), true);
  assert.equal(isScheduleLine('A3: Frankfurt -> Würzburg'), false);
});
