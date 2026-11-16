import { inflateRawSync } from 'node:zlib';
import {
  buildTimetable,
  parseCsv,
  trainsBetween,
} from '../../src/freight/dbTrains.js';
import { coalesceProxyRequest } from './common/http.js';
import { createDelayTracker } from './dbTrainsDelays.js';
import { makeRateLimiter, clientKey } from './common/rate-limit.js';
import { admitSameSiteKeyless } from './common/same-site.js';
import { providerUserAgent } from './common/userAgent.js';

// Long-distance trains from gtfs.de's timetable (GTFS, CC BY 4.0, data from
// DELFI e.V.; keyless: https://gtfs.de/en/feeds/de_fv/). About 300 kB zipped,
// rebuilt by gtfs.de a few times a week. The URL is fixed here.
export const DB_TRAINS_FEED_URL =
  'https://download.gtfs.de/germany/fv_free/latest.zip';

const MIB = 1024 * 1024;
const FEED_MAX_BYTES = 16 * MIB;
/** Feed refresh; a failed refresh keeps the last timetable. */
const FEED_TTL_MS = 12 * 60 * 60 * 1000;
/** How far ahead a window reaches; the layer asks again well before. */
export const WINDOW_MS = 90 * 60 * 1000;
/** Trains stay in a window this long past their scheduled arrival, in case they run late. */
export const LATE_MS = 2 * 60 * 60 * 1000;
/** Windows are cut on the minute, so visitors share one. */
const WINDOW_STEP_MS = 60 * 1000;
const REQUEST_TIMEOUT_MS = 30_000;
const TABLES = [
  'stops',
  'routes',
  'trips',
  'stop_times',
  'calendar',
  'calendar_dates',
];

/**
 * The files of a zip archive by name (stored or deflated entries, read from
 * the central directory), limited to `wanted` names.
 * @param {Buffer} zip
 * @param {string[]} wanted
 * @returns {Map<string, Buffer>}
 */
export function readZip(zip, wanted) {
  const files = new Map();
  let end = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65_557); i -= 1)
    if (zip.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  if (end < 0) throw new Error('not_a_zip');
  const count = zip.readUInt16LE(end + 10);
  let at = zip.readUInt32LE(end + 16);
  for (let n = 0; n < count; n += 1) {
    if (zip.readUInt32LE(at) !== 0x02014b50) throw new Error('bad_zip');
    const method = zip.readUInt16LE(at + 10);
    const compressed = zip.readUInt32LE(at + 20);
    const nameLength = zip.readUInt16LE(at + 28);
    const extraLength = zip.readUInt16LE(at + 30);
    const commentLength = zip.readUInt16LE(at + 32);
    const local = zip.readUInt32LE(at + 42);
    const name = zip.toString('utf8', at + 46, at + 46 + nameLength);
    at += 46 + nameLength + extraLength + commentLength;
    if (!wanted.includes(name)) continue;
    if (zip.readUInt32LE(local) !== 0x04034b50) throw new Error('bad_zip');
    const start =
      local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const data = zip.subarray(start, start + compressed);
    if (method === 0) files.set(name, data);
    else if (method === 8)
      files.set(name, inflateRawSync(data, { maxOutputLength: 64 * MIB }));
    else throw new Error('unsupported_zip_method');
  }
  return files;
}

/** The timetable out of the feed's zip bytes. */
export function timetableFromZip(zip) {
  const files = readZip(
    zip,
    TABLES.map((name) => `${name}.txt`),
  );
  const tables = {};
  for (const name of TABLES) {
    const file = files.get(`${name}.txt`);
    tables[name] = file ? parseCsv(file.toString('utf8')) : [];
  }
  const timetable = buildTimetable(tables);
  if (!timetable.runs.length) throw new Error('empty_timetable');
  return timetable;
}

/** Fixed-origin, bounded long-distance train route for dev and preview. */
export function dbTrainsProxy({
  fetchImpl = (...args) => globalThis.fetch(...args),
  now = () => Date.now(),
  delayTracker = null,
} = {}) {
  let feed = null;
  let window = null;
  const inFlight = new Map();
  const allow = makeRateLimiter({ windowMs: 60_000, max: 30, globalMax: 600 });

  async function download() {
    const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    const response = await fetchImpl(DB_TRAINS_FEED_URL, {
      signal,
      redirect: 'follow',
      headers: { 'User-Agent': providerUserAgent('db-trains') },
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error('upstream_unavailable');
    }
    const declared = Number(response.headers.get('content-length'));
    if (declared > FEED_MAX_BYTES) {
      await response.body?.cancel();
      throw new Error('feed_too_large');
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > FEED_MAX_BYTES) throw new Error('feed_too_large');
    return timetableFromZip(bytes);
  }

  async function timetable() {
    if (feed && now() - feed.savedAt < FEED_TTL_MS) return feed.value;
    try {
      const { promise } = coalesceProxyRequest(inFlight, 'feed', async () => {
        const value = await download();
        feed = { value, savedAt: now() };
        window = null;
        return value;
      });
      return await promise;
    } catch (error) {
      if (feed) return feed.value;
      throw error;
    }
  }

  async function current() {
    const value = await timetable();
    const from = Math.floor(now() / WINDOW_STEP_MS) * WINDOW_STEP_MS;
    if (window?.from !== from || window.timetable !== value)
      window = {
        from,
        timetable: value,
        body: JSON.stringify({
          ...trainsBetween(value, from, from + WINDOW_MS, {
            since: from - LATE_MS,
          }),
          fetchedAt: feed?.savedAt ?? null,
        }),
      };
    return window.body;
  }

  async function handler(req, res) {
    const send = (status, body) => {
      if (res.destroyed) return;
      res.writeHead(status, {
        'Content-Type': 'application/json',
        'Cache-Control': status === 200 ? 'public, max-age=60' : 'no-store',
        ...(status === 405 ? { Allow: 'GET' } : {}),
        ...(status === 429 ? { 'Retry-After': '60' } : {}),
      });
      res.end(body);
    };
    if (admitSameSiteKeyless(req, res)) return;
    if (req.method !== 'GET')
      return send(405, '{"error":"method_not_allowed"}');
    const path = (req.url || '/').split('?')[0];
    if (path !== '/now' && path !== '/delays')
      return send(404, '{"error":"unknown_route"}');
    if (!allow(clientKey(req))) return send(429, '{"error":"rate_limited"}');
    try {
      send(
        200,
        path === '/now'
          ? await current()
          : JSON.stringify(await delays.delays()),
      );
    } catch {
      send(502, '{"error":"db_trains_unavailable"}');
    }
  }
  const delays =
    delayTracker ||
    createDelayTracker({ fetchImpl, now, timetable: () => timetable() });

  return {
    name: 'db-trains',
    configureServer({ middlewares }) {
      middlewares.use('/api/db-trains', handler);
    },
    configurePreviewServer({ middlewares }) {
      middlewares.use('/api/db-trains', handler);
    },
  };
}
