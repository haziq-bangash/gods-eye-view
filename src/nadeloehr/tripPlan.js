/**
 * A checked route driven by a truck: how long it takes at truck speed, where
 * the breaks the EU driving-time rules ask for fall (a rest area on your
 * side of the road, with truck spaces), when you arrive, and when you reach
 * each closure on the way. Pure: no Vue, no Cesium.
 *
 * Regulation (EC) 561/2006: a 45-minute break after at most 4.5 hours of
 * driving; at most 9 hours of driving a day (10 hours twice a week). A
 * planning aid, not a tachograph.
 */
import { parseSchedule } from './schedule.js';

/** Average truck speed over a motorway trip, including slower stretches. */
export const TRUCK_KMH = 75;
/** Most driving before a break. */
export const DRIVE_BEFORE_BREAK_S = 4.5 * 3600;
export const BREAK_S = 45 * 60;
/** A break is looked for in the last stretch before it is due. */
export const BREAK_WINDOW_S = 60 * 60;
/** Daily driving limit, and the longer day allowed twice a week. */
export const DAILY_DRIVING_S = 9 * 3600;
export const LONG_DAY_DRIVING_S = 10 * 3600;
/** Rest areas this close to the route are on it. */
export const REST_AREA_KM = 1;
/** Fewer truck spaces than this and a rest area is a last resort. */
export const FEW_SPACES = 10;

function distanceKm([lon1, lat1], [lon2, lat2]) {
  const k = Math.PI / 180;
  const x = (lon2 - lon1) * k * Math.cos(((lat1 + lat2) / 2) * k);
  return Math.hypot(x, (lat2 - lat1) * k) * 6371;
}

/** Kilometres along the path at each of its points. */
export function cumulativeKm(path) {
  const out = [0];
  for (let i = 1; i < path.length; i += 1)
    out.push(out[i - 1] + distanceKm(path[i - 1], path[i]));
  return out;
}

/**
 * Where a point meets the path: { km along it, offsetKm from it, side }.
 * `side` is 'right' or 'left' of the direction of travel. Germany drives
 * on the right, so a rest area on the right serves your carriageway.
 */
export function placeOnPath(
  path,
  along,
  point,
  [start, end] = [0, path.length - 1],
) {
  let best = null;
  for (let i = Math.max(0, start); i < Math.min(end, path.length - 1); i += 1) {
    const [a, b] = [path[i], path[i + 1]];
    const k = Math.cos((((a[1] + b[1]) / 2) * Math.PI) / 180);
    const dx = (b[0] - a[0]) * k;
    const dy = b[1] - a[1];
    const px = (point[0] - a[0]) * k;
    const py = point[1] - a[1];
    const t =
      dx || dy
        ? Math.max(0, Math.min(1, (px * dx + py * dy) / (dx * dx + dy * dy)))
        : 0;
    const offsetKm = Math.hypot(px - dx * t, py - dy * t) * 111.2;
    if (!best || offsetKm < best.offsetKm)
      best = {
        km: along[i] + (along[i + 1] - along[i]) * t,
        offsetKm,
        side: dx * py - dy * px < 0 ? 'right' : 'left',
      };
  }
  return best;
}

/**
 * placeOnPath for many points on a long route: each first finds the nearest
 * of a coarse set of route points (about every 500 m), then is placed
 * exactly on the stretch around it. Null for points far from the route.
 */
function pathLocator(path, along) {
  const coarse = [];
  for (let i = 0; i < path.length; i += 1)
    if (
      !coarse.length ||
      along[i] - along[coarse.at(-1)] >= 0.5 ||
      i === path.length - 1
    )
      coarse.push(i);
  return (point, withinKm) => {
    let nearest = 0;
    let best = Infinity;
    coarse.forEach((index, c) => {
      const d = distanceKm(point, path[index]);
      if (d < best) {
        best = d;
        nearest = c;
      }
    });
    if (best > withinKm + 1) return null;
    return placeOnPath(path, along, point, [
      coarse[Math.max(0, nearest - 2)],
      coarse[Math.min(coarse.length - 1, nearest + 2)],
    ]);
  };
}

