import {
  DWD_WARNINGS_URL,
  normalizeDwdWarnings,
} from '../../src/layers/weatherWarnings/records.js';
import { readResponseJsonCapped, coalesceProxyRequest } from './common/http.js';
import { makeRateLimiter, clientKey } from './common/rate-limit.js';
import { admitSameSiteKeyless } from './common/same-site.js';
import { providerUserAgent } from './common/userAgent.js';

// DWD weather warnings (Deutscher Wetterdienst open data, CC BY 4.0:
// https://www.dwd.de/DE/leistungen/opendata/opendata.html). One fixed WFS
// request for the merged municipal warning areas; rows keep only what the
// layer and the corridor score read, with coordinates rounded to ~10 m.

const MIB = 1024 * 1024;
/** DWD updates warnings within minutes. */
const SNAPSHOT_TTL_MS = 5 * 60 * 1000;
/** Warnings age fast: a failed refresh serves the last snapshot for an hour. */
const STALE_MAX_MS = 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 20_000;

/** Fixed-origin, bounded DWD warnings route for dev and preview. */
export function dwdWarningsProxy({
  fetchImpl = (...args) => globalThis.fetch(...args),
  now = () => Date.now(),
} = {}) {
  let cached = null;
  const inFlight = new Map();
  const allow = makeRateLimiter({ windowMs: 60_000, max: 60, globalMax: 1200 });

  async function upstream(url) {
    const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    const response = await fetchImpl(url, {
      signal,
      redirect: 'error',
      headers: {
        Accept: 'application/json',
        'User-Agent': providerUserAgent('dwd-warnings'),
      },
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error('upstream_unavailable');
    }
    return readResponseJsonCapped(response, 24 * MIB, signal);
  }

  async function fetchWarnings() {
    const at = now();
    return {
      fetchedAt: at,
      rows: normalizeDwdWarnings(await upstream(DWD_WARNINGS_URL), at),
    };
  }

  async function acquire() {
    const previous = cached;
    if (previous && now() - previous.savedAt < SNAPSHOT_TTL_MS)
      return { value: previous.value, stale: false };
    try {
      const { promise } = coalesceProxyRequest(
        inFlight,
        'warnings',
        async () => {
          const value = await fetchWarnings();
          cached = { value, savedAt: now() };
          return value;
        },
      );
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
    if (admitSameSiteKeyless(req, res)) return;
    if (req.method !== 'GET') return json(405, { error: 'method_not_allowed' });
    const path = (req.url || '/').split('?')[0];
    if (path !== '/warnings') return json(404, { error: 'unknown_route' });
    if (!allow(clientKey(req))) return json(429, { error: 'rate_limited' });
    try {
      const { value, stale } = await acquire();
      json(200, stale ? { ...value, stale: true } : value, stale);
    } catch {
      json(502, { error: 'dwd_unavailable' });
    }
  }

  return {
    name: 'dwd-warnings',
    configureServer({ middlewares }) {
      middlewares.use('/api/dwd', handler);
    },
    configurePreviewServer({ middlewares }) {
      middlewares.use('/api/dwd', handler);
    },
  };
}
