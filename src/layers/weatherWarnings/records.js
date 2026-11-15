import { msg } from '../../i18n/marker.js';

/**
 * DWD weather warnings (Deutscher Wetterdienst, open data, CC BY 4.0) from
 * the GeoServer WFS layer `dwd:Warnungen_Gemeinden_vereinigt`: municipal
 * warning areas merged per warning. Shared by the server proxy and the
 * browser, so it stays portable: no Cesium, DOM, Node or catalogs.
 */
export const DWD_WARNINGS_URL =
  'https://maps.dwd.de/geoserver/dwd/ows?service=WFS&version=2.0.0&request=GetFeature&typeName=dwd:Warnungen_Gemeinden_vereinigt&outputFormat=application/json&srsName=EPSG:4326';

/** DWD's four levels, least to most severe. */
export const WARNING_LEVELS = Object.freeze([
  'minor',
  'moderate',
  'severe',
  'extreme',
]);
const LEVEL_OF_SEVERITY = Object.freeze({
  Minor: 'minor',
  Moderate: 'moderate',
  Severe: 'severe',
  Extreme: 'extreme',
});

/** DWD's own warning colours: yellow, orange, red, dark red. */
export const WARNING_COLORS = Object.freeze({
  minor: '#ffcc00',
  moderate: '#ff9500',
  severe: '#ff3b30',
  extreme: '#a1062e',
});

export const WARNING_LEVEL_LABELS = Object.freeze({
  minor: msg('Weather warning'),
  moderate: msg('Strong weather warning'),
  severe: msg('Severe weather warning'),
  extreme: msg('Extreme weather warning'),
});

/** The W sub-score for each level: the highest level on a corridor counts. */
export const WARNING_POINTS = Object.freeze({
  minor: 25,
  moderate: 50,
  severe: 75,
  extreme: 100,
});

/** DWD's event groups in plain words, with what they mean for trucks. */
export const WARNING_GROUPS = Object.freeze({
  THUNDERSTORM: {
    label: msg('Thunderstorms'),
    hint: msg('Gusts, hail and heavy rain can stop traffic briefly.'),
  },
  WIND: {
    label: msg('Wind'),
    hint: msg('Gusts can push empty and high-sided trucks; bridges may close.'),
  },
  TORNADO: {
    label: msg('Tornado'),
    hint: msg('Stop in a safe place until it has passed.'),
  },
  RAIN: {
    label: msg('Heavy rain'),
    hint: msg('Spray and aquaplaning; expect slower traffic.'),
  },
  HAIL: {
    label: msg('Hail'),
    hint: msg('Slippery roads and damage to vehicles and cargo.'),
  },
  SNOWFALL: {
    label: msg('Snow'),
    hint: msg('Slow traffic, chains on hills, trucks may be held back.'),
  },
  SNOWDRIFT: {
    label: msg('Snow drifts'),
    hint: msg('Drifts can block roads in open country.'),
  },
  FOG: {
    label: msg('Fog'),
    hint: msg('Poor visibility; keep a long distance.'),
  },
  FROST: {
    label: msg('Frost and ice'),
    hint: msg('Icy roads and bridges, especially at night.'),
  },
  GLAZE: {
    label: msg('Freezing rain'),
    hint: msg('Black ice: roads can become impassable.'),
  },
  THAW: {
    label: msg('Thaw'),
    hint: msg('Meltwater and flooding near rivers.'),
  },
  POWERLINEVIBRATION: {
    label: msg('Ice on power lines'),
    hint: msg('Mainly a risk off the road.'),
  },
  UV: { label: msg('UV'), hint: msg('No effect on traffic.') },
  HEAT: {
    label: msg('Heat'),
    hint: msg('Rest breaks matter; check refrigerated loads.'),
  },
});
const OTHER_GROUP = Object.freeze({
  label: msg('Weather'),
  hint: msg('Check the official warning.'),
});

/** The plain label and hint for a DWD event group. */
export function warningGroup(group) {
  return WARNING_GROUPS[group] || OTHER_GROUP;
}

const round = (value) => Math.round(value * 1e4) / 1e4;
const text = (value, max) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

/** [[lon, lat], …] rings, coordinates rounded to ~10 m; invalid rings dropped. */
function polygonsOf(geometry) {
  const polygons =
    geometry?.type === 'Polygon'
      ? [geometry.coordinates]
      : geometry?.type === 'MultiPolygon'
        ? geometry.coordinates
        : [];
  const out = [];
  for (const polygon of Array.isArray(polygons) ? polygons : []) {
    const rings = (Array.isArray(polygon) ? polygon : [])
      .map((ring) =>
        (Array.isArray(ring) ? ring : [])
          .filter(
            (point) =>
              Array.isArray(point) &&
              Number.isFinite(point[0]) &&
              Number.isFinite(point[1]),
          )
          .map(([lon, lat]) => [round(lon), round(lat)]),
      )
      .filter((ring) => ring.length >= 4);
    if (rings.length) out.push(rings);
  }
  return out;
}

