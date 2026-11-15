import {
  MAX_ALERT_PINS,
  normalizeAlertPins,
  normalizePushSubscription,
} from '../../src/freight/alerts.js';
import { readRequestBody } from './common/request.js';
import { clientKey, makeRateLimiter } from './common/rate-limit.js';
import { admitSameSiteKeyless } from './common/same-site.js';
import {
  MAX_SUBSCRIPTIONS,
  alertStoreConfigured,
  createAlertStore,
  subscriptionId,
} from './alerts/store.js';

// Push alerts for pinned roads and places (Nadelöhr). The browser subscribes
// with the Push API and sends its subscription and pins here; they are kept
// in Upstash Redis. A scheduled GitHub Action (scripts/send-alerts.mjs)
// checks them against the Autobahn and Kaub data and sends the
// notifications. This server never sends pushes and holds no private key.
//
//   GET  /api/alerts/config       → { enabled, publicKey }
//   POST /api/alerts/subscribe    { subscription, pins, kaub, locale }
//   POST /api/alerts/unsubscribe  { endpoint }

const MAX_BODY = 8 * 1024;
const CLIENT_IP = /^[0-9a-f:.]{3,45}$/i;
const LOCALE = /^[a-z]{2}(?:-[A-Za-z]{2,4})?$/;

/** Behind Cloudflare every socket peer is the proxy; key visitors by IP. */
function visitorKey(req) {
  const ip = String(req.headers?.['cf-connecting-ip'] || '').trim();
  return CLIENT_IP.test(ip) ? `cf:${ip}` : clientKey(req);
}

export function alertsProxy({
  env = process.env,
  store: injectedStore = null,
  now = () => Date.now(),
} = {}) {
  let store = injectedStore;
  const getStore = () =>
    (store ??= createAlertStore({
      url: env.UPSTASH_REDIS_REST_URL,
      token: env.UPSTASH_REDIS_REST_TOKEN,
    }));
  const enabled = () =>
    Boolean(
      env.VAPID_PUBLIC_KEY && (injectedStore || alertStoreConfigured(env)),
    );
  // Subscribing is rare: 20 changes an hour per visitor is plenty.
  const allow = makeRateLimiter({
    windowMs: 60 * 60_000,
    max: 20,
    globalMax: 2000,
  });

  async function handler(req, res) {
    const json = (status, value) => {
      if (res.destroyed) return;
      res.writeHead(status, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        ...(status === 429 ? { 'Retry-After': '3600' } : {}),
      });
      res.end(JSON.stringify(value));
    };
    if (admitSameSiteKeyless(req, res)) return;
    const path = (req.url || '/').split('?')[0];

    if (path === '/config') {
      if (req.method !== 'GET')
        return json(405, { error: 'method_not_allowed' });
      return json(200, {
        enabled: enabled(),
        publicKey: enabled() ? String(env.VAPID_PUBLIC_KEY) : null,
        maxPins: MAX_ALERT_PINS,
      });
    }
    if (path !== '/subscribe' && path !== '/unsubscribe')
      return json(404, { error: 'unknown_route' });
    if (req.method !== 'POST')
      return json(405, { error: 'method_not_allowed' });
    // A browser's own fetch: it always sends Origin on a POST.
    if (!req.headers?.origin) return json(403, { error: 'origin_required' });
    if (
      !/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')
    )
      return json(415, { error: 'json_required' });
    if (!enabled()) return json(503, { error: 'alerts_unavailable' });
    if (!allow(visitorKey(req))) return json(429, { error: 'rate_limited' });

    let input;
    try {
      input = JSON.parse(await readRequestBody(req, MAX_BODY));
    } catch {
      return json(400, { error: 'bad_request' });
    }
    try {
      if (path === '/unsubscribe') {
        const endpoint = String(input?.endpoint || '');
        if (!endpoint) return json(400, { error: 'bad_request' });
        await getStore().remove(subscriptionId(endpoint));
        return json(200, { ok: true });
      }
      const subscription = normalizePushSubscription(input?.subscription);
      if (!subscription) return json(400, { error: 'bad_subscription' });
      const id = subscriptionId(subscription.endpoint);
      const existing = await getStore().get(id);
      if (!existing && (await getStore().count()) >= MAX_SUBSCRIPTIONS)
        return json(503, { error: 'alerts_full' });
      const at = new Date(now()).toISOString();
      const locale = String(input?.locale || 'en');
      await getStore().save({
        id,
        subscription,
        pins: normalizeAlertPins(input?.pins),
        kaub: input?.kaub === true,
        locale: LOCALE.test(locale) ? locale : 'en',
        created: existing?.created || at,
        updated: at,
        // Keep what was already told; a new subscriber starts quiet.
        seen: existing?.seen ?? null,
      });
      return json(200, { ok: true });
    } catch {
      return json(502, { error: 'store_unavailable' });
    }
  }

  return {
    name: 'nadeloehr-alerts',
    configureServer({ middlewares }) {
      middlewares.use('/api/alerts', handler);
    },
    configurePreviewServer({ middlewares }) {
      middlewares.use('/api/alerts', handler);
    },
  };
}
