import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { alertsProxy } from '../server/providers/alerts.js';

function memoryStore() {
  const map = new Map();
  return {
    map,
    get: async (id) => map.get(id) || null,
    count: async () => map.size,
    save: async (record) => void map.set(record.id, record),
    remove: async (id) => void map.delete(id),
  };
}

async function serve(t, options) {
  let handler;
  alertsProxy(options).configureServer({
    middlewares: { use: (prefix, fn) => (handler = fn) },
  });
  const server = http.createServer((req, res) => {
    req.url = req.url.replace(/^\/api\/alerts/, '');
    handler(req, res);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  return {
    get: (path) => fetch(`${origin}/api/alerts${path}`),
    post: (path, body, headers = {}) =>
      fetch(`${origin}/api/alerts${path}`, {
        method: 'POST',
        headers: {
          Origin: origin,
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify(body),
      }),
  };
}

const subscription = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
  keys: { p256dh: 'BOr3Z1_x-abc', auth: 'k8JV6Q' },
};

test('config says whether alerts are set up', async (t) => {
  const off = await serve(t, { env: {}, store: null });
  assert.deepEqual(await (await off.get('/config')).json(), {
    enabled: false,
    publicKey: null,
    maxPins: 20,
  });
  const on = await serve(t, {
    env: { VAPID_PUBLIC_KEY: 'BPub' },
    store: memoryStore(),
  });
  assert.equal((await (await on.get('/config')).json()).publicKey, 'BPub');
});

test('subscribe stores clean pins and keeps what was already told', async (t) => {
  const store = memoryStore();
  const api = await serve(t, { env: { VAPID_PUBLIC_KEY: 'BPub' }, store });
  const response = await api.post('/subscribe', {
    subscription,
    pins: {
      roads: ['A7', 'B1'],
      places: [{ id: 'hh', name: 'Hamburg', lat: 53.55, lon: 10 }],
    },
    kaub: true,
    locale: 'de',
  });
  assert.equal(response.status, 200);
  const [record] = store.map.values();
  assert.deepEqual(record.pins.roads, ['A7']);
  assert.equal(record.kaub, true);
  assert.equal(record.locale, 'de');
  assert.equal(record.seen, null, 'a new subscriber starts quiet');
  store.map.set(record.id, { ...record, seen: ['c:1'] });
  await api.post('/subscribe', { subscription, pins: { roads: ['A1'] } });
  const updated = store.map.get(record.id);
  assert.deepEqual(updated.pins.roads, ['A1']);
  assert.deepEqual(updated.seen, ['c:1']);
  assert.equal(updated.kaub, false);
  // Unsubscribe deletes it.
  assert.equal(
    (await api.post('/unsubscribe', { endpoint: subscription.endpoint }))
      .status,
    200,
  );
  assert.equal(store.map.size, 0);
});

test('bad subscriptions, missing Origin and non-JSON are refused', async (t) => {
  const store = memoryStore();
  const api = await serve(t, { env: { VAPID_PUBLIC_KEY: 'BPub' }, store });
  assert.equal(
    (
      await api.post('/subscribe', {
        subscription: { ...subscription, endpoint: 'https://evil.example/x' },
      })
    ).status,
    400,
  );
  assert.equal(
    (await api.post('/subscribe', { subscription }, { Origin: '' })).status,
    403,
  );
  assert.equal(
    (
      await api.post(
        '/subscribe',
        { subscription },
        { 'Content-Type': 'text/plain' },
      )
    ).status,
    415,
  );
  assert.equal(store.map.size, 0);
});

test('without the server set up, subscribing answers 503', async (t) => {
  const api = await serve(t, { env: {}, store: null });
  assert.equal((await api.post('/subscribe', { subscription })).status, 503);
});
