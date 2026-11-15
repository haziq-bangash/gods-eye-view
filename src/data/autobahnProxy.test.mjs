import test from 'node:test';
import assert from 'node:assert/strict';
import {
  autobahnProxy,
  autobahnServiceUrl,
} from '../../server/providers/autobahn.js';

const item = (id, displayType = 'CLOSURE', extra = {}) => ({
  identifier: id,
  display_type: displayType,
  future: false,
  isBlocked: 'false',
  title: 'A1 | Hamburg-Harburg - Hamburg-Süderelbe',
  subtitle: ' Bremen -> Hamburg',
  coordinate: { lat: '53.46', long: '9.98' },
  description: ['Länge: 2.5 km'],
  geometry: {
    type: 'LineString',
    coordinates: [
      [9.98, 53.46],
      [9.99, 53.47],
    ],
  },
  ...extra,
});

function install(options = {}, hook = 'configureServer') {
  let handler;
  const plugin = autobahnProxy(options);
  assert.equal(plugin.name, 'autobahn');
  plugin[hook]({
    middlewares: {
      use(path, callback) {
        assert.equal(path, '/api/autobahn');
        handler = callback;
      },
    },
  });
  return async (url = '/events', method = 'GET', peer = 'local') => {
    const res = {
      headers: {},
      writeHead(status, headers) {
        this.status = status;
        this.headers = headers;
      },
      setHeader(name, value) {
        this.headers[name] = value;
      },
      end(body) {
        this.status ??= this.statusCode;
        this.body = JSON.parse(body);
      },
    };
    await handler(
      { url, method, headers: {}, socket: { remoteAddress: peer } },
      res,
    );
    return res;
  };
}

/** A fake upstream answering per road/service from the URL. */
function upstream(respond) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push(url);
    assert.ok(options.signal instanceof AbortSignal);
    assert.equal(options.redirect, 'error');
    assert.match(options.headers['User-Agent'], /autobahn/);
    const [, road, service] = /\/autobahn\/([^/]+)\/services\/([^/]+)$/.exec(
      url,
    );
    return respond(road, service);
  };
  return { calls, fetchImpl };
}

for (const hook of ['configureServer', 'configurePreviewServer']) {
  test(`${hook}: fetches every road and service from the fixed origin and merges events`, async () => {
    const { calls, fetchImpl } = upstream((road, service) =>
      Response.json({
        [service]:
          service === 'closure'
            ? [item(`${road}-closure`), item('shared-closure')]
            : [],
      }),
    );
    const request = install(
      { fetchImpl, now: () => 1234, roads: ['A1', 'A7'] },
      hook,
    );
    const res = await request('/events?url=https://invalid.example');
    assert.equal(res.status, 200);
    assert.equal(res.headers['Cache-Control'], 'no-store');
    assert.deepEqual(calls.sort(), [
      autobahnServiceUrl('A1', 'closure'),
      autobahnServiceUrl('A1', 'roadworks'),
      autobahnServiceUrl('A1', 'warning'),
      autobahnServiceUrl('A7', 'closure'),
      autobahnServiceUrl('A7', 'roadworks'),
      autobahnServiceUrl('A7', 'warning'),
    ]);
    for (const url of calls)
      assert.ok(url.startsWith('https://verkehr.autobahn.de/o/autobahn/'));
    assert.equal(res.body.fetchedAt, 1234);
    assert.deepEqual(res.body.roads, ['A1', 'A7']);
    assert.deepEqual(res.body.failed, []);
    // The event both roads report appears once, under the first road.
    assert.deepEqual(
      res.body.rows.map(({ stableId, road }) => [stableId, road]),
      [
        ['A1-closure', 'A1'],
        ['shared-closure', 'A1'],
        ['A7-closure', 'A7'],
      ],
    );
  });
}

test('a refresh within five minutes is served from the cache', async () => {
  let clock = 0;
  const { calls, fetchImpl } = upstream((road, service) =>
    Response.json({ [service]: [] }),
  );
  const request = install({ fetchImpl, now: () => clock, roads: ['A1'] });
  assert.equal((await request()).status, 200);
  clock = 4 * 60 * 1000;
  assert.equal((await request()).status, 200);
  assert.equal(calls.length, 3);
  clock = 6 * 60 * 1000;
  assert.equal((await request()).status, 200);
  assert.equal(calls.length, 6);
});

test('a partial refresh lists the failed feeds; too many failures keep the last snapshot', async () => {
  let clock = 0;
  let failing = new Set(['A7/warning']);
  const { fetchImpl } = upstream((road, service) =>
    failing.has(`${road}/${service}`)
      ? new Response('down', { status: 503 })
      : Response.json({ [service]: [item(`${road}-${service}`, 'WARNING')] }),
  );
  const request = install({ fetchImpl, now: () => clock, roads: ['A1', 'A7'] });
  const partial = await request();
  assert.equal(partial.status, 200);
  assert.deepEqual(partial.body.failed, ['A7/warning']);
  assert.equal(partial.body.rows.length, 5);

  clock = 10 * 60 * 1000;
  failing = new Set(['A1/closure', 'A1/roadworks', 'A1/warning', 'A7/closure']);
  const stale = await request();
  assert.equal(stale.status, 200);
  assert.equal(stale.body.stale, true);
  assert.equal(stale.headers['X-Data-Stale'], 'true');
  assert.equal(stale.body.rows.length, 5);
});

test('no snapshot and no upstream answers 502; malformed payloads count as failures', async () => {
  const { fetchImpl } = upstream(() => Response.json({ unexpected: true }));
  const request = install({ fetchImpl, roads: ['A1'] });
  const res = await request();
  assert.equal(res.status, 502);
  assert.deepEqual(res.body, { error: 'autobahn_unavailable' });
});

test('only GET /events is served', async () => {
  const { calls, fetchImpl } = upstream((road, service) =>
    Response.json({ [service]: [] }),
  );
  const request = install({ fetchImpl, roads: ['A1'] });
  assert.equal((await request('/events', 'POST')).status, 405);
  assert.equal((await request('/')).status, 404);
  assert.equal((await request('/A1/services/closure')).status, 404);
  assert.equal(calls.length, 0);
});

test('GET /parking reads every road’s truck parking once and caches it', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push(url);
    assert.equal(options.redirect, 'error');
    const [, road] = /\/autobahn\/([^/]+)\/services\/parking_lorry$/.exec(url);
    return Response.json({
      parking_lorry: [
        {
          identifier: `${road}-p`,
          coordinate: { lat: '52', long: '9' },
          description: ['LKW Stellplätze: 20'],
        },
      ],
    });
  };
  let clock = 0;
  const request = install({ fetchImpl, now: () => clock, roads: ['A1', 'A7'] });
  const res = await request('/parking');
  assert.equal(res.status, 200);
  assert.deepEqual(
    res.body.rows.map(({ stableId, lorrySpaces }) => [stableId, lorrySpaces]),
    [
      ['A1-p', 20],
      ['A7-p', 20],
    ],
  );
  assert.deepEqual(res.body.failed, []);
  clock = 5 * 3_600_000;
  await request('/parking');
  assert.equal(calls.length, 2);
});
