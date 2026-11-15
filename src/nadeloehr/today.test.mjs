import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreCorridors } from '../freight/corridors.js';
import { corridorView, todayHeadline, todayKpis } from './today.js';

const ev = (kind, road, lon = 10, lat = 51) => ({ kind, road, lon, lat });
const kaub = (levelCm, extra = {}) => ({
  shortname: 'KAUB',
  name: 'Kaub',
  levelCm,
  trendCm: -12,
  state: 'low',
  series: [
    [0, 71],
    [1, 59],
  ],
  ...extra,
});

test('the strip counts closures, warnings and exits, then Kaub and the gauges', () => {
  const kpis = todayKpis(
    [
      ev('closure', 'A1'),
      ev('closure', 'A1'),
      ev('closure', 'A7'),
      ev('warning', 'A3'),
      ev('ramp-closure', 'A5'),
    ],
    [kaub(59), { shortname: 'MAXAU', state: 'normal' }],
  );
  assert.deepEqual(
    kpis.map(({ id, value }) => [id, value]),
    [
      ['closed', '3'],
      ['warnings', '1'],
      ['exits', '1'],
      ['kaub', '59'],
      ['gauges', '1'],
    ],
  );
  assert.equal(kpis[0].note, 'on 2 Autobahns');
  assert.equal(kpis[3].note, '−12 cm in 24 h');
  assert.deepEqual(kpis[3].series, [71, 59]);
  assert.deepEqual(kpis[0].action, { severity: 'critical' });
  // Without gauges the river cards are left out.
  assert.equal(todayKpis([], []).length, 3);
});

test('very low water at Kaub is the headline, with the riskiest corridor', () => {
  const scored = scoreCorridors({ events: [], kaubLevelCm: 59 });
  const headline = todayHeadline([kaub(59)], scored);
  assert.equal(headline.tone, 'alert');
  assert.equal(headline.title, 'Rhine low water at Kaub: 59 cm');
  assert.match(headline.body, /fraction of their load/);
  assert.match(headline.body, /Duisburg → Karlsruhe is elevated/);
});

test('with a normal Rhine the riskiest corridor leads, or a calm line', () => {
  const events = Array.from({ length: 5 }, () =>
    ev('closure', 'A7', 9.73, 52.37),
  );
  const scored = scoreCorridors({ events, kaubLevelCm: 250 });
  const headline = todayHeadline([kaub(250, { state: 'normal' })], scored);
  assert.equal(headline.title, 'Hamburg → Ulm is high');
  assert.equal(headline.corridorId, 'north-south-a7');
  const calm = todayHeadline(
    [kaub(250)],
    scoreCorridors({ events: [], kaubLevelCm: 250 }),
  );
  assert.equal(calm.tone, 'calm');
});

test('a corridor card names its driver and the parts still missing', () => {
  const [entry] = scoreCorridors({ events: [], kaubLevelCm: 59 });
  const view = corridorView(entry);
  assert.equal(view.title, 'Duisburg → Karlsruhe');
  assert.equal(view.river, 'Rhine');
  assert.equal(view.driver, 'Mostly water level');
  assert.deepEqual(view.missing, ['Truck parking', 'Weather']);
  assert.deepEqual(
    view.parts.map(({ key, weight }) => [key, weight]),
    [
      ['C', 58],
      ['P', 0],
      ['H', 42],
      ['W', 0],
    ],
  );
});

test('weather: a strip card once the layer is on, and severe warnings lead', () => {
  const now = Date.now();
  const warning = (level, group = 'WIND') => ({
    stableId: `${level}-${group}`,
    level,
    group,
    onset: now - 1000,
    expires: now + 3_600_000,
  });
  assert.equal(
    todayKpis([], [], { warnings: null }).some((k) => k.id === 'weather'),
    false,
  );
  const card = todayKpis([], [], {
    warnings: [warning('moderate'), warning('minor', 'FOG')],
  }).find((k) => k.id === 'weather');
  assert.equal(card.value, '2');
  assert.equal(card.note, 'highest: strong weather warning');
  const calm = todayKpis([], [], { warnings: [] }).find(
    (k) => k.id === 'weather',
  );
  assert.equal(calm.note, 'none in force');
  const headline = todayHeadline([kaub(250)], [], {
    warnings: [warning('severe', 'GLAZE')],
  });
  assert.equal(headline.title, 'Severe weather warning: Freezing rain');
  assert.equal(headline.warning.level, 'severe');
});
