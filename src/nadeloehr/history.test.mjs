import test from 'node:test';
import assert from 'node:assert/strict';
import { comparedToUsual, corridorSeries, usualScore } from './history.js';
import { appendReading } from '../../scripts/record-corridor-history.mjs';

const NOW = Date.UTC(2026, 10, 15, 15);
const hour = (h) => new Date(NOW - h * 3_600_000).toISOString();
const history = (scores) => ({
  rows: scores.map((score, i) => ({
    t: hour(scores.length - i),
    corridors: { 'north-south-a7': { score } },
  })),
});

test('a corridor series keeps the last week, oldest first', () => {
  const h = history([10, 20, 30]);
  h.rows.unshift({
    t: hour(24 * 9),
    corridors: { 'north-south-a7': { score: 99 } },
  });
  const series = corridorSeries(h, 'north-south-a7', { now: NOW });
  assert.deepEqual(
    series.map(([, s]) => s),
    [10, 20, 30],
  );
  assert.deepEqual(corridorSeries(h, 'nope', { now: NOW }), []);
});

test('the usual score is the median once there is a day of data', () => {
  assert.equal(usualScore([[0, 5]]), null);
  const series = Array.from({ length: 24 }, (_, i) => [i, 30 + (i % 3)]);
  assert.equal(usualScore(series), 31);
  assert.match(
    comparedToUsual(50, series).text,
    /^Higher than usual \(typically 31\)/,
  );
  assert.equal(comparedToUsual(32, series).tone, 'same');
  assert.equal(comparedToUsual(10, series).tone, 'down');
  assert.equal(comparedToUsual(40, []).tone, 'neutral');
});

test('readings append once per hour and old ones age out', () => {
  const reading = { t: hour(0), corridors: {} };
  const once = appendReading({ rows: [{ t: hour(24 * 100) }] }, reading, NOW);
  assert.deepEqual(
    once.rows.map((row) => row.t),
    [hour(0)],
  );
  const again = appendReading(once, { ...reading, kaub: 60 }, NOW);
  assert.equal(again.rows.length, 1);
  assert.equal(again.rows[0].kaub, 60);
});
