import {
  AUTOBAHN_EVENT_SERVICES,
  AUTOBAHN_ROADS,
  mergeAutobahnRows,
  normalizeAutobahnServicePayload,
} from '../../src/layers/autobahn/records.js';
import {
  mergeTruckParkingRows,
  normalizeTruckParkingPayload,
  truckParkingUrl,
} from '../../src/layers/truckParking/records.js';
import { readResponseJsonCapped, coalesceProxyRequest } from './common/http.js';
import { makeRateLimiter, clientKey } from './common/rate-limit.js';
import { admitSameSiteKeyless } from './common/same-site.js';
import { providerUserAgent } from './common/userAgent.js';

// Autobahn GmbH traffic information (public, keyless, community-documented:
// https://github.com/bundesAPI/autobahn-api). One request per road and
// service; the road list is fixed here so a client can never choose the URL.
const API_BASE = 'https://verkehr.autobahn.de/o/autobahn';

const MIB = 1024 * 1024;
/** Closures and warnings change within minutes; roadworks rarely. */
const SNAPSHOT_TTL_MS = 5 * 60 * 1000;
/** Rest areas and their spaces change rarely. */
const PARKING_TTL_MS = 6 * 60 * 60 * 1000;
/** Longest a failed refresh keeps serving the last snapshot, marked stale. */
const STALE_MAX_MS = 6 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 20_000;
/** Parallel upstream requests per refresh: polite to a free public service. */
const UPSTREAM_CONCURRENCY = 4;

export const autobahnServiceUrl = (road, service) =>
  `${API_BASE}/${encodeURIComponent(road)}/services/${encodeURIComponent(service)}`;

/** Run `task` over `items` with at most `limit` in flight; results in order. */
async function mapLimited(items, limit, task) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await task(items[index]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return results;
}

/** Fixed-origin, bounded Autobahn event routes for dev and preview. */
export function autobahnProxy({
  fetchImpl = (...args) => globalThis.fetch(...args),
  now = () => Date.now(),
  roads = AUTOBAHN_ROADS,
} = {}) {
  const cache = new Map();
  const inFlight = new Map();
  const allow = makeRateLimiter({ windowMs: 60_000, max: 60, globalMax: 1200 });

  async function upstream(url) {
    const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    const response = await fetchImpl(url, {
      signal,
      redirect: 'error',
      headers: {
        Accept: 'application/json',
        'User-Agent': providerUserAgent('autobahn'),
      },
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error('upstream_unavailable');
    }
    return readResponseJsonCapped(response, 8 * MIB, signal);
  }

  // Each road/service request may fail on its own. A snapshot is accepted
  // when at least half of them answered; the failed ones are listed so the
  // layer can say coverage is partial. Fewer is a failed refresh, so the last
  // good snapshot stays.
  async function fetchEvents() {
    const requests = roads.flatMap((road) =>
      AUTOBAHN_EVENT_SERVICES.map((service) => ({ road, service })),
    );
    const outcomes = await mapLimited(
      requests,
      UPSTREAM_CONCURRENCY,
      async ({ road, service }) => {
        try {
          const payload = await upstream(autobahnServiceUrl(road, service));
          return normalizeAutobahnServicePayload(road, service, payload);
        } catch {
          return null;
        }
      },
    );
    const failed = [];
    const lists = [];
    outcomes.forEach((rows, index) => {
      const { road, service } = requests[index];
      if (rows === null) failed.push(`${road}/${service}`);
      else lists.push(rows);
    });
    if (lists.length * 2 < requests.length)
      throw new Error('upstream_unavailable');
    return {
      fetchedAt: now(),
      roads: [...roads],
      failed,
      rows: mergeAutobahnRows(lists),
    };
  }

  // Truck parking: one `parking_lorry` request per road; at least half must
  // answer, and the ones that failed are listed.
  async function fetchParking() {
    const outcomes = await mapLimited(
      roads,
      UPSTREAM_CONCURRENCY,
      async (road) => {
        try {
          return normalizeTruckParkingPayload(
            road,
            await upstream(truckParkingUrl(road)),
          );
        } catch {
          return null;
        }
      },
    );
    const failed = roads.filter((_, index) => outcomes[index] === null);
    const lists = outcomes.filter(Boolean);
    if (lists.length * 2 < roads.length)
      throw new Error('upstream_unavailable');
    return {
      fetchedAt: now(),
      roads: [...roads],
      failed,
      rows: mergeTruckParkingRows(lists),
    };
  }

  async function acquire(key, ttl, load) {
    const previous = cache.get(key);
    if (previous && now() - previous.savedAt < ttl)
      return { value: previous.value, stale: false };
    if (!inFlight.has(key) && inFlight.size >= 256)
      throw Object.assign(new Error('busy'), { status: 429 });
    try {
      const { promise } = coalesceProxyRequest(inFlight, key, async () => {
        const value = await load();
        cache.set(key, { value, savedAt: now() });
        return value;
      });
      return { value: await promise, stale: false };
    } catch (error) {
      if (previous && now() - previous.savedAt <= STALE_MAX_MS)
        return { value: previous.value, stale: true };
      throw error;
    }
  }

  async function handler(req, res) {
    const json = (status, value, stale = false) => {
      if (res.destroyed) return;
      res.writeHead(status, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        ...(status === 405 ? { Allow: 'GET' } : {}),
        ...(status === 429 ? { 'Retry-After': '60' } : {}),
        ...(stale ? { 'X-Data-Stale': 'true' } : {}),
      });
      res.end(JSON.stringify(value));
    };
    // Keyless and needed to render the layer: refuse cross-site browsers
    // before they spend a client's quota or start a refresh.
    if (admitSameSiteKeyless(req, res)) return;
    if (req.method !== 'GET') return json(405, { error: 'method_not_allowed' });
    const path = (req.url || '/').split('?')[0];
    const route =
      path === '/events'
        ? ['events', SNAPSHOT_TTL_MS, fetchEvents]
        : path === '/parking'
          ? ['parking', PARKING_TTL_MS, fetchParking]
          : null;
    if (!route) return json(404, { error: 'unknown_route' });
    if (!allow(clientKey(req))) return json(429, { error: 'rate_limited' });
    try {
      const { value, stale } = await acquire(...route);
      json(200, stale ? { ...value, stale: true } : value, stale);
    } catch (error) {
      json(error.status === 429 ? 429 : 502, {
        error: 'autobahn_unavailable',
      });
    }
  }

  return {
    name: 'autobahn',
    configureServer({ middlewares }) {
      middlewares.use('/api/autobahn', handler);
    },
    configurePreviewServer({ middlewares }) {
      middlewares.use('/api/autobahn', handler);
    },
  };
}
