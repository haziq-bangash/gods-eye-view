import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DWD_WARNINGS_URL,
  normalizeDwdWarnings,
  samplePath,
  warningCovers,
  warningGroup,
  warningsOnPath,
  weatherScore,
} from './records.js';

const NOW = Date.UTC(2026, 10, 15, 12);
const square = (w, s, e, n) => [
  [
    [w, s],
    [e, s],
    [e, n],
    [w, n],
    [w, s],
  ],
];
const feature = (id, severity, rings, extra = {}) => ({
  type: 'Feature',
  geometry: { type: 'MultiPolygon', coordinates: [rings] },
  properties: {
    IDENTIFIER: id,
    STATUS: 'Actual',
    MSGTYPE: 'Alert',
    SEVERITY: severity,
    EC_GROUP: 'WIND',
    EVENT: 'STURMBÖEN',
    ONSET: '2026-11-15T10:00:00Z',
    EXPIRES: '2026-11-15T20:00:00Z',
    HEADLINE: 'Amtliche WARNUNG vor STURMBÖEN',
    DESCRIPTION: 'Es treten Sturmböen auf.',
    ...extra,
  },
});

test('the URL asks the DWD WFS for merged municipal warnings as GeoJSON', () => {
  const url = new URL(DWD_WARNINGS_URL);
  assert.equal(url.hostname, 'maps.dwd.de');
  assert.equal(
    url.searchParams.get('typeName'),
    'dwd:Warnungen_Gemeinden_vereinigt',
  );
  assert.equal(url.searchParams.get('outputFormat'), 'application/json');
});

test('warnings become rows: actual, unexpired, most severe first', () => {
  const rows = normalizeDwdWarnings(
    {
      features: [
        feature('a', 'Minor', square(8, 50, 9, 51)),
        feature('b', 'Severe', square(9, 50, 10, 51)),
        feature('a', 'Minor', square(8, 50, 9, 51)),
        feature('old', 'Extreme', square(8, 50, 9, 51), {
          EXPIRES: '2026-11-15T11:00:00Z',
        }),
        feature('test', 'Extreme', square(8, 50, 9, 51), { STATUS: 'Test' }),
        feature('odd', 'Unknown', square(8, 50, 9, 51)),
      ],
    },
    NOW,
  );
  assert.deepEqual(
    rows.map(({ stableId, level }) => [stableId, level]),
    [
      ['b', 'severe'],
      ['a', 'minor'],
    ],
  );
  assert.equal(rows[0].group, 'WIND');
  assert.deepEqual(rows[0].bbox, [9, 50, 10, 51]);
  assert.equal(rows[0].onset, Date.UTC(2026, 10, 15, 10));
  assert.throws(() => normalizeDwdWarnings({}), /Malformed/);
});

test('points inside an area count, holes do not', () => {
  const [row] = normalizeDwdWarnings(
    {
      features: [
        feature('h', 'Minor', [
          ...square(8, 50, 10, 52),
          ...square(8.5, 50.5, 9.5, 51.5).map((ring) => ring.reverse()),
        ]),
      ],
    },
    NOW,
  );
  assert.equal(warningCovers(row, [8.2, 50.2]), true);
  assert.equal(warningCovers(row, [9, 51]), false);
  assert.equal(warningCovers(row, [11, 51]), false);
});

test('a corridor path picks up the warnings it crosses; W is the worst level', () => {
  const rows = normalizeDwdWarnings(
    {
      features: [
        feature('wind', 'Moderate', square(8.9, 50.9, 9.1, 51.1)),
        feature('far', 'Extreme', square(13, 52, 14, 53)),
        feature('later', 'Severe', square(8.9, 50.9, 9.1, 51.1), {
          ONSET: '2026-11-16T12:00:00Z',
          EXPIRES: '2026-11-16T20:00:00Z',
        }),
      ],
    },
    NOW,
  );
  const path = [
    [8, 51],
    [10, 51],
  ];
  assert.ok(samplePath(path).length > 20);
  assert.deepEqual(
    warningsOnPath(path, rows, { now: NOW }).map((r) => r.stableId),
    ['wind'],
  );
  assert.equal(weatherScore(path, rows, { now: NOW }).value, 50);
  assert.equal(
    weatherScore(
      [
        [0, 0],
        [1, 1],
      ],
      rows,
      { now: NOW },
    ).value,
    0,
  );
});

test('groups read in plain words, unknown ones fall back', () => {
  assert.equal(warningGroup('GLAZE').label, 'Freezing rain');
  assert.equal(warningGroup('NOPE').label, 'Weather');
});
