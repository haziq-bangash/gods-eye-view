/**
 * "Add to home screen". Chrome and Edge announce that the app can be
 * installed with a `beforeinstallprompt` event, often before the interface
 * has loaded, so it is caught here at start-up and kept for the prompt
 * card. Safari on iPhone has no such event; there the card explains the
 * Share menu instead.
 */
import { shallowRef } from 'vue';

/** The browser's deferred install prompt, once it has offered one. */
export const deferredInstall = shallowRef(null);
/** True once the app was installed during this visit. */
export const installed = shallowRef(false);

globalThis.addEventListener?.('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredInstall.value = event;
});
globalThis.addEventListener?.('appinstalled', () => {
  installed.value = true;
  deferredInstall.value = null;
});

/** Already running as an installed app. */
export function isStandalone() {
  return (
    globalThis.matchMedia?.('(display-mode: standalone)').matches === true ||
    globalThis.navigator?.standalone === true
  );
}

/** Safari on iPhone or iPad, where installing goes through Share. */
export function isIosSafari() {
  const agent = globalThis.navigator?.userAgent || '';
  const ios =
    /iPhone|iPad|iPod/.test(agent) ||
    (/Macintosh/.test(agent) && globalThis.navigator?.maxTouchPoints > 1);
  return ios && /Safari/.test(agent) && !/CriOS|FxiOS|EdgiOS/.test(agent);
}

/** Visits counted per browser; the card waits for a second one. */
const KEY = 'nadeloehr.install.v1';
export function installMemory() {
  try {
    const value = JSON.parse(globalThis.localStorage?.getItem(KEY) || '{}');
    return { visits: Number(value.visits) || 0, dismissed: !!value.dismissed };
  } catch {
    return { visits: 0, dismissed: false };
  }
}
export function rememberInstall(next) {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(next));
  } catch {
    /* Private mode: the card may come back next visit. */
  }
}
