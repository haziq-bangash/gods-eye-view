import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import {
  DB_TRAINS_FEED_URL,
  dbTrainsProxy,
  readZip,
} from '../../server/providers/dbTrains.js';

/** A zip of text files, deflated, as gtfs.de serves the feed. */
function zip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const nameBytes = Buffer.from(name);
    const data = deflateRawSync(Buffer.from(text));
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt16LE(nameBytes.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, data);
    centrals.push(central, nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

const FEED = {
  'agency.txt': 'agency_id,agency_name\n1,DB Fernverkehr AG\n',
  'stops.txt':
    'stop_name,stop_id,stop_lat,stop_lon\nHamburg Hbf,HH,53.553,10.006\nHannover Hbf,H,52.377,9.741\n',
  'routes.txt': 'route_id,route_short_name\nr1,ICE 22\n',
  'trips.txt': 'route_id,service_id,trip_id\nr1,daily,t1\n',
  'stop_times.txt':
    'trip_id,arrival_time,departure_time,stop_id,stop_sequence\nt1,10:00:00,10:00:00,HH,0\nt1,11:15:00,11:15:00,H,1\n',
  'calendar.txt':
    'monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date,service_id\n1,1,1,1,1,1,1,20260101,20271231,daily\n',
  'calendar_dates.txt': 'service_id,exception_type,date\n',
};

function install(options) {
  let handler;
  const plugin = dbTrainsProxy(options);
  assert.equal(plugin.name, 'db-trains');
  plugin.configurePreviewServer({
    middlewares: {
      use(path, callback) {
        assert.equal(path, '/api/db-trains');
        handler = callback;
      },
    },
  });
  return async (url = '/now', method = 'GET') => {
    const res = {
      writeHead(status, headers) {
        this.status = status;
        this.headers = headers;
      },
      setHeader() {},
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

test('reads only the wanted files out of a zip', () => {
  const files = readZip(zip({ 'a.txt': 'one', 'b.txt': 'two' }), ['b.txt']);
  assert.deepEqual([...files.keys()], ['b.txt']);
  assert.equal(files.get('b.txt').toString(), 'two');
  assert.throws(() => readZip(Buffer.from('not a zip'), []), /not_a_zip/);
});

test('serves the trains of the next 90 minutes and downloads the feed once', async () => {
  const urls = [];
  // 10:30 Berlin on a winter Monday.
  let clock = Date.UTC(2026, 10, 16, 9, 30);
  const request = install({
    now: () => clock,
    fetchImpl: async (url) => {
      urls.push(url);
      return new Response(zip(FEED));
    },
  });
  const first = await request();
  assert.equal(first.status, 200);
  assert.equal(first.body.from, clock);
  assert.equal(first.body.until - first.body.from, 90 * 60_000);
  assert.deepEqual(
    first.body.trains.map((train) => [train.id, train.line]),
    [['t1@20261116', 'ICE 22']],
  );
  assert.deepEqual(first.body.stations[0], ['Hamburg Hbf', 53.553, 10.006]);
  clock += 5 * 60_000;
  const second = await request();
  assert.equal(second.body.from, clock);
  assert.deepEqual(urls, [DB_TRAINS_FEED_URL]);
});

test('keeps the last timetable when a refresh fails, and fails cleanly without one', async () => {
  let clock = Date.UTC(2026, 10, 16, 9, 30);
  let up = true;
  const request = install({
    now: () => clock,
    fetchImpl: async () =>
      up ? new Response(zip(FEED)) : new Response('', { status: 503 }),
  });
  assert.equal((await request()).status, 200);
  up = false;
  clock += 13 * 60 * 60_000;
  assert.equal((await request()).status, 200);

  const down = install({
    fetchImpl: async () => new Response('', { status: 503 }),
  });
  const failed = await down();
  assert.equal(failed.status, 502);
  assert.equal(failed.body.error, 'db_trains_unavailable');
  assert.equal((await down('/other')).status, 404);
  assert.equal((await down('/now', 'POST')).status, 405);
});

test('reads one hub in turns and reports the ICE twelve minutes late', async () => {
  const { createDelayTracker } =
    await import('../../server/providers/dbTrainsDelays.js');
  const { timetableFromZip } =
    await import('../../server/providers/dbTrains.js');
  const timetable = timetableFromZip(zip(FEED));
  // 10:30 Berlin; t1 is due at Hannover at 11:15.
  const clock = Date.UTC(2026, 10, 16, 9, 30);
  const paths = [];
  const tracker = createDelayTracker({
    now: () => clock,
    hubs: ['Hannover Hbf'],
    timetable: async () => timetable,
    credentials: () => ({ clientId: 'id', apiKey: 'key' }),
    setTimer: () => 1,
    clearTimer: () => {},
    fetchImpl: async (url, { headers }) => {
      assert.equal(headers['DB-Client-Id'], 'id');
      assert.equal(headers['DB-Api-Key'], 'key');
      const path = url.split('/timetables/v1')[1];
      paths.push(path);
      if (path.startsWith('/station/'))
        return new Response(
          '<stations><station name="Hannover Hbf" eva="8000152"/></stations>',
        );
      if (path === '/plan/8000152/261116/11')
        return new Response(
          '<timetable><s id="x-1"><tl c="ICE" n="587"/><ar pt="2611161115"/></s></timetable>',
        );
      if (path.startsWith('/plan/')) return new Response('', { status: 404 });
      return new Response(
        '<timetable><s id="x-1"><ar ct="2611161127"/></s></timetable>',
      );
    },
  });
  assert.deepEqual((await tracker.delays()).trains, {});
  for (let i = 0; i < 4; i += 1) await tracker.step();
  assert.deepEqual(paths, [
    '/station/Hannover%20Hbf',
    '/plan/8000152/261116/10',
    '/fchg/8000152',
    '/plan/8000152/261116/11',
  ]);
  const delays = await tracker.delays();
  assert.equal(delays.configured, true);
  assert.deepEqual(delays.trains['t1@20261116'], {
    number: 'ICE 587',
    delay: 720,
    cancelled: false,
  });
  // Nothing more is due for two minutes.
  assert.equal(tracker.nextTask(), null);
});

test('without DB keys the delay route says so and calls nobody', async () => {
  const { createDelayTracker } =
    await import('../../server/providers/dbTrainsDelays.js');
  let calls = 0;
  const tracker = createDelayTracker({
    credentials: () => null,
    timetable: async () => ({ runs: [] }),
    fetchImpl: async () => {
      calls += 1;
      return new Response('');
    },
  });
  const request = install({
    delayTracker: tracker,
    fetchImpl: async () => new Response(zip(FEED)),
  });
  const answer = await request('/delays');
  assert.equal(answer.status, 200);
  assert.deepEqual(answer.body, {
    configured: false,
    updatedAt: null,
    trains: {},
  });
  assert.equal(calls, 0);
});

test('refused keys pause the calls for five minutes, then everything is tried again', async () => {
  const { createDelayTracker } =
    await import('../../server/providers/dbTrainsDelays.js');
  let clock = Date.UTC(2026, 10, 16, 9, 30);
  let calls = 0;
  const tracker = createDelayTracker({
    now: () => clock,
    hubs: ['Hannover Hbf'],
    timetable: async () => ({
      runs: [],
      stations: new Map(),
      services: new Map(),
    }),
    credentials: () => ({ clientId: 'id', apiKey: 'wrong' }),
    setTimer: () => 1,
    clearTimer: () => {},
    fetchImpl: async () => {
      calls += 1;
      return new Response('', { status: 401 });
    },
  });
  await tracker.delays();
  await tracker.step();
  assert.equal(calls, 1);
  assert.equal((await tracker.delays()).error, 'timetables_401');
  clock += 4 * 60_000;
  await tracker.step();
  assert.equal(calls, 1);
  clock += 2 * 60_000;
  await tracker.delays();
  assert.deepEqual(tracker.nextTask(), {
    kind: 'station',
    hub: 'Hannover Hbf',
  });
  await tracker.step();
  assert.equal(calls, 2);
});
