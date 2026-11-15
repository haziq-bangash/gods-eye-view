import test from 'node:test';
import assert from 'node:assert/strict';
import { gaugeCard, keyGauges, kaubSummary, trendText } from './rivers.js';

const gauge = (shortname, extra = {}) => ({
  stableId: shortname,
  shortname,
  name: shortname[0] + shortname.slice(1).toLowerCase(),
  water: 'RHEIN',
  km: 546.23,
  lat: 50,
  lon: 7.7,
  levelCm: 59,
  measuredAt: Date.UTC(2026, 10, 15, 9, 30),
  state: 'low',
  key: true,
  trendCm: -12,
  ...extra,
});

test('the Kaub summary carries level, band and trend', () => {
  const summary = kaubSummary([gauge('MAXAU'), gauge('KAUB')]);
  assert.equal(summary.row.shortname, 'KAUB');
  assert.equal(summary.level, '59 cm');
  assert.equal(summary.status, 'Very low water');
  assert.equal(summary.direction, 'falling');
  assert.equal(summary.trend, '−12 cm in 24 h');
  assert.equal(kaubSummary([gauge('MAXAU')]), null);
});

test('the key gauge list leaves Kaub to its own card', () => {
  const rows = [gauge('MAXAU'), gauge('KAUB'), gauge('X', { key: false })];
  assert.deepEqual(
    keyGauges(rows).map((row) => row.shortname),
    ['MAXAU'],
  );
});

test('a gauge card lists only the facts it has', () => {
  const card = gaugeCard(gauge('KAUB'));
  assert.equal(card.river, 'Rhine');
  assert.equal(card.km, 'River km 546.2');
  assert.equal(card.isKaub, true);
  assert.deepEqual(
    card.facts.map(({ key }) => key),
    ['level', 'falling', 'measured'],
  );
  assert.equal(card.facts[0].emphasis, true);
  assert.equal(card.facts[1].value, '−12 cm');
  const plain = gaugeCard(
    gauge('MAXAU', { trendCm: null, measuredAt: null, state: 'normal' }),
  );
  assert.deepEqual(
    plain.facts.map(({ key }) => key),
    ['level'],
  );
  assert.equal(plain.status, 'Normal');
  assert.equal(trendText(0), '±0 cm in 24 h');
  assert.equal(trendText(4), '+4 cm in 24 h');
});
