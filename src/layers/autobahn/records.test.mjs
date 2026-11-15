import test from 'node:test';
import assert from 'node:assert/strict';
import { berlinTime } from '../../freight/horizon.js';
import {
  AUTOBAHN_ROADS,
  MAX_LINE_POINTS,
  autobahnKindLabel,
  lineLengthKm,
  mergeAutobahnRows,
  normalizeAutobahnItem,
  normalizeAutobahnServicePayload,
  simplifyLine,
} from './records.js';

// Shapes copied from live verkehr.autobahn.de responses (Nov 2026).
const closure = {
  identifier: 'closure-1',
  icon: '262',
  isBlocked: 'false',
  future: false,
  extent: '53.50,10.08,53.51,10.08',
  point: '53.506366,10.081135',
  display_type: 'CLOSURE',
  subtitle: ' Geesthacht -> Hamburg',
  title: 'A1 | Hamburg-Allermöhe - Hamburg-Südost',
  coordinate: { lat: 53.506366, long: 10.081135 },
  description: [
    'Die Baustelle ist zu folgenden Zeiträumen gültig:',
    '14.11.26 03:00 bis zum 15.11.26 23:00 Uhr.',
    '',
    'Länge: 1,2 km',
  ],
  impact: { lower: 'Hamburg-Südost', upper: 'Hamburg-Allermöhe' },
  geometry: {
    type: 'LineString',
    coordinates: [
      [10.081135424, 53.50636632],
      [10.0811087, 53.506458501],
      [10.080990319, 53.506987612],
    ],
  },
};

const warning = {
  identifier: 'INRIX-1',
  display_type: 'WARNING',
  future: false,
  isBlocked: 'false',
  title: 'A1 | Bliesheim - Weilerswist-West',
  subtitle: ' Köln -> Euskirchen',
  startTimestamp: '2026-11-10T10:16:00Z',
  delayTimeValue: '3',
  abnormalTrafficType: 'QUEUING_TRAFFIC',
  averageSpeed: '15',
  coordinate: { lat: '50.764366', long: '6.820525' },
  description: ['Beginn: 10.11.26 um 11:16 Uhr'],
  geometry: {
    type: 'LineString',
    coordinates: [
      [6.820525485, 50.764366303],
      [6.8167981, 50.758671801],
    ],
  },
};

test('a closure keeps its section, direction, line and stated length', () => {
  const row = normalizeAutobahnItem(closure, 'A1');
  assert.deepEqual(
    { ...row, line: row.line.length },
    {
      stableId: 'closure-1',
      road: 'A1',
      kind: 'closure',
      section: 'Hamburg-Allermöhe - Hamburg-Südost',
      direction: 'Geesthacht -> Hamburg',
      lat: 53.506366,
      lon: 10.081135,
      line: 3,
      lengthKm: 1.2,
      blocked: false,
      startTime: null,
      future: false,
      // The notice's validity window, in Berlin time.
      schedule: {
        windows: [[berlinTime(2026, 11, 14, 3), berlinTime(2026, 11, 15, 23)]],
        recurring: [],
      },
      delayMinutes: null,
      averageSpeedKmh: null,
      trafficType: null,
      details: [
        'Die Baustelle ist zu folgenden Zeiträumen gültig:',
        '14.11.26 03:00 bis zum 15.11.26 23:00 Uhr.',
        'Länge: 1,2 km',
      ],
    },
  );
  assert.deepEqual(row.line[0], [10.08114, 53.50637]);
});

test('a warning reads numeric strings, start time and a measured length', () => {
  const row = normalizeAutobahnItem(warning, 'A1');
  assert.equal(row.kind, 'warning');
  assert.equal(row.lat, 50.764366);
  assert.equal(row.delayMinutes, 3);
  assert.equal(row.averageSpeedKmh, 15);
  assert.equal(row.trafficType, 'QUEUING_TRAFFIC');
  assert.equal(row.startTime, Date.parse('2026-11-10T10:16:00Z'));
  // No "Länge" line: measured from the geometry (~0.69 km).
  assert.ok(row.lengthKm > 0.6 && row.lengthKm < 0.8, String(row.lengthKm));
});

