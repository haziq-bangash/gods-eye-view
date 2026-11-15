/**
 * Which layers the Nadelöhr sheet offers, in plain words. Portable (no Vue,
 * Cesium or catalogs): labels are `msg` markers translated where shown.
 */
import { msg } from '../i18n/marker.js';

/**
 * "Show on the map": the freight-relevant layers, in the order a driver or
 * dispatcher cares about them. The `minor` group toggles the minor Autobahn
 * events (exit closures and roadworks) on the map instead of a whole layer.
 */
export const MAIN_LAYERS = Object.freeze([
  Object.freeze({
    id: 'autobahn-traffic',
    title: msg('Autobahn disruptions'),
    subtitle: msg('Closures, warnings and short roadworks'),
  }),
  Object.freeze({
    group: 'minor',
    title: msg('Exits and roadworks'),
    subtitle: msg('Routine closures and building sites, off by default'),
  }),
  Object.freeze({
    id: 'river-levels',
    title: msg('River water levels'),
    subtitle: msg('Rhine and Elbe gauges, Kaub highlighted'),
  }),
  Object.freeze({
    id: 'weather-warnings',
    title: msg('Weather warnings'),
    subtitle: msg('Official DWD warnings for storms, ice, snow and fog'),
  }),
  Object.freeze({
    id: 'weather-radar',
    title: msg('Rain radar'),
    subtitle: msg('Where it is raining now'),
  }),
  Object.freeze({
    id: 'weather-lightning',
    title: msg('Lightning'),
    subtitle: msg('Recent lightning strikes'),
  }),
  Object.freeze({
    id: 'wind',
    title: msg('Wind'),
    subtitle: msg('Wind speed and direction'),
  }),
  Object.freeze({
    id: 'ais-live-vessels',
    title: msg('Ships'),
    subtitle: msg('Live ship positions on rivers and seas'),
  }),
  Object.freeze({
    id: 'rail',
    title: msg('Trains'),
    subtitle: msg('Live trains where operators publish them'),
  }),
]);

/**
 * Layers that are tools or need special hardware: reachable from the Tools
 * section (cameras, street view) or not meant for a general audience.
 */
export const HIDDEN_FROM_MORE = Object.freeze(
  new Set([
    'directions',
    'osm-places',
    'local-adsb',
    'radio',
    'cctv',
    'street-level',
    'recent-imagery',
  ]),
);
