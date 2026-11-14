import test from 'node:test';
import assert from 'node:assert/strict';
import { autobahnAccent, buildAutobahnCard } from './cards.js';

const row = {
  stableId: 'w1',
  road: 'A1',
  kind: 'warning',
  section: 'Bliesheim - Weilerswist-West',
  direction: 'Köln -> Euskirchen',
  lat: 50.76,
  lon: 6.82,
  line: [],
  lengthKm: 2.345,
  blocked: false,
  startTime: null,
  delayMinutes: 3,
  averageSpeedKmh: 15,
  trafficType: 'QUEUING_TRAFFIC',
  details: ['a', 'b', 'c', 'd', 'e'],
};

test('the card names road and kind, lists facts and at most four feed lines', () => {
  const card = buildAutobahnCard(row);
  assert.equal(card.id, 'autobahn-card:w1');
  assert.equal(card.title, 'A1 · TRAFFIC WARNING');
  assert.equal(card.accent, autobahnAccent('warning'));
  assert.deepEqual(card.details, [
    'Bliesheim - Weilerswist-West',
    'Köln -> Euskirchen',
    '2.3 km · +3 min delay · avg 15 km/h',
    'a',
    'b',
    'c',
    'd',
    'Informational only · follow official signs',
  ]);
  assert.equal('position' in card, false);
});

test('missing facts are left out and each kind has its own colour', () => {
  const card = buildAutobahnCard({
    ...row,
    kind: 'closure',
    section: null,
    direction: null,
    lengthKm: null,
    delayMinutes: null,
    averageSpeedKmh: null,
    details: [],
  });
  assert.equal(card.title, 'A1 · CLOSURE');
  assert.deepEqual(card.details, [
    'Informational only · follow official signs',
  ]);
  const accents = new Set(
    ['closure', 'ramp-closure', 'warning', 'short-roadworks', 'roadworks'].map(
      autobahnAccent,
    ),
  );
  assert.equal(accents.size, 5);
});
