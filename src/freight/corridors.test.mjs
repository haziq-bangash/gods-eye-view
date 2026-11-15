import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CORRIDORS,
  RISK_WEIGHTS,
  corridorEvents,
  distanceToPathKm,
  riskLevel,
  scoreCorridor,
  scoreCorridors,
} from './corridors.js';

const byId = Object.fromEntries(CORRIDORS.map((c) => [c.id, c]));
const event = (kind, road, lon, lat) => ({ kind, road, lon, lat });

test('weights sum to 1 and levels follow the thresholds', () => {
  const sum = Object.values(RISK_WEIGHTS).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
  assert.equal(riskLevel(10), 'low');
  assert.equal(riskLevel(33), 'elevated');
  assert.equal(riskLevel(66), 'elevated');
  assert.equal(riskLevel(67), 'high');
  assert.equal(riskLevel(null), null);
});

test('distance to a path measures to the nearest segment', () => {
  const path = [
    [8, 50],
    [9, 50],
  ];
  assert.ok(distanceToPathKm([8.5, 50], path) < 0.01);
  const north = distanceToPathKm([8.5, 50.1], path);
  assert.ok(north > 10 && north < 12, String(north));
  assert.ok(distanceToPathKm([7, 50], path) > 70);
});

test('only events on the corridor roads and near its line count', () => {
  const a1 = byId['hamburg-ruhr'];
  const events = [
    event('closure', 'A1', 8.8, 53.08), // Bremen, on the A1 line
    event('closure', 'A7', 8.8, 53.08), // right place, wrong road
    event('closure', 'A1', 13.4, 52.5), // A1 elsewhere (Berlin area)
  ];
  assert.equal(corridorEvents(a1, events).length, 1);
});

test('a road-only corridor drops H and rescales; missing parts are left out', () => {
  const result = scoreCorridor(byId['hamburg-ruhr'], {
    events: [
      event('closure', 'A1', 8.8, 53.08),
      event('warning', 'A1', 8.05, 52.28),
      event('ramp-closure', 'A1', 7.63, 51.96),
    ],
  });
  assert.deepEqual(
    result.parts.map(({ key, available }) => [key, available]),
    [
      ['C', true],
      ['P', false],
      ['W', false],
    ],
  );
  // Only C has data, so it carries the whole weight: 15 + 8 + 1 points.
  assert.equal(result.parts[0].weight, 1);
  assert.equal(result.points, 24);
  assert.equal(result.score, Math.round(100 * (1 - Math.exp(-24 / 60))));
  assert.equal(result.level, 'elevated');
  assert.deepEqual(result.counts, {
    closure: 1,
    warning: 1,
    'ramp-closure': 1,
  });
});

test('the Rhine axis reads Kaub; parking and weather join when they exist', () => {
  const rhine = byId['rhine-axis'];
  const low = scoreCorridor(rhine, { kaubLevelCm: 40 });
  // C 0 (weight .35/.6), H 100 (weight .25/.6).
  assert.equal(low.score, Math.round((100 * 0.25) / 0.6));
  const full = scoreCorridor(rhine, {
    kaubLevelCm: 40,
    parking: 50,
    weather: 50,
  });
  assert.equal(full.score, Math.round(0.25 * 100 + 0.2 * 50 + 0.2 * 50));
  assert.ok(full.parts.every((part) => part.available));
  assert.equal(
    scoreCorridor(rhine, {}).parts.find((part) => part.key === 'H').available,
    false,
  );
});

test('C saturates below 100 and corridors sort by risk', () => {
  const many = Array.from({ length: 20 }, () =>
    event('closure', 'A7', 9.73, 52.37),
  );
  const ranked = scoreCorridors({ events: many, kaubLevelCm: 300 });
  assert.equal(ranked[0].id, 'north-south-a7');
  assert.ok(ranked[0].score >= 99 && ranked[0].score <= 100);
  assert.equal(ranked[0].level, 'high');
  assert.equal(ranked.at(-1).score, 0);
});

test('W comes from the DWD warnings crossing the corridor line', () => {
  const a7 = byId['north-south-a7'];
  const now = Date.UTC(2026, 10, 15, 12);
  const around = (lon, lat, level) => ({
    stableId: `${level}-${lon}`,
    level,
    onset: now - 3_600_000,
    expires: now + 3_600_000,
    bbox: [lon - 0.2, lat - 0.2, lon + 0.2, lat + 0.2],
    polygons: [
      [
        [
          [lon - 0.2, lat - 0.2],
          [lon + 0.2, lat - 0.2],
          [lon + 0.2, lat + 0.2],
          [lon - 0.2, lat + 0.2],
          [lon - 0.2, lat - 0.2],
        ],
      ],
    ],
  });
  const result = scoreCorridor(a7, {
    warnings: [around(9.73, 52.37, 'severe'), around(13.4, 52.5, 'extreme')],
    now,
  });
  const w = result.parts.find((part) => part.key === 'W');
  assert.equal(w.available, true);
  assert.equal(w.value, 75);
  assert.equal(result.warnings.length, 1);
  // An empty list is data too: no warning on the corridor scores 0.
  assert.equal(
    scoreCorridor(a7, { warnings: [], now }).parts.find((p) => p.key === 'W')
      .value,
    0,
  );
});
