import test from 'node:test';
import assert from 'node:assert/strict';
import { dwdWarningsProxy } from '../../server/providers/dwdWarnings.js';
import { DWD_WARNINGS_URL } from '../layers/weatherWarnings/records.js';
import { createWeatherWarningSource } from '../layers/weatherWarnings/source.js';

const NOW = Date.UTC(2026, 10, 15, 12);
const payload = {
  features: [
    {
      type: 'Feature',
      geometry: {
        type: 'MultiPolygon',
        coordinates: [
          [
            [
              [8.123456, 50.1],
              [9, 50.1],
              [9, 51],
              [8.123456, 50.1],
            ],
          ],
        ],
      },
      properties: {
        IDENTIFIER: 'w1',
        STATUS: 'Actual',
        SEVERITY: 'Moderate',
        EC_GROUP: 'WIND',
        EVENT: 'STURMBÖEN',
        ONSET: '2026-11-15T10:00:00Z',
        EXPIRES: '2026-11-15T20:00:00Z',
        HEADLINE: 'Amtliche WARNUNG vor STURMBÖEN',
        SENDER: 'opendata@dwd.de',
      },
    },
  ],
};

function install(options = {}, hook = 'configureServer') {
  let handler;
  const plugin = dwdWarningsProxy(options);
  assert.equal(plugin.name, 'dwd-warnings');
  plugin[hook]({
    middlewares: {
      use(path, callback) {
        assert.equal(path, '/api/dwd');
        handler = callback;
      },
    },
  });
  return async (url = '/warnings', method = 'GET') => {
    const res = {
      writeHead(status, headers) {
        this.status = status;
        this.headers = headers;
      },
      end(body) {
        this.body = JSON.parse(body);
      },
    };
    await handler(
      { url, method, headers: {}, socket: { remoteAddress: 'local' } },
      res,
    );
    return res;
  };
}

function upstream(ok = () => true) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push(url);
    assert.ok(options.signal instanceof AbortSignal);
    assert.equal(options.redirect, 'error');
    assert.match(options.headers['User-Agent'], /dwd-warnings/);
    return ok()
      ? Response.json(payload)
      : new Response('down', { status: 503 });
  };
  return { calls, fetchImpl };
}

for (const hook of ['configureServer', 'configurePreviewServer']) {
  test(`${hook}: one fixed WFS request, rows trimmed and rounded`, async () => {
    const { calls, fetchImpl } = upstream();
    const request = install({ fetchImpl, now: () => NOW }, hook);
    const res = await request('/warnings?url=https://invalid.example');
    assert.equal(res.status, 200);
    assert.deepEqual(calls, [DWD_WARNINGS_URL]);
    assert.equal(res.body.fetchedAt, NOW);
    const [row] = res.body.rows;
    assert.equal(row.level, 'moderate');
    assert.equal(row.polygons[0][0][0][0], 8.1235);
    assert.equal(row.SENDER, undefined);
  });
}

test('the cache holds five minutes; a failed refresh serves stale for an hour', async () => {
  let clock = NOW;
  let up = true;
  const { calls, fetchImpl } = upstream(() => up);
  const request = install({ fetchImpl, now: () => clock });
  await request();
  clock += 4 * 60_000;
  await request();
  assert.equal(calls.length, 1);
  up = false;
  clock += 2 * 60_000;
  const stale = await request();
  assert.equal(stale.body.stale, true);
  assert.equal(stale.headers['X-Data-Stale'], 'true');
  clock += 2 * 3_600_000;
  const gone = await request();
  assert.equal(gone.status, 502);
  assert.deepEqual(gone.body, { error: 'dwd_unavailable' });
});

test('only GET /warnings is served', async () => {
  const { calls, fetchImpl } = upstream();
  const request = install({ fetchImpl });
  assert.equal((await request('/warnings', 'POST')).status, 405);
  assert.equal((await request('/')).status, 404);
  assert.equal(calls.length, 0);
});

test('the source reads rows and staleness from the same-origin route', async () => {
  const urls = [];
  const source = createWeatherWarningSource({
    fetchImpl: async (url) => {
      urls.push(url);
      return Response.json({
        fetchedAt: 3,
        stale: true,
        rows: [{ stableId: 'w' }],
      });
    },
  });
  assert.deepEqual(await source.getSnapshotDetail(), {
    rows: [{ stableId: 'w' }],
    stale: true,
    fetchedAt: 3,
  });
  assert.deepEqual(urls, ['/api/dwd/warnings']);
  const failing = createWeatherWarningSource({
    fetchImpl: async () => new Response('{}', { status: 502 }),
  });
  await assert.rejects(failing.getSnapshot(), /DWD HTTP 502/);
});
