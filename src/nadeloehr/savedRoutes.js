/**
 * Routes a reader saved to check again with one tap, kept in this browser.
 * Only the two place names are stored; a check routes them afresh.
 */
import { ref, watch } from 'vue';

const KEY = 'nadeloehr.routes.v1';
/** Most saved routes kept; the oldest goes first. */
export const SAVED_ROUTES_MAX = 6;

/** A stable id for a route: its two places, case and spacing folded. */
export function routeId(from, to) {
  const fold = (text) =>
    String(text || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  return `${fold(from)}→${fold(to)}`;
}

/** The stored list, cleaned: [{ id, from, to }], at most SAVED_ROUTES_MAX. */
export function readSavedRoutes(raw) {
  try {
    const value = JSON.parse(raw || '[]');
    if (!Array.isArray(value)) return [];
    const seen = new Set();
    return value
      .filter(
        (item) =>
          item &&
          typeof item.from === 'string' &&
          typeof item.to === 'string' &&
          item.from.trim() &&
          item.to.trim(),
      )
      .map((item) => ({
        id: routeId(item.from, item.to),
        from: item.from.trim().slice(0, 80),
        to: item.to.trim().slice(0, 80),
      }))
      .filter((item) => !seen.has(item.id) && seen.add(item.id))
      .slice(-SAVED_ROUTES_MAX);
  } catch {
    return [];
  }
}

const saved = ref(readSavedRoutes(globalThis.localStorage?.getItem(KEY)));
watch(
  saved,
  (value) => {
    try {
      globalThis.localStorage?.setItem(KEY, JSON.stringify(value));
    } catch {
      /* Private mode or full storage: they last for this visit. */
    }
  },
  { deep: true },
);

/** The saved routes and the verbs that change them. */
export function useSavedRoutes() {
  return {
    saved,
    isSaved: (from, to) =>
      saved.value.some((item) => item.id === routeId(from, to)),
    save(from, to) {
      saved.value = readSavedRoutes(
        JSON.stringify([...saved.value, { from, to }]),
      );
    },
    remove(id) {
      saved.value = saved.value.filter((item) => item.id !== id);
    },
  };
}