test('announced items are kept with their schedule; unknown, unidentified and unplaceable ones are skipped', () => {
  const announced = normalizeAutobahnItem(
    {
      ...closure,
      future: true,
      description: ['17.11.26 von 06:00 bis 07:00 Uhr'],
    },
    'A1',
  );
  assert.equal(announced.future, true);
  assert.equal(announced.schedule.windows.length, 1);
  assert.equal(
    normalizeAutobahnItem({ ...closure, display_type: 'PARKING' }, 'A1'),
    null,
  );
  assert.equal(
    normalizeAutobahnItem({ ...closure, identifier: '' }, 'A1'),
    null,
  );
  assert.equal(
    normalizeAutobahnItem(
      { ...closure, coordinate: { lat: 'x' }, geometry: null },
      'A1',
    ),
    null,
  );
  // A bad point falls back to the line's first position.
  const fromLine = normalizeAutobahnItem(
    { ...closure, coordinate: null },
    'A1',
  );
  assert.deepEqual([fromLine.lon, fromLine.lat], [10.08114, 53.50637]);
});

test('display types map to row kinds', () => {
  const kind = (display_type) =>
    normalizeAutobahnItem({ ...closure, display_type }, 'A1').kind;
  assert.equal(kind('CLOSURE_ENTRY_EXIT'), 'ramp-closure');
  assert.equal(kind('ROADWORKS'), 'roadworks');
  assert.equal(kind('SHORT_TERM_ROADWORKS'), 'short-roadworks');
  assert.equal(autobahnKindLabel('ramp-closure'), 'Junction closure');
  assert.equal(autobahnKindLabel('nope'), null);
});

test('service payloads must have the service key; bad items do not reject the rest', () => {
  assert.equal(
    normalizeAutobahnServicePayload('A1', 'closure', { roadworks: [] }),
    null,
  );
  assert.equal(normalizeAutobahnServicePayload('A1', 'closure', null), null);
  assert.equal(
    normalizeAutobahnServicePayload('../x', 'closure', { closure: [] }),
    null,
  );
  assert.equal(
    normalizeAutobahnServicePayload('A1', 'parking_lorry', {
      parking_lorry: [],
    }),
    null,
  );
  const rows = normalizeAutobahnServicePayload('A1', 'closure', {
    closure: [closure, null, 'x', { ...closure, identifier: 7 }],
  });
  assert.deepEqual(
    rows.map(({ stableId }) => stableId),
    ['closure-1'],
  );
});

test('merging keeps the first copy of an event and orders by disruption then road', () => {
  const a1 = normalizeAutobahnItem(warning, 'A1');
  const roadworks = normalizeAutobahnItem(
    { ...closure, identifier: 'rw', display_type: 'ROADWORKS' },
    'A1',
  );
  const a7 = normalizeAutobahnItem({ ...closure, identifier: 'a7' }, 'A7');
  const a1Closure = normalizeAutobahnItem(closure, 'A1');
  const duplicate = { ...a1Closure, road: 'A7' };
  const merged = mergeAutobahnRows([
    [roadworks, a1],
    [a7, duplicate],
    [a1Closure],
  ]);
  assert.deepEqual(
    merged.map(({ stableId, road }) => `${stableId}@${road}`),
    ['a7@A7', 'closure-1@A7', 'INRIX-1@A1', 'rw@A1'],
  );
  assert.ok(AUTOBAHN_ROADS.includes('A1') && AUTOBAHN_ROADS.includes('A7'));
});

test('long lines are thinned to the point cap and keep both ends', () => {
  const points = Array.from({ length: 500 }, (_, i) => [i / 100, 50]);
  const thin = simplifyLine(points);
  assert.equal(thin.length, MAX_LINE_POINTS);
  assert.deepEqual(thin[0], points[0]);
  assert.deepEqual(thin.at(-1), points.at(-1));
  assert.equal(simplifyLine(points.slice(0, 3)).length, 3);
  // One degree of longitude at 50°N is ~71.7 km.
  const km = lineLengthKm([
    [0, 50],
    [1, 50],
  ]);
  assert.ok(Math.abs(km - 71.7) < 0.5, String(km));
});
