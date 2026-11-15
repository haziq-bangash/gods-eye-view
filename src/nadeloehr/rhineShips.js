/**
 * Ships on the Middle Rhine (Bingen–Koblenz), the stretch the Kaub gauge
 * governs, from the live AIS feed: how many are under way and how many are
 * stopped. Stopped includes ships moored at a quay or anchored for the
 * night, so it is a hint at waiting traffic, not a queue count.
 */

/** [west, south, east, north]: the valley from Bingen to Koblenz, east of the Moselle. */
export const MIDDLE_RHINE_BBOX = Object.freeze([7.59, 49.95, 7.95, 50.37]);
/** Speed over ground (knots) below which a ship counts as stopped. */
export const STOPPED_KNOTS = 0.5;
/** Positions older than this are left out. */
export const FRESH_MS = 30 * 60_000;

/** { total, moving, stopped } from vessel rows, or null without rows. */
export function summarizeShips(rows, now = Date.now()) {
  if (!Array.isArray(rows)) return null;
  let moving = 0;
  let stopped = 0;
  for (const row of rows) {
    const at = Date.parse(row?.last_position_UTC || '');
    if (Number.isFinite(at) && now - at > FRESH_MS) continue;
    // No speed reported: neither moving nor stopped.
    if (row?.speed === null || row?.speed === undefined) continue;
    const speed = Number(row.speed);
    if (!Number.isFinite(speed)) continue;
    if (speed >= STOPPED_KNOTS) moving += 1;
    else stopped += 1;
  }
  return { total: moving + stopped, moving, stopped };
}

/** The feed URL for the Middle Rhine. */
export function middleRhineUrl() {
  return `/api/vessels?bbox=${MIDDLE_RHINE_BBOX.join(',')}&maxRows=500`;
}

/**
 * Fetch and summarise; null when the feed is off (no key) or fails, so the
 * card simply leaves the line out.
 */
export async function fetchMiddleRhineShips({
  fetchImpl = (...args) => globalThis.fetch(...args),
  now = Date.now(),
  signal,
} = {}) {
  try {
    const response = await fetchImpl(middleRhineUrl(), { signal });
    if (!response.ok) return null;
    const data = await response.json();
    if (data?.status && data.status !== 'live') return null;
    return summarizeShips(data?.rows, now);
  } catch {
    return null;
  }
}
