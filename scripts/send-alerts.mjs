#!/usr/bin/env node
/**
 * Nadelöhr push alerts: check every subscriber's pinned roads and places
 * (and Kaub, if they opted in) against the live Autobahn closures and the
 * Kaub gauge, and send a Web Push notification for anything new.
 *
 * Run every 15 minutes by .github/workflows/alerts.yml. Needs:
 *   UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN  the subscriptions
 *   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY              push signing keys
 *   WEB_PUSH_MODULE (optional)                       path to the web-push package
 *
 * Exits quietly when nobody is subscribed. Subscriptions the push service
 * reports as gone (404/410) are deleted.
 */
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import {
  AUTOBAHN_ROADS,
  mergeAutobahnRows,
  normalizeAutobahnServicePayload,
} from '../src/layers/autobahn/records.js';
import {
  PEGELONLINE_STATIONS_URL,
  kaubRow,
  normalizePegelStations,
} from '../src/layers/riverLevels/records.js';
import { alertItems, nextAlerts } from '../src/freight/alerts.js';
import { createAlertStore } from '../server/providers/alerts/store.js';

const SUBJECT = 'https://nadeloehr.dropboard.de';
const HEADERS = {
  Accept: 'application/json',
  'User-Agent':
    'nadeloehr-alerts/1.0 (+https://github.com/haziq-bangash/gods-eye-view)',
};

async function getJson(url) {
  const response = await fetch(url, {
    headers: HEADERS,
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.json();
}

/** Run tasks a few at a time; a failed one yields null. */
async function pool(items, size, task) {
  const out = new Array(items.length).fill(null);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      try {
        out[index] = await task(items[index]);
      } catch (error) {
        console.warn(`skipped: ${error.message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: size }, worker));
  return out;
}

/** Full closures on every Autobahn (the only kind that alerts). */
export async function loadClosures() {
  const lists = await pool(AUTOBAHN_ROADS, 4, async (road) =>
    normalizeAutobahnServicePayload(
      road,
      'closure',
      await getJson(
        `https://verkehr.autobahn.de/o/autobahn/${road}/services/closure`,
      ),
    ),
  );
  const answered = lists.filter(Boolean);
  // A mostly failing feed would look like "every closure ended", then like
  // "every closure is new" on the next run: better to skip this run.
  if (answered.length * 2 < AUTOBAHN_ROADS.length)
    throw new Error('Autobahn feed mostly unavailable; no alerts this run');
  return mergeAutobahnRows(answered);
}

async function loadKaub() {
  try {
    return (
      kaubRow(normalizePegelStations(await getJson(PEGELONLINE_STATIONS_URL)))
        ?.levelCm ?? null
    );
  } catch (error) {
    console.warn(`PEGELONLINE unavailable: ${error.message}`);
    return null;
  }
}

async function loadWebPush() {
  const target = process.env.WEB_PUSH_MODULE || 'web-push';
  const spec =
    target.startsWith('.') || path.isAbsolute(target)
      ? pathToFileURL(path.resolve(target)).href
      : target;
  const module = await import(spec);
  return module.default || module;
}

/**
 * One check. `send(subscription, payload)` resolves, or rejects with an
 * error carrying statusCode (404/410 = gone). Returns counts for the log.
 */
export async function checkOnce({ store, send, events, kaubLevelCm }) {
  const subs = await store.all();
  let sent = 0;
  let removed = 0;
  for (const sub of subs) {
    const { send: due, seen } = nextAlerts(
      sub,
      alertItems(sub, { events, kaubLevelCm }),
    );
    let gone = false;
    for (const item of due) {
      try {
        await send(
          sub.subscription,
          JSON.stringify({
            title: item.title,
            body: item.body,
            url: item.url,
            tag: item.key,
          }),
        );
        sent += 1;
      } catch (error) {
        if (error?.statusCode === 404 || error?.statusCode === 410) {
          gone = true;
          break;
        }
        console.warn(`push failed (${error?.statusCode || error?.message})`);
      }
    }
    if (gone) {
      await store.remove(sub.id);
      removed += 1;
      continue;
    }
    const unchanged =
      Array.isArray(sub.seen) &&
      sub.seen.length === seen.length &&
      sub.seen.every((key, index) => key === seen[index]);
    if (!unchanged) await store.save({ ...sub, seen });
  }
  return { subscribers: subs.length, sent, removed };
}

async function main() {
  for (const name of [
    'UPSTASH_REDIS_REST_URL',
    'UPSTASH_REDIS_REST_TOKEN',
    'VAPID_PUBLIC_KEY',
    'VAPID_PRIVATE_KEY',
  ])
    if (!process.env[name]) throw new Error(`${name} is not set`);
  const store = createAlertStore();
  if ((await store.count()) === 0) {
    console.log('no subscribers');
    return;
  }
  const webPush = await loadWebPush();
  webPush.setVapidDetails(
    SUBJECT,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );
  const subs = await store.all();
  const events = await loadClosures();
  const kaubLevelCm = subs.some((sub) => sub.kaub) ? await loadKaub() : null;
  const result = await checkOnce({
    store,
    events,
    kaubLevelCm,
    send: (subscription, payload) =>
      webPush.sendNotification(subscription, payload, {
        TTL: 3600,
        urgency: 'normal',
      }),
  });
  console.log(
    `checked ${result.subscribers} subscribers: ${result.sent} sent, ${result.removed} removed`,
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]).endsWith('send-alerts.mjs')
)
  await main();
