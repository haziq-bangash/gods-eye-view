import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BREAK_S,
  cumulativeKm,
  placeOnPath,
  planTrip,
  TRUCK_KMH,
} from './tripPlan.js';

// A straight route due south along 10° E, a point every ~1.1 km, ~750 km.
const PATH = Array.from({ length: 676 }, (_, i) => [10, 54 - i * 0.01]);
const KM = cumulativeKm(PATH).at(-1);
const DEPART = Date.UTC(2026, 10, 18, 16, 0); // 17:00 in Berlin
const H = 3600;
// Heading south, the right-hand side (your carriageway) is the west.
const area = (id, km, side, spaces = 30, extra = {}) => ({
  stableId: id,
  name: id,
  road: 'A7',
  lat: 54 - km / 111.2,
  lon: side === 'right' ? 9.998 : 10.002,
  lorrySpaces: spaces,
  ...extra,
});

test('a rest area on the right of the route serves your carriageway', () => {
  const along = cumulativeKm(PATH);
  assert.equal(placeOnPath(PATH, along, [9.998, 53.5]).side, 'right');
  assert.equal(placeOnPath(PATH, along, [10.002, 53.5]).side, 'left');
  assert.ok(Math.abs(placeOnPath(PATH, along, [9.998, 53.5]).km - 55.6) < 0.2);
});

test('a truck takes longer than the car and breaks before 4.5 hours', () => {
  const plan = planTrip({
    path: PATH,
    distanceM: KM * 1000,
    durationS: 6.5 * H,
    depart: DEPART,
    restAreas: [
      area('too-early', 100, 'right'),
      area('other-side', 320, 'left', 80),
      area('small', 325, 'right', 4),
      area('good', 310, 'right', 40),
      area('blocked', 330, 'right', 40, { blocked: true }),
      area('closed-by-works', 333, 'right', 40),
      area('second', 640, 'right', 20),
    ],
    unusable: new Set(['closed-by-works']),
  });
  assert.ok(Math.abs(plan.drivingS - (KM / TRUCK_KMH) * H) < 1);
  assert.equal(plan.breaks.length, 2);
  // 310 km at 75 km/h is 4 h 08: the latest roomy rest area on your side.
  assert.equal(plan.breaks[0].row.stableId, 'good');
  assert.equal(plan.breaks[1].row.stableId, 'second');
  assert.equal(
    plan.arrive,
    DEPART + (plan.drivingS + 2 * BREAK_S) * 1000,
    'two breaks on the way',
  );
  assert.equal(plan.overDay, 'rest', 'over 10 h of driving');
});

test('with only a small rest area in reach, it is the stop; with none, the break is still due', () => {
  const small = planTrip({
    path: PATH.slice(0, 400),
    distanceM: 0,
    durationS: 0,
    depart: DEPART,
    restAreas: [area('small', 320, 'right', 4)],
  });
  assert.equal(small.breaks[0].row.stableId, 'small');
  const none = planTrip({
    path: PATH.slice(0, 400),
    distanceM: 0,
    durationS: 0,
    depart: DEPART,
    restAreas: null,
  });
  assert.equal(none.parkingKnown, false);
  assert.equal(none.breaks[0].row, null);
  assert.equal(none.breaks[0].due, DEPART + 4.5 * H * 1000);
  assert.equal(none.overDay, null);
});

test('it tells whether you reach a closure before, during or after it', () => {
  // 150 km in: two hours at 75 km/h, so 19:00 in Berlin.
  const closure = (details) => ({
    stableId: details[0],
    kind: 'closure',
    lat: 54 - 150 / 111.2,
    lon: 10,
    details,
  });
  const plan = planTrip({
    path: PATH.slice(0, 300),
    distanceM: 0,
    durationS: 0,
    depart: DEPART,
    closures: [
      closure(['18.11.26 von 20:00 bis 05:00 Uhr']),
      closure(['18.11.26 von 18:00 bis 23:00 Uhr']),
      closure(['18.11.26 von 10:00 bis 15:00 Uhr']),
      closure(['Länge: 2 km']),
    ],
  });
  const at = DEPART + 2 * H * 1000;
  assert.ok(Math.abs(plan.closures[0].at - at) < 60_000);
  assert.deepEqual(
    plan.closures.map((c) => c.state),
    ['before', 'during', 'after', 'unknown'],
  );
});
