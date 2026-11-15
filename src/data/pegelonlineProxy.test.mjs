import test from 'node:test';
import assert from 'node:assert/strict';
import { pegelonlineProxy } from '../../server/providers/pegelonline.js';
import { PEGELONLINE_STATIONS_URL } from '../layers/riverLevels/records.js';

const station = (shortname, uuid) => ({
  uuid,
  shortname,
  longname: shortname,
  km: 1,
  latitude: 50,
  longitude: 8,
  water: { shortname: 'RHEIN' },
  timeseries: [
    {
      shortname: 'W',
      currentMeasurement: {
        timestamp: '2026-11-15T10:30:00+01:00',
        value: 59,
        stateMnwMhw: 'low',
      },
    },
  ],
});
const series = [
  { timestamp: '2026-11-14T10:30:00+01:00', value: 71 },
  { timestamp: '2026-11-15T10:30:00+01:00', value: 59 },
];

function install(options = {}, hook = 'configureServer') {
  let handler;
  const plugin = pegelonlineProxy(options);
  assert.equal(plugin.name, 'pegelonline');
  plugin[hook]({
    middlewares: {
      use(path, callback) {
        assert.equal(path, '/api/pegel');
        handler = callback;
      },
    },
  });
  return async (url = '/gauges', method = 'GET') => {
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

function upstream({ stations = true, trends = true } = {}) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push(url);
    assert.ok(options.signal instanceof AbortSignal);
    assert.equal(options.redirect, 'error');
    assert.match(options.headers['User-Agent'], /pegelonline/);
    assert.ok(url.startsWith('https://www.pegelonline.wsv.de/'));
    if (url === PEGELONLINE_STATIONS_URL)
      return stations
        ? Response.json([station('KAUB', 'k'), station('BINGEN', 'b')])
        : new Response('down', { status: 503 });
    if (url.includes('/WV/'))
      return Response.json([
        { timestamp: '2026-11-15T17:00:00+01:00', value: 57, type: 'forecast' },
        {
          timestamp: '2026-11-19T07:00:00+01:00',
          value: 100,
          type: 'estimate',
        },
      ]);
    return trends
      ? Response.json(series)
      : new Response('down', { status: 503 });
  };
  return { calls, fetchImpl };
}

for (const hook of ['configureServer', 'configurePreviewServer']) {
  test(`${hook}: one station list plus a trend for each key gauge`, async () => {
    const { calls, fetchImpl } = upstream();
    const request = install({ fetchImpl, now: () => 7 }, hook);
    const res = await request('/gauges?url=https://invalid.example');
    assert.equal(res.status, 200);
    assert.equal(res.headers['Cache-Control'], 'no-store');
    assert.equal(calls.length, 3);
    assert.match(calls[1], /stations\/k\/W\/measurements\.json/);
    assert.match(calls[2], /stations\/k\/WV\/measurements\.json/);
    assert.equal(res.body.fetchedAt, 7);
    const byName = Object.fromEntries(
      res.body.rows.map((row) => [row.shortname, row]),
    );
    assert.equal(byName.KAUB.trendCm, -12);
    assert.equal(byName.KAUB.series.length, 2);
    assert.equal(byName.KAUB.series[1][1], 59);
    assert.deepEqual(
      byName.KAUB.forecast.map(([, value, estimate]) => [value, estimate]),
      [
        [57, false],
        [100, true],
      ],
    );
    assert.equal(byName.BINGEN.series, undefined);
    assert.equal(byName.BINGEN.trendCm, null);
  });
}

test('a failed trend is left out; the cache holds for 15 minutes', async () => {
  let clock = 0;
  const { calls, fetchImpl } = upstream({ trends: false });
  const request = install({ fetchImpl, now: () => clock });
  const first = await request();
  assert.equal(first.status, 200);
  assert.equal(first.body.rows[0].trendCm, null);
  clock = 14 * 60 * 1000;
  await request();
  assert.equal(calls.length, 2);
  clock = 16 * 60 * 1000;
  await request();
  assert.equal(calls.length, 4);
});

test('a failed refresh serves the last snapshot as stale, then 502', async () => {
  let clock = 0;
  let up = true;
  const fetchImpl = async (url, options) =>
    up
      ? upstream().fetchImpl(url, options)
      : new Response('x', { status: 503 });
  const request = install({ fetchImpl, now: () => clock });
  assert.equal((await request()).status, 200);
  up = false;
  clock = 20 * 60 * 1000;
  const stale = await request();
  assert.equal(stale.body.stale, true);
  assert.equal(stale.headers['X-Data-Stale'], 'true');
  clock = 13 * 60 * 60 * 1000;
  const gone = await request();
  assert.equal(gone.status, 502);
  assert.deepEqual(gone.body, { error: 'pegelonline_unavailable' });
});

test('only GET /gauges is served', async () => {
  const { calls, fetchImpl } = upstream();
  const request = install({ fetchImpl });
  assert.equal((await request('/gauges', 'POST')).status, 405);
  assert.equal((await request('/')).status, 404);
  assert.equal(calls.length, 0);
});
