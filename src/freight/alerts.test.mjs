import test from 'node:test';
import assert from 'node:assert/strict';
import {
  alertItems,
  nextAlerts,
  normalizeAlertPins,
  normalizePushSubscription,
} from './alerts.js';

const closure = (stableId, road, lat, lon, extra = {}) => ({
  stableId,
  road,
  kind: 'closure',
  section: 'Hamburg-Stillhorn - Maschen',
  direction: 'Richtung Hannover',
  lat,
  lon,
  ...extra,
});
const HAMBURG = { id: 'place:hh', name: 'Hamburg', lat: 53.55, lon: 10.0 };

test('only real push services and well-formed keys are stored', () => {
  const keys = { p256dh: 'BOr3Z1_x-abc', auth: 'k8JV6Q' };
  assert.ok(
    normalizePushSubscription({
      endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
      keys,
    }),
  );
  assert.ok(
    normalizePushSubscription({
      endpoint: 'https://web.push.apple.com/QOx',
      keys,
    }),
  );
  for (const endpoint of [
    'http://fcm.googleapis.com/x',
    'https://evil.example/push',
    'https://169.254.169.254/',
    'nope',
  ])
    assert.equal(normalizePushSubscription({ endpoint, keys }), null, endpoint);
  assert.equal(
    normalizePushSubscription({
      endpoint: 'https://fcm.googleapis.com/x',
      keys: { p256dh: 'a b', auth: 'x' },
    }),
    null,
  );
});

test('pins are cleaned and capped', () => {
  const pins = normalizeAlertPins({
    roads: ['A7', 'A7', 'B5', 'A1'],
    places: [HAMBURG, { name: 'Nowhere', lat: 200, lon: 0 }, { name: 'x' }],
  });
  assert.deepEqual(pins.roads, ['A7', 'A1']);
  assert.equal(pins.places.length, 1);
  assert.equal(pins.places[0].name, 'Hamburg');
  const many = normalizeAlertPins({
    roads: Array.from({ length: 30 }, (_, i) => `A${i + 1}`),
  });
  assert.equal(many.roads.length, 20);
});

test('road and place closures, Kaub band, future closures left out', () => {
  const sub = {
    pins: { roads: ['A7'], places: [HAMBURG] },
    kaub: true,
    locale: 'de',
  };
  const items = alertItems(sub, {
    events: [
      closure('a7-1', 'A7', 53.45, 9.98),
      closure('a1-1', 'A1', 53.5, 10.05),
      closure('a1-far', 'A1', 51.5, 7.4),
      closure('a7-future', 'A7', 53.4, 9.9, { future: true }),
      { stableId: 'w', road: 'A7', kind: 'warning', lat: 53.4, lon: 9.9 },
    ],
    kaubLevelCm: 61,
  });
  assert.deepEqual([...items.keys()].sort(), [
    'c:a7-1',
    'k:very-low',
    'p:place:hh:a1-1',
  ]);
  assert.equal(items.get('c:a7-1').title, 'A7 gesperrt');
  assert.match(items.get('k:very-low').title, /Kaub jetzt 61 cm/);
});

test('the first check only records; later checks send what is new', () => {
  const sub = {
    pins: { roads: ['A7'], places: [] },
    kaub: true,
    locale: 'en',
    seen: null,
  };
  const first = nextAlerts(
    sub,
    alertItems(sub, { events: [closure('1', 'A7', 53, 10)], kaubLevelCm: 120 }),
  );
  assert.equal(first.send.length, 0);
  const second = nextAlerts(
    { ...sub, seen: first.seen },
    alertItems(sub, {
      events: [closure('1', 'A7', 53, 10), closure('2', 'A7', 53, 10)],
      kaubLevelCm: 70,
    }),
  );
  assert.deepEqual(
    second.send.map((item) => item.key),
    ['c:2', 'k:very-low'],
  );
  assert.equal(second.send[0].title, 'A7 closed');
  // Nothing new: nothing sent.
  const third = nextAlerts(
    { ...sub, seen: second.seen },
    alertItems(sub, { events: [closure('2', 'A7', 53, 10)], kaubLevelCm: 70 }),
  );
  assert.equal(third.send.length, 0);
});

test('many new closures become one summary', () => {
  const sub = { pins: { roads: ['A7'], places: [] }, locale: 'en', seen: [] };
  const events = ['1', '2', '3', '4', '5'].map((id) =>
    closure(id, 'A7', 53, 10),
  );
  const { send } = nextAlerts(sub, alertItems(sub, { events }));
  assert.equal(send.length, 1);
  assert.equal(send[0].title, '5 new closures on your roads and places');
});
