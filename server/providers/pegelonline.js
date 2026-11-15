import {
  KEY_GAUGES,
  PEGELONLINE_STATIONS_URL,
  levelTrend,
  normalizePegelStations,
  pegelMeasurementsUrl,
} from '../../src/layers/riverLevels/records.js';
import { readResponseJsonCapped, coalesceProxyRequest } from './common/http.js';
import { makeRateLimiter, clientKey } from './common/rate-limit.js';
import { admitSameSiteKeyless } from './common/same-site.js';
import { providerUserAgent } from './common/userAgent.js';

// PEGELONLINE water levels (WSV, open data, keyless:
// https://www.pegelonline.wsv.de/webservice/ueberblick). One bulk request for
// every Rhine and Elbe gauge, plus a 24-hour series for each key gauge so the
// layer can show a trend. All URLs are fixed here.

const MIB = 1024 * 1024;
/** Gauges report every 15 minutes. */
const SNAPSHOT_TTL_MS = 15 * 60 * 1000;
/** Longest a failed refresh keeps serving the last snapshot, marked stale. */
const STALE_MAX_MS = 12 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 20_000;

/** Fixed-origin, bounded PEGELONLINE gauge route for dev and preview. */
export function pegelonlineProxy({
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
        'User-Agent': providerUserAgent('pegelonline'),
      },
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error('upstream_unavailable');
    }
    return readResponseJsonCapped(response, 4 * MIB, signal);
  }

  // The station list is required; a trend that fails is left out.
  async function fetchGauges() {
    const rows = normalizePegelStations(
      await upstream(PEGELONLINE_STATIONS_URL),
    );
    await Promise.all(
      rows
        .filter((row) => KEY_GAUGES.includes(row.shortname))
        .map(async (row) => {
          try {
            row.trendCm = levelTrend(
              await upstream(pegelMeasurementsUrl(row.stableId)),
            );
          } catch {
            row.trendCm = null;
          }
        }),
    );
    return { fetchedAt: now(), rows };
  }

  async function acquire() {
    const previous = cached;
    if (previous && now() - previous.savedAt < SNAPSHOT_TTL_MS)
      return { value: previous.value, stale: false };
    try {
      const { promise } = coalesceProxyRequest(inFlight, 'gauges', async () => {
        const value = await fetchGauges();
        cached = { value, savedAt: now() };
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
    if (admitSameSiteKeyless(req, res)) return;
    if (req.method !== 'GET') return json(405, { error: 'method_not_allowed' });
    const path = (req.url || '/').split('?')[0];
    if (path !== '/gauges') return json(404, { error: 'unknown_route' });
    if (!allow(clientKey(req))) return json(429, { error: 'rate_limited' });
    try {
      const { value, stale } = await acquire();
      json(200, stale ? { ...value, stale: true } : value, stale);
    } catch {
      json(502, { error: 'pegelonline_unavailable' });
    }
  }

  return {
    name: 'pegelonline',
    configureServer({ middlewares }) {
      middlewares.use('/api/pegel', handler);
    },
    configurePreviewServer({ middlewares }) {
      middlewares.use('/api/pegel', handler);
    },
  };
}
