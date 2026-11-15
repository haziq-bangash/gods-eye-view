/**
 * Everything the Nadelöhr shell asks of the running application, in plain
 * verbs. It drives upstream through the services the tools phase publishes
 * (src/app/tools.js) and upstream's own stores, so the hidden upstream
 * panels and the shell always agree.
 */
import { computed, onBeforeUnmount, shallowRef, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { getLocale, t } from '../i18n/index.js';
import { LOCALES, LOCALE_NAMES } from '../i18n/locale.js';
import { useGlobeActionsStore } from '../ui/stores/globeActions.js';
import { useLocaleStore } from '../ui/stores/locale.js';
import { useVoiceStore } from '../ui/stores/voice.js';
import { useNadeloehrStore } from './store.js';
import { CORRIDORS, scoreCorridors } from '../freight/corridors.js';
import { kaubRow } from '../layers/riverLevels/records.js';
import { localResults, searchPlacesDE } from './search.js';
import { todayHeadline, todayKpis } from './today.js';

const MINOR_KINDS = Object.freeze([
  'ramp-closure',
  'short-roadworks',
  'roadworks',
]);

const AUTOBAHN = 'autobahn-traffic';
const RIVERS = 'river-levels';
const WEATHER = 'weather-warnings';

export function useApp() {
  const store = useNadeloehrStore();
  const globe = useGlobeActionsStore();
  const {
    services,
    ready,
    disruptions,
    selected,
    gauges,
    selectedGauge,
    warnings,
    selectedWarning,
    layerRevision,
  } = storeToRefs(store);
  const camera = computed(() => globe.camera);

  // Layer state, refreshed whenever the manager reports a change.
  let unsubscribe = null;
  watch(
    services,
    (next) => {
      unsubscribe?.();
      unsubscribe = null;
      const manager = next?.dataManager;
      if (manager?.subscribe)
        unsubscribe = manager.subscribe(() => store.touchLayers());
      store.touchLayers();
    },
    { immediate: true },
  );
  onBeforeUnmount(() => unsubscribe?.());

  const layers = computed(() => {
    void layerRevision.value;
    const manager = services.value?.dataManager;
    return manager?.getAll ? manager.getAll() : [];
  });
  const layerById = (id) => layers.value.find((layer) => layer.id === id);
  const layerModule = (id) =>
    services.value?.dataManager?.layers?.get?.(id)?.module || null;
  const autobahnModule = () => layerModule(AUTOBAHN);
  const riverModule = () => layerModule(RIVERS);
  const weatherModule = () => layerModule(WEATHER);

  async function run(name, args = {}) {
    const runner = services.value?.run;
    if (!runner) return { ok: false, error: 'not-ready' };
    try {
      return await runner(name, args);
    } catch (error) {
      console.warn(`[Nadelöhr] ${name} failed:`, error);
      return { ok: false, error: error?.message || String(error) };
    }
  }

  async function setLayer(id, enabled) {
    const manager = services.value?.dataManager;
    if (!manager?.setEnabled) return false;
    try {
      await manager.setEnabled(id, Boolean(enabled), { origin: 'user' });
      return true;
    } catch (error) {
      console.warn(`[Nadelöhr] ${id} toggle failed:`, error);
      return false;
    } finally {
      store.touchLayers();
    }
  }

  // Map styles the user can pick, in Apple Maps' words, when available.
  const mapStyle = shallowRef('streets');
  const onStackChanged = (event) => {
    const id = event?.detail?.activeId ?? event?.detail?.active;
    if (typeof id === 'string') mapStyle.value = id;
    else syncMapStyle();
  };
  function syncMapStyle() {
    const id = services.value?.mapStackController?.getActiveId?.();
    if (id) mapStyle.value = id;
  }
  watch(services, syncMapStyle, { immediate: true });
  globalThis.addEventListener?.('gev:map-stack-changed', onStackChanged);
  onBeforeUnmount(() =>
    globalThis.removeEventListener?.('gev:map-stack-changed', onStackChanged),
  );
  const stackAvailable = (id) =>
    services.value?.mapStackController?.isStackAvailable?.(id) !== false;
  /** Switch the base map through the shell's own facade (keeps share state). */
  async function setMapStyle(id) {
    const shell = services.value?.styleManager;
    try {
      const result = await (shell?.setMapStack
        ? shell.setMapStack(id)
        : services.value?.mapStackController?.setStack(id));
      return result;
    } catch (error) {
      console.warn('[Nadelöhr] map style failed:', error);
      return { ok: false };
    } finally {
      syncMapStyle();
    }
  }

  // One card at a time: picking an event or a gauge clears the other.
  function select(row) {
    if (row) {
      riverModule()?.select?.(null);
      weatherModule()?.select?.(null);
    }
    autobahnModule()?.select?.(row ? row.stableId : null);
  }
  function selectWarning(row) {
    if (row) {
      autobahnModule()?.select?.(null);
      riverModule()?.select?.(null);
    }
    if (!weatherModule()?.select?.(row ? row.stableId : null))
      store.publishSelectedWarning(row || null);
  }
  function showWarningOnMap(row) {
    if (!row) return;
    selectWarning(row);
    const [w, s, e, n] = row.bbox || [];
    if ([w, s, e, n].every(Number.isFinite))
      services.value?.flyToPoints?.([
        [w, s],
        [e, n],
      ]);
  }
  function selectGauge(row) {
    if (row) {
      autobahnModule()?.select?.(null);
      weatherModule()?.select?.(null);
    }
    const module = riverModule();
    if (!module?.select?.(row ? row.stableId : null))
      store.publishSelectedGauge(row || null);
  }
  /** Fly straight down onto a point, north up, like Apple Maps does. */
  function flyFlat(lat, lon, altitudeM) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    services.value?.flyFlat?.(lat, lon, altitudeM);
  }

  function showOnMap(row, { close = false } = {}) {
    if (!row) return;
    select(row);
    flyFlat(row.lat, row.lon, close ? 4_000 : 30_000);
  }
  function showGaugeOnMap(row, { close = false } = {}) {
    if (!row) return;
    selectGauge(row);
    flyFlat(row.lat, row.lon, close ? 15_000 : 40_000);
  }
  const kindVisible = (kind) => {
    void layerRevision.value;
    void disruptions.value;
    return autobahnModule()?.isKindVisible?.(kind) !== false;
  };
  function setKindVisible(kind, visible) {
    autobahnModule()?.setKindVisible?.(kind, visible);
    store.touchLayers();
  }

  // ── Today: corridors, filters and the map overlay ──────────────
  // Off means "no weather data", not "no warnings".
  const weatherOn = computed(() => layerById(WEATHER)?.enabled === true);
  const corridors = computed(() =>
    scoreCorridors({
      events: disruptions.value,
      kaubLevelCm: kaubRow(gauges.value)?.levelCm ?? null,
      warnings: weatherOn.value ? warnings.value : null,
    }),
  );
  const kpis = computed(() =>
    todayKpis(disruptions.value, gauges.value, {
      warnings: weatherOn.value ? warnings.value : null,
    }),
  );
  const headline = computed(() =>
    todayHeadline(gauges.value, corridors.value, {
      warnings: weatherOn.value ? warnings.value : [],
    }),
  );
  const selectedCorridorId = shallowRef(null);
  const selectedCorridor = computed(
    () =>
      corridors.value.find(
        (entry) => entry.corridor.id === selectedCorridorId.value,
      ) || null,
  );
  watch(
    [corridors, selectedCorridorId, services],
    ([scored, id, next]) => next?.corridorOverlay?.update(scored, id),
    { immediate: true },
  );
  function selectCorridor(id) {
    selectedCorridorId.value = id || null;
    if (!id) return;
    select(null);
    selectGauge(null);
    selectWarning(null);
    const corridor = CORRIDORS.find((entry) => entry.id === id);
    if (corridor) services.value?.flyToPoints?.(corridor.path);
  }

  /** Which severity the list (and, for minor, the map) is narrowed to. */
  const severity = shallowRef(null);
  /** An Autobahn the list is narrowed to ("A7"), from search. */
  const roadFilter = shallowRef(null);
  const minorOnMap = computed(() => {
    void layerRevision.value;
    void disruptions.value;
    return MINOR_KINDS.some((kind) => autobahnModule()?.isKindVisible?.(kind));
  });
  function setMinorOnMap(on) {
    for (const kind of MINOR_KINDS)
      autobahnModule()?.setKindVisible?.(kind, on);
    store.touchLayers();
  }
  let minorShownBySeverity = false;
  function setSeverity(next) {
    const value = severity.value === next ? null : next;
    severity.value = value;
    // Picking "minor" shows those markers; leaving it hides them again
    // unless the switch had them on already.
    if (value === 'minor' && !minorOnMap.value) {
      setMinorOnMap(true);
      minorShownBySeverity = true;
    } else if (value !== 'minor' && minorShownBySeverity) {
      setMinorOnMap(false);
      minorShownBySeverity = false;
    }
  }
  function showRoad(road) {
    roadFilter.value = road || null;
    if (!road) return;
    selectCorridor(null);
    const points = disruptions.value
      .filter((row) => row.road === road)
      .map((row) => [row.lon, row.lat]);
    if (points.length) services.value?.flyToPoints?.(points);
  }

  /** Search: roads, gauges and corridors first, then places in Germany. */
  async function search(text, { signal } = {}) {
    const local = localResults(text, {
      events: disruptions.value,
      gauges: gauges.value,
    });
    let places = [];
    try {
      places = await searchPlacesDE(text, { locale: getLocale(), signal });
    } catch (error) {
      if (error?.name !== 'AbortError')
        console.warn('[Nadelöhr] place search failed:', error);
    }
    return [...local, ...places];
  }
  function pickResult(result) {
    if (!result) return;
    if (result.type === 'road') return showRoad(result.road);
    if (result.type === 'gauge') return showGaugeOnMap(result.gauge);
    if (result.type === 'warning') return showWarningOnMap(result.warning);
    if (result.type === 'corridor') return selectCorridor(result.corridor.id);
    if (result.type === 'place') return flyToPlace(result.place);
    return flyToPlace(result);
  }

  function locate() {
    return new Promise((resolve) => {
      if (!globalThis.navigator?.geolocation) return resolve(false);
      globalThis.navigator.geolocation.getCurrentPosition(
        ({ coords }) => {
          flyFlat(coords.latitude, coords.longitude, 6_000);
          resolve(true);
        },
        () => resolve(false),
        { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
      );
    });
  }

  async function searchPlaces(query, { signal } = {}) {
    const search = services.value?.placeSearch;
    const text = String(query || '').trim();
    if (!search || text.length < 2) return [];
    const center = viewCenter();
    try {
      if (typeof search.textSearch === 'function') {
        const results = await search.textSearch(
          text,
          center ? { latitude: center.lat, longitude: center.lon } : {},
          { signal },
        );
        if (Array.isArray(results) && results.length)
          return results.slice(0, 6);
      }
      const answer = await search.geocode?.(text, { signal });
      return answer?.place ? [answer.place] : [];
    } catch (error) {
      if (error?.name !== 'AbortError')
        console.warn('[Nadelöhr] place search failed:', error);
      return [];
    }
  }

  function flyToPlace(place) {
    const lat = Number(place?.lat ?? place?.latitude);
    const lon = Number(place?.lng ?? place?.lon ?? place?.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lon))
      return flyFlat(lat, lon, 20_000);
    return run('fly_to_location', { query: String(place?.label || place) });
  }

  /** The point under the middle of the screen, if the map is ready. */
  const viewCenter = () => services.value?.viewCenter?.() ?? null;

  const zoom = (direction) =>
    run('adjust_camera_zoom', { direction, amount: 'medium' });
  const northUp = () => globe.act('northUp');
  const toggleTilt = () => globe.act('tilt');
  const share = () => globe.act('share');

  // The assistant, cameras and street view open upstream's own panels, which
  // the shell shows on demand (see the nd-show-* classes in nadeloehr.css).
  const voice = useVoiceStore();
  const chatOpen = computed(() => Boolean(voice.view?.chat?.open));
  function openChat() {
    voice.controls?.emit?.('chat-restore');
  }
  function closeChat() {
    if (chatOpen.value) voice.controls?.emit?.('chat-button');
  }
  // A short message for a tool that could not do what was asked.
  const notice = shallowRef('');
  let noticeTimer = null;
  function tell(message) {
    clearTimeout(noticeTimer);
    notice.value = message;
    noticeTimer = setTimeout(() => (notice.value = ''), 5000);
  }
  onBeforeUnmount(() => clearTimeout(noticeTimer));

  /** Show road cameras and open the one nearest the middle of the map. */
  async function openCameras() {
    await run('control_cctv', { action: 'enable' });
    const result = await run('control_cctv', { action: 'nearest' });
    if (!result?.ok)
      tell(t('No traffic cameras nearby. Zoom to a city and try again.'));
    return result;
  }
  async function openStreetView() {
    const center = viewCenter();
    const result = await run(
      'show_street_level',
      center ? { latitude: center.lat, longitude: center.lon } : {},
    );
    if (!result?.ok)
      tell(
        t(
          'No street pictures at the middle of the map. Move it onto a road and try again.',
        ),
      );
    return result;
  }
  const openSettings = () =>
    run('set_panel_open', { panelId: 'provider-settings', open: true });

  const localeStore = useLocaleStore();
  const locales = LOCALES.map((id) => ({ id, name: LOCALE_NAMES[id] || id }));
  const locale = computed(() => localeStore.picker?.current || getLocale());
  const setLocale = (id) => localeStore.picker?.onSelect?.(id);

  return {
    ready,
    services,
    layers,
    layerById,
    setLayer,
    disruptions,
    selected,
    select,
    showOnMap,
    gauges,
    selectedGauge,
    selectGauge,
    showGaugeOnMap,
    warnings,
    selectedWarning,
    selectWarning,
    showWarningOnMap,
    weatherOn,
    corridors,
    kpis,
    headline,
    selectedCorridorId,
    selectedCorridor,
    selectCorridor,
    severity,
    setSeverity,
    roadFilter,
    showRoad,
    minorOnMap,
    setMinorOnMap,
    search,
    pickResult,
    kindVisible,
    setKindVisible,
    mapStyle,
    stackAvailable,
    setMapStyle,
    camera,
    zoom,
    northUp,
    toggleTilt,
    locate,
    searchPlaces,
    flyToPlace,
    share,
    chatOpen,
    openChat,
    closeChat,
    openCameras,
    openStreetView,
    notice,
    openSettings,
    locales,
    locale,
    setLocale,
  };
}