/** How a closure stands when you get there. */
function closureAt(windows, at) {
  if (!windows.length) return { state: 'unknown', from: null, to: null };
  const during = windows.find(([from, to]) => from <= at && at < to);
  if (during) return { state: 'during', from: during[0], to: during[1] };
  const next = windows.find(([from]) => from > at);
  if (next) return { state: 'before', from: next[0], to: next[1] };
  const last = windows.at(-1);
  return { state: 'after', from: last[0], to: last[1] };
}

/**
 * @param {object} input
 * @param {number[][]} input.path - The route, [lon, lat], in driving order.
 * @param {number} input.distanceM
 * @param {number} input.durationS - The router's car time.
 * @param {number} input.depart - Departure, epoch ms.
 * @param {?object[]} input.restAreas - Truck parking rows; null when unknown.
 * @param {Set<string>} [input.unusable] - Rest areas blocked or by a closure.
 * @param {object[]} [input.closures] - Closure rows on the route.
 * @returns {{drivingS: number, arrive: number, breaks: object[],
 *   overDay: ?string, closures: object[], parkingKnown: boolean}}
 */
export function planTrip({
  path,
  distanceM,
  durationS,
  depart,
  restAreas = null,
  unusable = new Set(),
  closures = [],
}) {
  const along = cumulativeKm(path);
  const pathKm = along.at(-1) || 1;
  const totalKm = distanceM / 1000 || pathKm;
  // A truck is never faster than the router's car, and averages TRUCK_KMH.
  const drivingS = Math.max(durationS || 0, (totalKm / TRUCK_KMH) * 3600);
  const locate = pathLocator(path, along);
  // Seconds of driving to reach a point `km` along the path.
  const driveTo = (km) => (km / pathKm) * drivingS;

  // Rest areas on your side, with truck spaces, in driving order.
  const stops = (Array.isArray(restAreas) ? restAreas : [])
    .filter(
      (row) =>
        row.lorrySpaces > 0 &&
        !row.blocked &&
        !unusable.has(row.stableId) &&
        Number.isFinite(row.lat) &&
        Number.isFinite(row.lon),
    )
    .map((row) => ({ row, at: locate([row.lon, row.lat], REST_AREA_KM) }))
    .filter(
      ({ at }) => at && at.offsetKm <= REST_AREA_KM && at.side === 'right',
    )
    .map(({ row, at }) => ({ row, km: at.km, driveS: driveTo(at.km) }))
    .sort((a, b) => a.driveS - b.driveS);

  const breaks = [];
  let since = 0; // Driving seconds at the last break (or the start).
  while (drivingS - since > DRIVE_BEFORE_BREAK_S && breaks.length < 3) {
    const due = since + DRIVE_BEFORE_BREAK_S;
    const inWindow = stops.filter(
      (stop) => stop.driveS > due - BREAK_WINDOW_S && stop.driveS <= due,
    );
    // The latest with room, else the latest at all, else an earlier one.
    const roomy = inWindow.filter((stop) => stop.row.lorrySpaces >= FEW_SPACES);
    const earlier = stops.filter(
      (stop) => stop.driveS > since + 1800 && stop.driveS <= due,
    );
    const pick = roomy.at(-1) || inWindow.at(-1) || earlier.at(-1) || null;
    const driveS = pick ? pick.driveS : due;
    breaks.push({
      driveS,
      at: depart + (driveS + breaks.length * BREAK_S) * 1000,
      row: pick?.row || null,
      // Due by then; without a rest area the driver has to leave the motorway.
      due: depart + (due + breaks.length * BREAK_S) * 1000,
    });
    since = driveS;
  }
  const clockAt = (driveS) =>
    depart +
    (driveS + breaks.filter((b) => b.driveS < driveS).length * BREAK_S) * 1000;

  return {
    drivingS,
    arrive: clockAt(drivingS),
    breaks,
    overDay:
      drivingS > LONG_DAY_DRIVING_S
        ? 'rest'
        : drivingS > DAILY_DRIVING_S
          ? 'long-day'
          : null,
    parkingKnown: Array.isArray(restAreas),
    closures: closures
      .filter((row) => Number.isFinite(row.lat) && Number.isFinite(row.lon))
      .map((row) => {
        const on = locate([row.lon, row.lat], 5);
        if (!on) return null;
        const at = clockAt(driveTo(on.km));
        return {
          row,
          at,
          ...closureAt(parseSchedule(row.details).windows, at),
        };
      })
      .filter(Boolean),
  };
}
