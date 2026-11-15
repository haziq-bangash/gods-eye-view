/**
 * Nadelöhr product profile: what this fork shows first. Upstream God's
 * Eye View modules stay intact; the app reads its start view, first-visit
 * layers and panel layout from here, so the fork's choices live in one place.
 *
 * Portable: no Cesium, DOM or catalogs (labels are `msg` markers).
 */
import { msg } from './i18n/marker.js';

export const FREIGHT_PRODUCT_NAME = 'Nadelöhr';

/**
 * The camera on a first open without a share link: Germany from above, then
 * a short descent to a slightly tilted country view.
 */
export const FREIGHT_START_VIEW = Object.freeze({
  lon: 10.45,
  lat: 51.1,
  overviewAltitudeM: 3_200_000,
  altitudeM: 1_300_000,
  headingDeg: 0,
  // Straight down, like Apple Maps' flat map; the 3D button tilts it.
  pitchDeg: -90,
});

/**
 * First-load visual settings layered over upstream's GLOBAL_POST_DEFAULTS:
 * no surveillance HUD and no scope vignette. DISPLAY still turns both on.
 */
export const FREIGHT_VISUAL_DEFAULTS = Object.freeze({
  hudVisible: false,
  scopeMask: false,
});

/** Upstream's first-run mission launcher (contacts, space, fires). */
export const FREIGHT_UPSTREAM_WELCOME = false;

/** The line under the wordmark. */
export const FREIGHT_TAGLINE = msg('Freight bottlenecks across Germany');

/** Layers enabled on a first visit (no share link and no saved layer state). */
export const FREIGHT_FIRST_VISIT_LAYER_IDS = Object.freeze([
  'autobahn-traffic',
  'river-levels',
]);

/**
 * The Data Layers panel's freight sections, shown first and always open. Every
 * other registered layer stays available under "More layers", in upstream
 * order.
 */
export const FREIGHT_PANEL_SECTIONS = Object.freeze([
  Object.freeze({
    label: msg('Freight'),
    ids: Object.freeze(['autobahn-traffic', 'river-levels']),
  }),
  Object.freeze({
    label: msg('Weather'),
    ids: Object.freeze([
      'weather-radar',
      'weather-lightning',
      'wind',
      'weather-satellite',
    ]),
  }),
  Object.freeze({
    label: msg('Transport'),
    ids: Object.freeze(['ais-live-vessels', 'rail', 'traffic']),
  }),
]);
