/**
 * Push alerts in the browser: switch them on or off, and keep the server's
 * copy of this reader's pins (and the Kaub opt-in) in step. The checking and
 * sending happen in a scheduled job (scripts/send-alerts.mjs); this side
 * only subscribes. No account: the browser's push subscription is the id.
 */
import { onMounted, shallowRef, watch } from 'vue';
import { getLocale } from '../i18n/index.js';
import { usePins } from './pins.js';

const KEY = 'nadeloehr.alerts.v1';
const SYNC_DELAY_MS = 1500;
/** A browser whose push service never answers must not leave the switch stuck. */
const SUBSCRIBE_TIMEOUT_MS = 20_000;
const withTimeout = (promise, ms) =>
  Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('timed out')), ms),
    ),
  ]);

/**
 * 'checking' | 'unsupported' (no Web Push) | 'needs-install' (iPhone or iPad
 * outside the Home Screen app) | 'unavailable' (server not set up) | 'off' |
 * 'on' | 'blocked' (notifications denied) | 'error'.
 */
const status = shallowRef('checking');
const kaub = shallowRef(false);
const busy = shallowRef(false);
let config = null;

const remembered = () => {
  try {
    return JSON.parse(globalThis.localStorage?.getItem(KEY) || '{}');
  } catch {
    return {};
  }
};
const remember = (value) => {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(value));
  } catch {
    /* Private mode: alerts stay on server-side; the switch may forget. */
  }
};

const nav = () => globalThis.navigator;
function pushSupported() {
  return Boolean(
    nav()?.serviceWorker && globalThis.PushManager && globalThis.Notification,
  );
}
function isAppleMobileBrowser() {
  const agent = nav()?.userAgent || '';
  const apple =
    /iPhone|iPad|iPod/.test(agent) ||
    (/Macintosh/.test(agent) && nav()?.maxTouchPoints > 1);
  const standalone =
    globalThis.matchMedia?.('(display-mode: standalone)').matches ||
    nav()?.standalone === true;
  return apple && !standalone;
}

/** "BASE64URL" → Uint8Array, for applicationServerKey. */
export function base64UrlToBytes(value) {
  const padded = `${value}${'='.repeat((4 - (value.length % 4)) % 4)}`
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const raw = globalThis.atob(padded);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

async function post(path, body) {
  const response = await fetch(`/api/alerts/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`alerts ${path} ${response.status}`);
}

async function registration() {
  const existing = await nav().serviceWorker.getRegistration('/');
  return existing || nav().serviceWorker.register('/sw.js', { scope: '/' });
}

function payload(subscription) {
  const { pins } = usePins();
  return {
    subscription: subscription.toJSON(),
    pins: pins.value,
    kaub: kaub.value,
    locale: getLocale(),
  };
}

async function init() {
  if (!pushSupported()) {
    status.value = isAppleMobileBrowser() ? 'needs-install' : 'unsupported';
    return;
  }
  try {
    const response = await fetch('/api/alerts/config');
    config = response.ok ? await response.json() : null;
  } catch {
    config = null;
  }
  if (!config?.enabled || !config.publicKey) {
    status.value = 'unavailable';
    return;
  }
  const saved = remembered();
  kaub.value = saved.kaub === true;
  if (globalThis.Notification.permission === 'denied') {
    status.value = 'blocked';
    return;
  }
  if (!saved.on) {
    status.value = 'off';
    return;
  }
  // Still subscribed in this browser? Then refresh the server's copy.
  try {
    const reg = await nav().serviceWorker.getRegistration('/');
    const subscription = await reg?.pushManager.getSubscription();
    if (subscription && globalThis.Notification.permission === 'granted') {
      status.value = 'on';
      await post('subscribe', payload(subscription));
    } else {
      status.value = 'off';
      remember({ on: false, kaub: kaub.value });
    }
  } catch {
    status.value = 'on';
  }
}

let started = false;
let syncTimer = null;
function start() {
  if (started) return;
  started = true;
  init();
  // Pins or the Kaub choice changed: tell the server (debounced).
  const { pins } = usePins();
  watch(
    [pins, kaub],
    () => {
      if (status.value !== 'on') return;
      clearTimeout(syncTimer);
      syncTimer = setTimeout(async () => {
        try {
          const reg = await nav().serviceWorker.getRegistration('/');
          const subscription = await reg?.pushManager.getSubscription();
          if (subscription) await post('subscribe', payload(subscription));
        } catch {
          /* The next change or visit tries again. */
        }
      }, SYNC_DELAY_MS);
    },
    { deep: true },
  );
}

async function enable() {
  if (busy.value) return;
  busy.value = true;
  try {
    const permission = await globalThis.Notification.requestPermission();
    if (permission !== 'granted') {
      status.value = permission === 'denied' ? 'blocked' : 'off';
      return;
    }
    const reg = await registration();
    await withTimeout(nav().serviceWorker.ready, SUBSCRIBE_TIMEOUT_MS);
    const subscription =
      (await reg.pushManager.getSubscription()) ||
      (await withTimeout(
        reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64UrlToBytes(config.publicKey),
        }),
        SUBSCRIBE_TIMEOUT_MS,
      ));
    await post('subscribe', payload(subscription));
    remember({ on: true, kaub: kaub.value });
    status.value = 'on';
  } catch {
    status.value = 'error';
  } finally {
    busy.value = false;
  }
}

async function disable() {
  if (busy.value) return;
  busy.value = true;
  try {
    const reg = await nav().serviceWorker.getRegistration('/');
    const subscription = await reg?.pushManager.getSubscription();
    if (subscription) {
      await post('unsubscribe', { endpoint: subscription.endpoint }).catch(
        () => {},
      );
      await subscription.unsubscribe();
    }
  } catch {
    /* Turned off locally either way. */
  } finally {
    remember({ on: false, kaub: kaub.value });
    status.value = 'off';
    busy.value = false;
  }
}

function setKaub(on) {
  kaub.value = Boolean(on);
  remember({ on: status.value === 'on', kaub: kaub.value });
}

/**
 * The alert switch's state and verbs. Checking the browser and the server
 * starts when the switch is mounted in a page (never while rendering on a
 * server).
 */
export function useAlerts() {
  onMounted(start);
  return { status, kaub, busy, enable, disable, setKaub };
}
