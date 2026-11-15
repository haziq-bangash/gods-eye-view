import test from 'node:test';
import assert from 'node:assert/strict';
import { checkOnce } from '../scripts/send-alerts.mjs';

function memoryStore(records) {
  const map = new Map(records.map((record) => [record.id, record]));
  return {
    map,
    all: async () => [...map.values()],
    save: async (record) => void map.set(record.id, record),
    remove: async (id) => void map.delete(id),
  };
}
const closure = (stableId, road) => ({
  stableId,
  road,
  kind: 'closure',
  lat: 53,
  lon: 10,
});

test('a new closure is pushed once; a gone subscription is deleted', async () => {
  const store = memoryStore([
    {
      id: 'a',
      subscription: { endpoint: 'https://fcm.googleapis.com/a' },
      pins: { roads: ['A7'], places: [] },
      locale: 'en',
      seen: ['c:old'],
    },
    {
      id: 'b',
      subscription: { endpoint: 'https://fcm.googleapis.com/b' },
      pins: { roads: ['A7'], places: [] },
      locale: 'en',
      seen: [],
    },
    {
      id: 'c',
      subscription: { endpoint: 'https://fcm.googleapis.com/c' },
      pins: { roads: ['A1'], places: [] },
      locale: 'en',
      seen: null,
    },
  ]);
  const pushed = [];
  const send = async (subscription, payload) => {
    if (subscription.endpoint.endsWith('/b'))
      throw Object.assign(new Error('gone'), { statusCode: 410 });
    pushed.push([subscription.endpoint, JSON.parse(payload)]);
  };
  const events = [
    closure('old', 'A7'),
    closure('new', 'A7'),
    closure('x', 'A1'),
  ];
  const result = await checkOnce({ store, send, events, kaubLevelCm: null });
  assert.deepEqual(result, { subscribers: 3, sent: 1, removed: 1 });
  assert.equal(pushed[0][1].title, 'A7 closed');
  assert.equal(pushed[0][1].tag, 'c:new');
  assert.equal(store.map.has('b'), false);
  assert.deepEqual(
    store.map.get('c').seen,
    ['c:x'],
    'a new subscriber starts quiet',
  );
  // The next run sends nothing new.
  pushed.length = 0;
  const again = await checkOnce({ store, send, events, kaubLevelCm: null });
  assert.equal(again.sent, 0);
});