/**
 * Plain warning rows from the WFS GeoJSON: actual alerts that have not
 * expired at `now`, most severe first.
 */
export function normalizeDwdWarnings(payload, now = Date.now()) {
  if (!Array.isArray(payload?.features))
    throw new Error('Malformed DWD warnings payload');
  const rows = [];
  const seen = new Set();
  for (const feature of payload.features) {
    const p = feature?.properties || {};
    const id = text(p.IDENTIFIER, 200);
    const level = LEVEL_OF_SEVERITY[p.SEVERITY];
    if (!id || seen.has(id) || !level) continue;
    if (p.STATUS && p.STATUS !== 'Actual') continue;
    if (p.MSGTYPE === 'Cancel') continue;
    const expires = Date.parse(p.EXPIRES);
    if (Number.isFinite(expires) && expires <= now) continue;
    const polygons = polygonsOf(feature.geometry);
    if (!polygons.length) continue;
    seen.add(id);
    const onset = Date.parse(p.ONSET || p.EFFECTIVE);
    rows.push({
      stableId: id,
      group: text(p.EC_GROUP, 40).toUpperCase(),
      event: text(p.EVENT, 120),
      level,
      onset: Number.isFinite(onset) ? onset : null,
      expires: Number.isFinite(expires) ? expires : null,
      headline: text(p.HEADLINE, 200),
      description: text(p.DESCRIPTION, 800),
      instruction: text(p.INSTRUCTION, 600),
      polygons,
      bbox: boundsOf(polygons),
    });
  }
  rows.sort(
    (a, b) =>
      WARNING_LEVELS.indexOf(b.level) - WARNING_LEVELS.indexOf(a.level) ||
      (a.onset ?? 0) - (b.onset ?? 0),
  );
  return rows;
}

/** [west, south, east, north] of the outer rings. */
export function boundsOf(polygons) {
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  for (const [outer] of polygons)
    for (const [lon, lat] of outer) {
      w = Math.min(w, lon);
      s = Math.min(s, lat);
      e = Math.max(e, lon);
      n = Math.max(n, lat);
    }
  return [w, s, e, n];
}

/** Ray casting: is [lon, lat] inside one ring? */
function inRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
}

/** Is a point inside a warning's area (outer ring in, holes out)? */
export function warningCovers(row, point) {
  const [w, s, e, n] = row.bbox;
  if (point[0] < w || point[0] > e || point[1] < s || point[1] > n)
    return false;
  return row.polygons.some(
    ([outer, ...holes]) =>
      inRing(point, outer) && !holes.some((hole) => inRing(point, hole)),
  );
}

/** Points every ~`stepKm` along a [lon, lat] path. */
export function samplePath(path, stepKm = 5) {
  const points = [];
  for (let i = 0; i < path.length - 1; i += 1) {
    const [a, b] = [path[i], path[i + 1]];
    const k = Math.cos((((a[1] + b[1]) / 2) * Math.PI) / 180);
    const km = Math.hypot((b[0] - a[0]) * k, b[1] - a[1]) * 111.2;
    const steps = Math.max(1, Math.ceil(km / stepKm));
    for (let s = 0; s < steps; s += 1)
      points.push([
        a[0] + ((b[0] - a[0]) * s) / steps,
        a[1] + ((b[1] - a[1]) * s) / steps,
      ]);
  }
  if (path.length) points.push(path.at(-1));
  return points;
}

/**
 * Warnings in force now or starting within `horizonMs` whose area the path
 * crosses, most severe first.
 */
export function warningsOnPath(
  path,
  rows,
  { now = Date.now(), horizonMs = 12 * 3_600_000 } = {},
) {
  const points = samplePath(path);
  return (Array.isArray(rows) ? rows : []).filter(
    (row) =>
      (row.onset === null || row.onset <= now + horizonMs) &&
      (row.expires === null || row.expires > now) &&
      points.some((point) => warningCovers(row, point)),
  );
}

/** W: the highest level on the path as 0–100 (0 when none). */
export function weatherScore(path, rows, options) {
  const on = warningsOnPath(path, rows, options);
  return {
    value: on.length
      ? Math.max(...on.map((row) => WARNING_POINTS[row.level]))
      : 0,
    warnings: on,
  };
}
