import test from 'node:test';
import assert from 'node:assert/strict';
import { pinSummary, placeId, toPin } from './pins.js';

const ev = (kind, road, lat, lon) => ({ kind, road, lat, lon });
const square = (lon, lat, d = 0.2) => [
  [
    [lon - d, lat - d],
    [lon + d, lat - d],
    [lon + d, lat + d],
    [lon - d, lat + d],
    [lon - d, lat - d],
  ],
];

test('pinned roads and places say what applies to them', () => {
  const kassel = toPin({ name: 'Kassel', lat: 51.31, lng: 9.48 });
  const items = pinSummary(
    { roads: ['A7', 'A1'], places: [kassel] },
    {
      events: [
        ev('closure', 'A7', 52.37, 9.73),
        ev('warning', 'A7', 51.3, 9.5),
        ev('ramp-closure', 'A1', 53.5, 10.0),
        ev('closure', 'A44', 51.35, 9.4), // near Kassel
      ],
      warnings: [
        {
          group: 'WIND',
          level: 'moderate',
          bbox: [9.28, 51.11, 9.68, 51.51],
          polygons: [square(9.48, 51.31)],
        },
      ],
    },
  );
  assert.deepEqual(
    items.map(({ title, line, tone }) => [title, line, tone]),
    [
      ['A7', '1 closure · 1 warning', 'alert'],
      ['A1', 'No closures or warnings', 'calm'],
      [
        'Kassel',
        '1 closure · 1 warning within 30 km · Wind: strong weather warning',
        'alert',
      ],
    ],
  );
});

test('places get a stable id and need a name and a position', () => {
  assert.equal(
    placeId({ name: 'Kassel', lat: 51.312345, lng: 9.4812 }),
    'Kassel@51.312,9.481',
  );
  assert.equal(toPin({ name: 'Nowhere' }), null);
  assert.deepEqual(toPin({ name: 'Ulm', lat: 48.4, lon: 9.99 }), {
    id: 'Ulm@48.400,9.990',
    name: 'Ulm',
    lat: 48.4,
    lon: 9.99,
  });
});
