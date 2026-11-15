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

const AUTOBAHN = 'autobahn-traffic';

export function useApp() {
  const store = useNadeloehrStore();
  const globe = useGlobeActionsStore();
  const { services, ready, disruptions, selected, layerRevision } =
    storeToRefs(store);
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
  const autobahnModule = () =>
    services.value?.dataManager?.layers?.get?.(AUTOBAHN)?.module || null;

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

  function select(row) {
    autobahnModule()?.select?.(row ? row.stableId : null);
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
  const kindVisible = (kind) => {
    void layerRevision.value;
    void disruptions.value;
    return autobahnModule()?.isKindVisible?.(kind) !== false;
  };
  function setKindVisible(kind, visible) {
    autobahnModule()?.setKindVisible?.(kind, visible);
    store.touchLayers();
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
