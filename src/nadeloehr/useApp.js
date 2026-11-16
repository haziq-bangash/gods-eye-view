/**
 * Everything the Nadelöhr shell asks of the running application, in plain
 * verbs. It drives upstream through the services the tools phase publishes
 * (src/app/tools.js) and upstream's own stores, so the hidden upstream
 * panels and the shell always agree.
 */
import { banNotice } from './bans.js';
import { fetchMiddleRhineShips } from './rhineShips.js';
import { computed, onBeforeUnmount, onMounted, shallowRef, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { formatDate, getLocale, t } from '../i18n/index.js';
import { LOCALES, LOCALE_NAMES } from '../i18n/locale.js';
import { useGlobeActionsStore } from '../ui/stores/globeActions.js';
import { useLocaleStore } from '../ui/stores/locale.js';
import { useVoiceStore } from '../ui/stores/voice.js';
import { useNadeloehrStore } from './store.js';
import { CORRIDORS, scoreCorridors, scoreRoute } from '../freight/corridors.js';
import { kaubRow, levelDuring } from '../layers/riverLevels/records.js';
import { berlinParts, berlinTime, horizonRange } from '../freight/horizon.js';
import { CORRIDOR_HISTORY_URL } from './history.js';
import { affectedParkingIds } from '../layers/truckParking/records.js';
import { coordinateResult, localResults, searchPlacesDE } from './search.js';
import { todayHeadline, todayKpis } from './today.js';
import { statesAlong } from '../freight/germanStates.js';
import {
  blockingClosures,
  detourAround,
  detourVias,
  routeVerdict as verdictFor,
} from './routeVerdict.js';
import { planTrip } from './tripPlan.js';
import { cityMatches, mergeSuggestions, SUGGESTIONS_MAX } from './suggest.js';
import { readTripQuery, tripQuery, withoutTrip } from './tripLink.js';

const MINOR_KINDS = Object.freeze([
  'ramp-closure',
  'short-roadworks',
  'roadworks',
]);

const AUTOBAHN = 'autobahn-traffic';
const RIVERS = 'river-levels';
const WEATHER = 'weather-warnings';
const PARKING = 'truck-parking';
const TRAINS = 'db-trains';

/**
 * A repeating timer that never keeps Node alive (tests mount the shell
 * without unmounting it); in the browser it is a plain setInterval.
 */
function every(ms, fn) {
  const timer = setInterval(fn, ms);
  timer?.unref?.();
  return timer;
}

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
    parking,
    selectedParking,
    selectedTrain,
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
  const parkingModule = () => layerModule(PARKING);
  const trainsModule = () => layerModule(TRAINS);
  /** Clear every layer's selection but one, so one card shows at a time. */
  function clearLayerSelections(keep) {
    for (const [id, module] of [
      [AUTOBAHN, autobahnModule],
      [RIVERS, riverModule],
      [WEATHER, weatherModule],
      [PARKING, parkingModule],
      [TRAINS, trainsModule],
    ])
      if (id !== keep) module()?.select?.(null);
  }

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
    if (row) clearLayerSelections(AUTOBAHN);
    autobahnModule()?.select?.(row ? row.stableId : null);
  }
  function selectParking(row) {
    if (row) clearLayerSelections(PARKING);
    if (!parkingModule()?.select?.(row ? row.stableId : null))
      store.publishSelectedParking(row || null);
  }
  function showParkingOnMap(row) {
    if (!row) return;
    selectParking(row);
    flyFlat(row.lat, row.lon, 12_000);
  }
  function selectTrain(row) {
    if (row) clearLayerSelections(TRAINS);
    if (!trainsModule()?.select?.(row ? row.id : null))
      store.publishSelectedTrain(row || null);
  }
  /** Keep the camera on the picked train (true) or let go (false). */
  function followTrain(on) {
    return trainsModule()?.follow?.(on) ?? false;
  }
  function showTrainOnMap(row) {
    if (!row) return;
    selectTrain(row);
    flyFlat(row.lat, row.lon, 60_000);
  }
  function selectWarning(row) {
    if (row) clearLayerSelections(WEATHER);
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
    if (row) clearLayerSelections(RIVERS);
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
  const parkingOn = computed(() => layerById(PARKING)?.enabled === true);
  // Rest areas next to active closures turn red on the map.
  watch(
    [parking, disruptions],
    ([rows, events]) =>
      parkingModule()?.setAffected?.(affectedParkingIds(rows, events)),
    { immediate: true },
  );
  // ── When: now, tonight or tomorrow (Berlin time) ─────────────────
  const horizon = shallowRef('now');
  const clock = shallowRef(Date.now());
  let tick = null;
  onMounted(() => {
    clock.value = Date.now();
    tick = every(60_000, () => (clock.value = Date.now()));
  });
  onBeforeUnmount(() => clearInterval(tick));
  /** [from, to] of the chosen horizon; "now" is the current instant. */
  const range = computed(() => horizonRange(horizon.value, clock.value));
  /** Truck driving bans for the chosen time, anywhere in Germany. */
  const bans = computed(() =>
    banNotice({ horizon: horizon.value, range: range.value, now: clock.value }),
  );
  /** The same for a set of states (a corridor's). */
  const bansFor = (states) =>
    banNotice({
      horizon: horizon.value,
      range: range.value,
      now: clock.value,
      states,
    });
  /**
   * The least DWD level drawn on the map: 'moderate' by default, because
   * minor warnings often cover most of the country and hide everything else.
   * Kept in the browser; lists and corridor scores still count every level.
   */
  const WEATHER_LEVEL_KEY = 'nadeloehr.weatherLevel.v1';
  const WEATHER_LEVELS = ['minor', 'moderate', 'severe'];
  const weatherLevel = shallowRef(
    (() => {
      try {
        const saved = globalThis.localStorage?.getItem(WEATHER_LEVEL_KEY);
        return WEATHER_LEVELS.includes(saved) ? saved : 'moderate';
      } catch {
        return 'moderate';
      }
    })(),
  );
  function setWeatherLevel(level) {
    if (!WEATHER_LEVELS.includes(level)) return;
    weatherLevel.value = level;
    try {
      globalThis.localStorage?.setItem(WEATHER_LEVEL_KEY, level);
    } catch {}
    weatherModule()?.setMinimumLevel?.(level);
    store.touchLayers();
  }
  function applyTimeRange() {
    const timed = horizon.value === 'now' ? null : range.value;
    autobahnModule()?.setTimeRange?.(timed);
    weatherModule()?.setTimeRange?.(timed);
    weatherModule()?.setMinimumLevel?.(weatherLevel.value);
    store.touchLayers();
  }
  function setHorizon(next) {
    horizon.value = next;
    applyTimeRange();
  }
  // A freshly loaded layer starts at "now"; give it the chosen range.
  watch([services, range], applyTimeRange);
  // A layer switched on later gets the chosen weather level too.
  watch(
    () => weatherOn.value,
    (on) => on && weatherModule()?.setMinimumLevel?.(weatherLevel.value),
  );
  /** Kaub's level for the horizon: the reading now, else the forecast. */
  const kaubLevel = computed(() => {
    const kaub = kaubRow(gauges.value);
    return kaub ? levelDuring(kaub, range.value) : null;
  });

  const corridors = computed(() =>
    scoreCorridors({
      events: disruptions.value,
      kaubLevelCm: kaubLevel.value,
      warnings: weatherOn.value ? warnings.value : null,
      restAreas: parkingOn.value ? parking.value : null,
      range: horizon.value === 'now' ? null : range.value,
    }),
  );
  /** True once the first Autobahn data has arrived (until then: placeholders). */
  const loaded = computed(() =>
    Number.isFinite(layerById('autobahn-traffic')?.stats?.lastUpdate),
  );
  const kpis = computed(() =>
    todayKpis(disruptions.value, gauges.value, {
      warnings: weatherOn.value ? warnings.value : null,
      horizon: horizon.value,
      range: range.value,
    }),
  );
  const headline = computed(() =>
    todayHeadline(gauges.value, corridors.value, {
      warnings: weatherOn.value ? warnings.value : [],
      horizon: horizon.value,
      range: range.value,
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
  /** The corridor bands on the map (the legend's switch). */
  const corridorsOnMap = shallowRef(true);
  function setCorridorsOnMap(on) {
    corridorsOnMap.value = Boolean(on);
    services.value?.corridorOverlay?.setVisible?.(corridorsOnMap.value);
  }
  function selectCorridor(id) {
    selectedCorridorId.value = id || null;
    if (!id) return;
    select(null);
    selectGauge(null);
    selectWarning(null);
    selectParking(null);
    const corridor = CORRIDORS.find((entry) => entry.id === id);
    if (corridor) services.value?.flyToPoints?.(corridor.path);
  }

  // ── The panel's view: today, routes or map (kept in this browser) ──
  const TAB_KEY = 'nadeloehr.tab.v1';
  const TABS = ['today', 'routes', 'map'];
  const tab = shallowRef(
    TABS.includes(globalThis.localStorage?.getItem?.(TAB_KEY))
      ? globalThis.localStorage.getItem(TAB_KEY)
      : 'today',
  );
  function setTab(next) {
    if (!TABS.includes(next)) return;
    tab.value = next;
    try {
      globalThis.localStorage?.setItem(TAB_KEY, next);
    } catch {
      /* Private mode: the choice lasts for this visit. */
    }
  }

  // ── Corridor history (recorded hourly by a GitHub Action) ──────
  const corridorHistory = shallowRef(null);
  async function loadHistory() {
    try {
      const response = await fetch(CORRIDOR_HISTORY_URL, {
        cache: 'no-cache',
      });
      if (response.ok) corridorHistory.value = await response.json();
    } catch {
      /* No history yet, or offline: the breakdown simply omits it. */
    }
  }
  // Network loads and timers start once the shell is in a browser page, not
  // while it is rendered on a server (tests do), which would fetch from the
  // internet and outlive the render.
  let historyTimer = null;
  onMounted(() => {
    loadHistory();
    historyTimer = every(3_600_000, loadHistory);
  });
  onBeforeUnmount(() => clearInterval(historyTimer));

  // ── Ships on the Middle Rhine (live AIS, when the server has a key) ──
  const rhineShips = shallowRef(null);
  async function loadRhineShips() {
    rhineShips.value = await fetchMiddleRhineShips();
  }
  let shipsTimer = null;
  onMounted(() => {
    loadRhineShips();
    shipsTimer = every(120_000, loadRhineShips);
  });
  onBeforeUnmount(() => clearInterval(shipsTimer));
  /** Ships layer on, and the camera over the valley between Bingen and Koblenz. */
  function showRhineShips() {
    setLayer('ais-live-vessels', true);
    flyFlat(50.12, 7.74, 60_000);
  }

  // ── Check a route ─────────────────────────────────────────────
  /** { from, to, path, distanceM, durationS } once a route is found. */
  const route = shallowRef(null);
  /** 'idle' | 'loading' | 'error', and a plain message on error. */
  const routeStatus = shallowRef('idle');
  const routeError = shallowRef('');
  let routeRequest = null;
  async function findPlace(text, signal) {
    const typed = coordinateResult(text);
    if (typed) return typed.place;
    const [first] = await searchPlacesDE(text, {
      locale: getLocale(),
      signal,
    });
    return first?.place || null;
  }
  /** The route form's two fields, shared with the search bar. */
  const routeFrom = shallowRef('');
  const routeTo = shallowRef('');
  /**
   * @param {string} fromText
   * @param {string} toText
   * @param {{fromPlace?: ?object, toPlace?: ?object}} [picked] - Places
   *   chosen from suggestions: used as they are, not looked up again.
   */
  async function checkRoute(fromText, toText, picked = {}) {
    routeFrom.value = fromText;
    routeTo.value = toText;
    routeRequest?.abort();
    detourRequest?.abort();
    const request = new AbortController();
    routeRequest = request;
    routeStatus.value = 'loading';
    routeError.value = '';
    try {
      const [from, to] = await Promise.all([
        picked.fromPlace || findPlace(fromText, request.signal),
        picked.toPlace || findPlace(toText, request.signal),
      ]);
      if (!from || !to) {
        routeStatus.value = 'error';
        routeError.value = t('Could not find {place}.', {
          place: !from ? fromText : toText,
        });
        return;
      }
      const coords = [from, to]
        .map((place) => `${place.lng.toFixed(5)},${place.lat.toFixed(5)}`)
        .join(';');
      const response = await fetch(
        `/api/route?${new URLSearchParams({ profile: 'car', coords, alternatives: '1' })}`,
        { signal: request.signal },
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.ok === false || !payload?.geometry) {
        routeStatus.value = 'error';
        routeError.value = t('No driving route found between these places.');
        return;
      }
      route.value = {
        from: from.name || fromText,
        to: to.name || toText,
        path: payload.geometry,
        distanceM: payload.distanceM,
        durationS: payload.durationS,
        summary: payload.summary || '',
        alternatives: Array.isArray(payload.alternatives)
          ? payload.alternatives
          : [],
        // State holidays ban trucks only in that state.
        states: statesAlong(payload.geometry),
        // Kept to route a way round a closure through a forcing point.
        ends: [from, to].map((place) => [place.lng, place.lat]),
      };
      routeStatus.value = 'idle';
      select(null);
      selectGauge(null);
      selectCorridor(null);
      services.value?.flyToPoints?.(payload.geometry);
    } catch (error) {
      if (error?.name === 'AbortError') return;
      routeStatus.value = 'error';
      routeError.value = t(
        'The route service is not answering. Try again in a moment.',
      );
    } finally {
      if (routeRequest === request) routeRequest = null;
    }
  }
  function clearRoute() {
    routeRequest?.abort();
    detourRequest?.abort();
    route.value = null;
    routeStatus.value = 'idle';
    routeError.value = '';
  }
  const routeScore = computed(() =>
    route.value
      ? scoreRoute(route.value, {
          events: disruptions.value,
          warnings: weatherOn.value ? warnings.value : null,
          restAreas: parkingOn.value ? parking.value : null,
          range: horizon.value === 'now' ? null : range.value,
        })
      : null,
  );
  /** The route's answer in plain words: problems, detour, bans. */
  // ── The trip by truck: departure, breaks, when you reach closures ──
  /** "HH:MM" the reader chose to leave at, or '' for the horizon's start. */
  const departAt = shallowRef('');
  /** Departure, epoch ms: the chosen time on the horizon's day, else its start. */
  const departure = computed(() => {
    const start = horizon.value === 'now' ? clock.value : range.value[0];
    const match = /^(\d{1,2}):(\d{2})$/.exec(departAt.value);
    if (!match) return start;
    const p = berlinParts(start);
    let at = berlinTime(
      p.year,
      p.month,
      p.day,
      Number(match[1]),
      Number(match[2]),
    );
    // A time already gone today means tomorrow.
    if (at < clock.value - 5 * 60_000) at += 24 * 3_600_000;
    return at;
  });
  const tripPlan = computed(() => {
    const current = route.value;
    const scored = routeScore.value;
    if (!current || !scored) return null;
    const rows = parkingOn.value ? parking.value : null;
    return planTrip({
      path: current.path,
      distanceM: current.distanceM,
      durationS: current.durationS,
      depart: departure.value,
      restAreas: rows,
      unusable: rows ? affectedParkingIds(rows, disruptions.value) : new Set(),
      closures: scored.events.filter((row) => row.kind === 'closure'),
    });
  });
  /** When the truck reaches each closure, by stableId. */
  const closureTiming = computed(
    () =>
      new Map(
        (tripPlan.value?.closures || []).map((entry) => [
          entry.row.stableId,
          entry,
        ]),
      ),
  );
  function setDepartAt(value) {
    departAt.value = /^\d{1,2}:\d{2}$/.test(value) ? value : '';
  }
  function planBreaks() {
    return setLayer(PARKING, true);
  }

  /** 'shared' | 'copied' | 'failed' for a moment after sharing, else ''. */
  const shareStatus = shallowRef('');
  let shareStatusTimer = null;
  /** Share the checked trip: the phone's share sheet, else the clipboard. */
  async function shareRoute() {
    if (!route.value) return;
    const query = tripQuery({
      from: routeFrom.value,
      to: routeTo.value,
      leave: departAt.value,
      when: horizon.value,
    });
    if (!query) return;
    const { origin, pathname } = globalThis.location;
    const url = `${origin}${pathname}${query}`;
    const text = routeVerdict.value
      ? `${routeFrom.value} → ${routeTo.value}: ${routeVerdict.value.headline}`
      : `${routeFrom.value} → ${routeTo.value}`;
    let status = 'failed';
    try {
      if (
        globalThis.navigator?.share &&
        globalThis.matchMedia?.('(pointer: coarse)').matches
      ) {
        // i18n-ignore: the product's name
        await globalThis.navigator.share({ title: 'Nadelöhr', text, url });
        status = 'shared';
      } else {
        await globalThis.navigator.clipboard.writeText(url);
        status = 'copied';
      }
    } catch (error) {
      // Closing the share sheet is not a failure.
      if (error?.name === 'AbortError') return;
    }
    shareStatus.value = status;
    clearTimeout(shareStatusTimer);
    shareStatusTimer = setTimeout(() => (shareStatus.value = ''), 3000);
  }

  // ── A way round a closure ──
  // When none of the router's own alternatives avoids the first closure on
  // the route, route twice more through a point 20 km to either side of it.
  const detourPending = shallowRef(false);
  let detourRequest = null;
  let detourTried = new Set();
  let detourFor = null;
  async function searchDetour(current, closure) {
    const vias = detourVias(current.path, closure);
    if (!vias || !current.ends) return;
    detourRequest?.abort();
    const request = new AbortController();
    detourRequest = request;
    detourPending.value = true;
    const found = [];
    try {
      for (const via of vias) {
        const coords = [current.ends[0], via, current.ends[1]]
          .map(([lng, lat]) => `${lng.toFixed(5)},${lat.toFixed(5)}`)
          .join(';');
        const response = await fetch(
          `/api/route?${new URLSearchParams({ profile: 'car', coords, alternatives: '1' })}`,
          { signal: request.signal },
        );
        const payload = await response.json().catch(() => null);
        if (response.ok && payload?.geometry)
          found.push({
            distanceM: payload.distanceM,
            durationS: payload.durationS,
            summary: payload.summary || '',
            geometry: payload.geometry,
          });
      }
    } catch (error) {
      if (error?.name === 'AbortError') return;
    } finally {
      if (detourRequest === request) {
        detourRequest = null;
        detourPending.value = false;
      }
    }
    if (route.value === current && found.length)
      route.value = {
        ...current,
        alternatives: [...current.alternatives, ...found],
      };
  }
  watch(routeScore, (scored) => {
    const current = route.value;
    if (!scored || !current) return;
    // A new route starts afresh; a route grown by a detour keeps its tries.
    if (detourFor !== current.path) {
      detourFor = current.path;
      detourTried = new Set();
    }
    const closures = blockingClosures(
      scored.events.filter((row) => row.kind === 'closure'),
      closureTiming.value,
    );
    if (!closures.length || detourAround(current, closures)) return;
    const [first] = closures;
    const key = first.stableId ?? `${first.lon},${first.lat}`;
    if (detourTried.has(key)) return;
    detourTried.add(key);
    searchDetour(current, first);
  });

  const routeVerdict = computed(() =>
    route.value && routeScore.value
      ? verdictFor({
          route: route.value,
          scored: routeScore.value,
          bans: bansFor(route.value.states.length ? route.value.states : null),
          horizon: horizon.value,
          now: clock.value,
          weatherChecked: weatherOn.value,
          detourPending: detourPending.value,
          timing: closureTiming.value,
          tripBans: tripPlan.value?.bans ?? null,
        })
      : null,
  );
  watch(
    [routeScore, services],
    ([scored, next]) =>
      // The thinned line (~every 500 m) draws fast and looks the same.
      next?.corridorOverlay?.setRoute?.(scored ? scored.corridor.path : null),
    { immediate: true },
  );

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
  /**
   * What the search can show at once: a route or an Autobahn alone; else
   * corridors, then cities (most searches are a city), then river gauges.
   */
  function instantSearch(text) {
    const local = localResults(text, {
      events: disruptions.value,
      gauges: gauges.value,
    });
    if (
      local.some((result) => result.type === 'route' || result.type === 'road')
    )
      return local;
    const corridors = local.filter((result) => result.type === 'corridor');
    const rest = local.filter((result) => result.type !== 'corridor');
    return [...corridors, ...cityMatches(text, 4), ...rest].slice(
      0,
      SUGGESTIONS_MAX,
    );
  }
  async function placesFor(text, signal) {
    try {
      return await searchPlacesDE(text, { locale: getLocale(), signal });
    } catch (error) {
      if (error?.name !== 'AbortError')
        console.warn('[Nadelöhr] place search failed:', error);
      return [];
    }
  }
  async function search(text, { signal } = {}) {
    const instant = instantSearch(text);
    if (
      instant.some(
        (result) => result.type === 'route' || result.type === 'road',
      )
    )
      return instant;
    return mergeSuggestions(instant, await placesFor(text, signal), 8);
  }
  /** Places only, for the route's fields: cities at once… */
  const instantPlaces = (text) => {
    const typed = coordinateResult(text);
    return typed ? [typed] : cityMatches(text);
  };
  /** …and the place search's answers merged in. */
  async function suggestPlaces(text, { signal } = {}) {
    if (coordinateResult(text)) return instantPlaces(text);
    return mergeSuggestions(cityMatches(text), await placesFor(text, signal));
  }
  function pickResult(result) {
    if (!result) return;
    if (result.type === 'road') return showRoad(result.road);
    if (result.type === 'route') {
      setTab('routes');
      return checkRoute(result.from, result.to);
    }
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

  // ── The plan on the map: the way round, breaks and closures, with times ──
  watch(
    [routeVerdict, tripPlan, services],
    ([verdict, plan, next]) => {
      const overlay = next?.corridorOverlay;
      if (!overlay?.setRoutePlan) return;
      if (!verdict || !plan) return overlay.setRoutePlan(null);
      const time = (ms) =>
        formatDate(ms, { hour: '2-digit', minute: '2-digit' });
      const blocking = new Set(
        verdict.lines
          .filter((line) => line.kind === 'closure')
          .map((line) => line.row?.stableId),
      );
      overlay.setRoutePlan({
        detour: verdict.detour?.geometry || null,
        markers: [
          ...plan.breaks
            .filter((stop) => stop.row && plan.parkingKnown)
            .map((stop) => ({
              lon: stop.row.lon,
              lat: stop.row.lat,
              label: `☕ ${time(stop.at)}`,
              color: '#007aff',
            })),
          ...plan.closures
            .filter((entry) => blocking.has(entry.row.stableId))
            .map((entry) => ({
              lon: entry.row.lon,
              lat: entry.row.lat,
              label: `${entry.row.road || ''} · ${time(entry.at)}`.trim(),
              color: '#ff3b30',
            })),
        ],
      });
    },
    { immediate: true },
  );

  // ── A trip link: open one, share one ──
  // A link with ?from=…&to=… opens that trip once the map is ready, then
  // leaves the address bar as it was without it.
  let sharedTrip = readTripQuery(globalThis.location?.search);
  watch(
    services,
    (next) => {
      if (!next || !sharedTrip) return;
      const trip = sharedTrip;
      sharedTrip = null;
      setTab('routes');
      setHorizon(trip.when);
      setDepartAt(trip.leave);
      checkRoute(trip.from, trip.to);
      try {
        globalThis.history?.replaceState(
          globalThis.history.state,
          '',
          withoutTrip(globalThis.location.href),
        );
      } catch {
        /* An embedded page may not own its address bar. */
      }
    },
    { immediate: true },
  );
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
    parking,
    selectedParking,
    selectParking,
    showParkingOnMap,
    weatherLevel,
    setWeatherLevel,
    selectedTrain,
    selectTrain,
    showTrainOnMap,
    followTrain,
    parkingOn,
    horizon,
    range,
    setHorizon,
    tab,
    setTab,
    corridorsOnMap,
    setCorridorsOnMap,
    corridorHistory,
    route,
    routeFrom,
    routeTo,
    routeStatus,
    routeError,
    routeScore,
    routeVerdict,
    tripPlan,
    departure,
    departAt,
    setDepartAt,
    planBreaks,
    shareRoute,
    shareStatus,
    checkRoute,
    clearRoute,
    corridors,
    loaded,
    rhineShips,
    showRhineShips,
    bans,
    bansFor,
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
    instantSearch,
    instantPlaces,
    suggestPlaces,
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
