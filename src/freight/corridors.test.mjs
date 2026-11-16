import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CORRIDORS,
  RISK_WEIGHTS,
  corridorEvents,
  goesTheSameWay,
  pathHeadingAt,
  distanceToPathKm,
  riskLevel,
  scoreCorridor,
  scoreCorridors,
  scoreRoute,
  thinPath,
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

test('a checked route counts only what lies on it, on any road', () => {
  // A straight 100 km route along latitude 50.
  const path = Array.from({ length: 701 }, (_, i) => [8 + i * 0.002, 50]);
  const result = scoreRoute(
    { from: 'A', to: 'B', path },
    {
      events: [
        event('closure', 'A3', 8.3, 50.001), // on the route (~0.1 km)
        event('closure', 'A5', 8.3, 50.05), // parallel road, ~5.5 km away
      ],
      restAreas: [
        { stableId: 'p', road: 'A3', lat: 50.004, lon: 8.5, lorrySpaces: 100 },
        { stableId: 'far', road: 'A3', lat: 50.1, lon: 8.5, lorrySpaces: 999 },
      ],
      warnings: [],
    },
  );
  assert.equal(result.corridor.id, 'route');
  assert.equal(result.events.length, 1);
  assert.equal(result.parking.restAreas, 1);
  assert.deepEqual(
    result.parts.map(({ key, available }) => [key, available]),
    [
      ['C', true],
      ['P', true],
      ['W', true],
    ],
  );
  assert.ok(result.corridor.path.length < path.length);
});

test('thinning keeps the ends and roughly one point per step', () => {
  const path = Array.from({ length: 1001 }, (_, i) => [8 + i * 0.0007, 50]);
  const thin = thinPath(path, 0.5);
  assert.deepEqual(thin[0], path[0]);
  assert.deepEqual(thin.at(-1), path.at(-1));
  assert.ok(thin.length > 90 && thin.length < 110, String(thin.length));
});

// A route heading south along 9.5° E, and events drawn in their direction
// of travel, as Autobahn GmbH draws them.
const SOUTH = [
  [9.5, 52.0],
  [9.5, 51.5],
  [9.5, 51.0],
];
const directed = (kind, from, to, details = []) => ({
  kind,
  road: 'A7',
  lon: from[0],
  lat: from[1],
  line: [from, to],
  details,
});

test('a route reads its own heading', () => {
  assert.equal(Math.round(pathHeadingAt(SOUTH, [9.5, 51.5])), 180);
  assert.equal(pathHeadingAt([[9, 50]], [9, 50]), null);
});

test('a route counts the events on its own carriageway, not the other', () => {
  const southbound = directed('closure', [9.5, 51.52], [9.5, 51.48]);
  const northbound = directed('closure', [9.5, 51.48], [9.5, 51.52]);
  const crossing = directed('closure', [9.48, 51.5], [9.52, 51.5]);
  assert.equal(goesTheSameWay(southbound, SOUTH), true);
  assert.equal(goesTheSameWay(northbound, SOUTH), false);
  assert.equal(goesTheSameWay(crossing, SOUTH), false);
  // Both ways in one notice, an exit ramp, or no usable line: it counts.
  assert.equal(
    goesTheSameWay(
      event(
        'roadworks',
        [9.5, 51.48],
        [9.5, 51.52],
        ['A7, von AS Flensburg bis AS Schuby beide RiFa Bohrkernentnahmen'],
      ),
      SOUTH,
    ),
    true,
  );
  assert.equal(
    goesTheSameWay({ ...northbound, kind: 'ramp-closure' }, SOUTH),
    true,
  );
  assert.equal(goesTheSameWay({ ...northbound, line: null }, SOUTH), true);
  assert.equal(
    goesTheSameWay(directed('closure', [9.5, 51.5], [9.5, 51.5001]), SOUTH),
    true,
  );

  const scored = scoreRoute(
    { from: 'A', to: 'B', path: SOUTH },
    { events: [southbound, northbound, crossing], now: 0 },
  );
  assert.deepEqual(scored.events, [southbound]);
});

test('a corridor, drawn through cities, still counts both ways', () => {
  const corridor = { path: SOUTH, roads: ['A7'], bufferKm: 25 };
  const northbound = directed('closure', [9.5, 51.48], [9.5, 51.52]);
  assert.deepEqual(corridorEvents(corridor, [northbound]), [northbound]);
});
