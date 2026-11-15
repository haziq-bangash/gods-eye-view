import test from 'node:test';
import assert from 'node:assert/strict';
import {
  affectedParkingIds,
  mergeTruckParkingRows,
  normalizeTruckParkingPayload,
  parkingScore,
  pathLengthKm,
  truckParkingUrl,
} from './records.js';
import { CORRIDORS, scoreCorridor } from '../../freight/corridors.js';

const item = (id, lat, lon, lorry, extra = {}) => ({
  identifier: id,
  isBlocked: 'false',
  future: false,
  title: 'A7 | Appenrade',
  subtitle: `Rastplatz ${id}`,
  coordinate: { lat: String(lat), long: String(lon) },
  description: ['PKW Stellplätze: 14', `LKW Stellplätze: ${lorry}`],
  lorryParkingFeatureIcons: [{ description: 'Toilette vorhanden' }],
  ...extra,
});

test('the URL asks the Autobahn API for one road’s truck parking', () => {
  assert.equal(
    truckParkingUrl('A7'),
    'https://verkehr.autobahn.de/o/autobahn/A7/services/parking_lorry',
  );
});

test('rest areas become rows with their truck and car spaces', () => {
  const rows = normalizeTruckParkingPayload('A7', {
    parking_lorry: [
      item('a', 52.4, 9.7, 109),
      item('b', 52.5, 9.7, 4, { isBlocked: 'true' }),
      item('c', 52.6, 9.7, 10, { future: true }),
      { identifier: 'nowhere', coordinate: {} },
    ],
  });
  assert.deepEqual(
    rows.map(({ stableId, lorrySpaces, carSpaces, blocked }) => [
      stableId,
      lorrySpaces,
      carSpaces,
      blocked,
    ]),
    [
      ['a', 109, 14, false],
      ['b', 4, 14, true],
    ],
  );
  assert.equal(rows[0].name, 'Rastplatz a');
  assert.deepEqual(rows[0].features, ['Toilette vorhanden']);
  assert.throws(() => normalizeTruckParkingPayload('A7', {}), /Malformed/);
  assert.deepEqual(
    mergeTruckParkingRows([rows, rows]).map((row) => row.stableId),
    ['a', 'b'],
  );
});

test('blocked rest areas and ones next to a closure on their road are affected; roadworks do not count', () => {
  const rows = [
    { stableId: 'near', road: 'A7', lat: 52.4, lon: 9.7, blocked: false },
    { stableId: 'far', road: 'A7', lat: 53.0, lon: 9.7, blocked: false },
    { stableId: 'other-road', road: 'A2', lat: 52.4, lon: 9.7, blocked: false },
    { stableId: 'blocked', road: 'A7', lat: 50, lon: 9, blocked: true },
  ];
  const events = [
    { kind: 'closure', road: 'A7', lat: 52.41, lon: 9.7 },
    { kind: 'warning', road: 'A7', lat: 53.0, lon: 9.7 },
    // An exit closure only counts right at the rest area (1 km).
    { kind: 'ramp-closure', road: 'A7', lat: 53.05, lon: 9.7 },
  ];
  assert.deepEqual([...affectedParkingIds(rows, events)].sort(), [
    'blocked',
    'near',
  ]);
});

test('P falls as usable spaces per 100 km rise toward the reference', () => {
  const corridor = {
    path: [
      [9, 50],
      [9, 50.9],
    ],
  };
  const km = pathLengthKm(corridor.path);
  assert.ok(km > 99 && km < 101, String(km));
  const rows = [
    { stableId: 'a', road: 'A7', lat: 50.2, lon: 9, lorrySpaces: 200 },
    { stableId: 'b', road: 'A7', lat: 50.5, lon: 9, lorrySpaces: 200 },
  ];
  const open = parkingScore(corridor, rows, []);
  assert.equal(open.usableSpaces, 400);
  assert.equal(open.value, 50);
  const closed = parkingScore(corridor, rows, [
    { kind: 'closure', road: 'A7', lat: 50.2, lon: 9 },
  ]);
  assert.equal(closed.usableSpaces, 200);
  assert.equal(closed.affectedAreas, 1);
  assert.equal(closed.value, 75);
});

test('a corridor reads P from the rest areas on its roads near its line', () => {
  const a7 = CORRIDORS.find((c) => c.id === 'north-south-a7');
  const restAreas = [
    { stableId: 'on', road: 'A7', lat: 52.37, lon: 9.73, lorrySpaces: 100 },
    {
      stableId: 'off-road',
      road: 'A2',
      lat: 52.37,
      lon: 9.73,
      lorrySpaces: 999,
    },
    { stableId: 'far', road: 'A7', lat: 54.5, lon: 9.4, lorrySpaces: 999 },
  ];
  const result = scoreCorridor(a7, { restAreas });
  const p = result.parts.find((part) => part.key === 'P');
  assert.equal(p.available, true);
  assert.equal(result.parking.restAreas, 1);
  assert.equal(result.parking.totalSpaces, 100);
  assert.ok(p.value > 90);
  assert.equal(
    scoreCorridor(a7, {}).parts.find((part) => part.key === 'P').available,
    false,
  );
});
