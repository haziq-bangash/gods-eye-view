import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DISRUPTION_KINDS,
  disruptionCard,
  disruptionCountLabel,
  disruptionPlace,
  disruptionSummary,
  disruptionTitle,
  sortDisruptions,
} from './disruptions.js';
import { MAIN_LAYERS, HIDDEN_FROM_MORE } from './mapLayers.js';
import { KIND_ICONS, layerIcon } from './icons.js';

const row = (stableId, kind, extra = {}) => ({
  stableId,
  kind,
  road: 'A7',
  section: 'Hamburg - Hannover',
  direction: 'Hamburg → Hannover',
  lat: 53,
  lon: 10,
  ...extra,
});

test('lists put the most disruptive first, then the biggest delay', () => {
  const rows = [
    row('w', 'warning', { delayMinutes: 5 }),
    row('r', 'roadworks'),
    row('c1', 'closure', { delayMinutes: 2 }),
    row('c2', 'closure', { delayMinutes: 30 }),
    row('x', 'ramp-closure'),
  ];
  assert.deepEqual(
    sortDisruptions(rows).map((r) => r.stableId),
    ['c2', 'c1', 'x', 'w', 'r'],
  );
  // The input is left alone.
  assert.equal(rows[0].stableId, 'w');
});

test('the summary counts every kind in disruption order', () => {
  const summary = disruptionSummary([
    row('a', 'warning'),
    row('b', 'warning'),
    row('c', 'closure'),
    row('d', 'unknown'),
  ]);
  assert.deepEqual(
    summary.map(({ kind }) => kind),
    DISRUPTION_KINDS,
  );
  assert.deepEqual(
    Object.fromEntries(summary.map(({ kind, count }) => [kind, count])),
    {
      closure: 1,
      'ramp-closure': 0,
      warning: 2,
      'short-roadworks': 0,
      roadworks: 0,
    },
  );
});

test('labels are plain words with plural counts', () => {
  assert.equal(disruptionTitle('closure'), 'Road closed');
  assert.equal(disruptionTitle('mystery'), 'Disruption');
  assert.equal(disruptionCountLabel('closure', 1), '1 road closed');
  assert.equal(disruptionCountLabel('closure', 10), '10 roads closed');
  assert.equal(disruptionCountLabel('warning', 2), '2 warnings');
  assert.equal(
    disruptionPlace(row('a', 'warning')),
    'Hamburg - Hannover · Hamburg → Hannover',
  );
  assert.equal(disruptionPlace({ section: '', direction: '' }), '');
});

test('a card carries only the facts the feed gave, each with a key for its icon', () => {
  const card = disruptionCard(
    row('c', 'closure', {
      delayMinutes: 25,
      lengthKm: 3.4,
      startTime: Date.UTC(2026, 10, 15, 6, 0),
      details: ['1', '2', '3', '4', '5', '6', '7'],
    }),
  );
  assert.equal(card.title, 'Road closed');
  assert.equal(card.kind, 'closure');
  assert.equal(card.road, 'A7');
  assert.deepEqual(
    card.facts.map(({ key }) => key),
    ['delay', 'length', 'since'],
  );
  assert.equal(card.facts[0].value, '+25 min');
  assert.equal(card.facts[0].emphasis, true);
  assert.equal(card.details.length, 6);
  assert.match(card.hint, /closed/);
  assert.deepEqual(disruptionCard(row('w', 'warning')).facts, []);
});

test('every listed layer and kind has an icon; tools stay out of "More on the map"', () => {
  for (const entry of MAIN_LAYERS) {
    const badge = entry.kind ? KIND_ICONS[entry.kind] : layerIcon(entry.id);
    assert.ok(badge?.icon, `${entry.id || entry.kind} has an icon`);
    assert.match(badge.color, /^#[0-9a-f]{6}$/);
  }
  for (const kind of DISRUPTION_KINDS) assert.ok(KIND_ICONS[kind]);
  assert.ok(
    layerIcon('not-a-layer').icon,
    'unknown layers fall back to a glyph',
  );
  for (const tool of ['cctv', 'street-level', 'directions'])
    assert.ok(HIDDEN_FROM_MORE.has(tool));
});
