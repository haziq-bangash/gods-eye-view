/**
 * Colour icons for the Nadelöhr shell: one glyph and one Apple system colour
 * per layer, disruption kind and tool, so the same thing always looks the
 * same wherever it appears. Glyphs are Phosphor Icons (MIT), drawn in their
 * filled weight on the glass lenses — the closest open set to SF Symbols'
 * filled variants, which Apple licenses only for apps on its own platforms.
 */
import {
  PhAirplane,
  PhAnchor,
  PhBarricade,
  PhBicycle,
  PhBoat,
  PhBroadcast,
  PhBuildings,
  PhBus,
  PhCar,
  PhCloudRain,
  PhCloudSun,
  PhDrop,
  PhDatabase,
  PhFire,
  PhGhost,
  PhHardDrives,
  PhLeaf,
  PhLightning,
  PhMapPin,
  PhMountains,
  PhNewspaper,
  PhPawPrint,
  PhPersonSimpleWalk,
  PhPlanet,
  PhPlugs,
  PhProhibit,
  PhRadio,
  PhRobot,
  PhRocketLaunch,
  PhScan,
  PhSecurityCamera,
  PhShareNetwork,
  PhShieldCheckered,
  PhSignpost,
  PhStack,
  PhTornado,
  PhTrafficCone,
  PhTrain,
  PhTranslate,
  PhWarning,
  PhWaveform,
  PhWaves,
  PhWind,
} from '@phosphor-icons/vue';

/** Apple's system colours (light appearance values read well in both). */
export const SYSTEM_COLORS = Object.freeze({
  red: '#ff3b30',
  orange: '#ff9500',
  yellow: '#ffcc00',
  green: '#34c759',
  mint: '#00c7be',
  teal: '#30b0c7',
  cyan: '#32ade6',
  blue: '#007aff',
  indigo: '#5856d6',
  purple: '#af52de',
  pink: '#ff2d55',
  brown: '#a2845e',
  gray: '#8e8e93',
  brand: '#ff6037',
});
const C = SYSTEM_COLORS;

/** Disruption kinds: the same colours as their map markers. */
export const KIND_ICONS = Object.freeze({
  closure: { icon: PhProhibit, color: C.red },
  'ramp-closure': { icon: PhSignpost, color: C.pink },
  warning: { icon: PhWarning, color: C.yellow },
  'short-roadworks': { icon: PhBarricade, color: C.orange },
  roadworks: { icon: PhTrafficCone, color: C.cyan },
});

/** Layers by id; anything unlisted falls back to a grey stack glyph. */
const LAYER_ICONS = Object.freeze({
  'autobahn-traffic': { icon: PhBarricade, color: C.brand },
  'river-levels': { icon: PhWaves, color: C.blue },
  'weather-radar': { icon: PhCloudRain, color: C.blue },
  'weather-lightning': { icon: PhLightning, color: C.purple },
  wind: { icon: PhWind, color: C.teal },
  'weather-satellite': { icon: PhCloudSun, color: C.cyan },
  'weather-cyclones': { icon: PhTornado, color: C.indigo },
  'air-quality': { icon: PhLeaf, color: C.green },
  'ais-live-vessels': { icon: PhBoat, color: C.indigo },
  rail: { icon: PhTrain, color: C.green },
  transit: { icon: PhBus, color: C.mint },
  traffic: { icon: PhCar, color: C.orange },
  bikeshare: { icon: PhBicycle, color: C.green },
  flights: { icon: PhAirplane, color: C.cyan },
  military: { icon: PhShieldCheckered, color: C.gray },
  satellites: { icon: PhPlanet, color: C.purple },
  'rocket-launches': { icon: PhRocketLaunch, color: C.pink },
  earthquakes: { icon: PhWaveform, color: C.brown },
  'local-firms': { icon: PhFire, color: C.red },
  'fire-perimeters': { icon: PhFire, color: C.orange },
  'gnss-integrity': { icon: PhBroadcast, color: C.indigo },
  's2-ghostmaps': { icon: PhGhost, color: C.gray },
  shipwrecks: { icon: PhAnchor, color: C.brown },
  news: { icon: PhNewspaper, color: C.red },
  'wildlife-sightings': { icon: PhPawPrint, color: C.green },
  'alpr-cameras': { icon: PhScan, color: C.gray },
  'military-installations': { icon: PhBuildings, color: C.gray },
  'drone-airspace': { icon: PhAirplane, color: C.orange },
  'local-datacenters': { icon: PhHardDrives, color: C.blue },
  'telegeography-submarine-cables': { icon: PhPlugs, color: C.teal },
  'local-dams': { icon: PhDrop, color: C.blue },
  'sea-marks': { icon: PhAnchor, color: C.cyan },
  'ski-pistes': { icon: PhMountains, color: C.cyan },
  radio: { icon: PhRadio, color: C.pink },
  cctv: { icon: PhSecurityCamera, color: C.blue },
});

/** The glyph and colour for a layer id. */
export function layerIcon(id) {
  return LAYER_ICONS[id] || { icon: PhStack, color: C.gray };
}

/** Tools and settings. */
export const TOOL_ICONS = Object.freeze({
  chat: { icon: PhRobot, color: C.purple },
  cameras: { icon: PhSecurityCamera, color: C.blue },
  street: { icon: PhPersonSimpleWalk, color: C.green },
  share: { icon: PhShareNetwork, color: C.cyan },
  language: { icon: PhTranslate, color: C.indigo },
  sources: { icon: PhDatabase, color: C.gray },
  place: { icon: PhMapPin, color: C.red },
  more: { icon: PhStack, color: C.teal },
});
