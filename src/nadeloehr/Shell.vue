<script setup>
// Nadelöhr's whole interface over the map. Today first: a strip of big
// numbers, the one thing that matters, the corridors and their risk, then
// the disruptions by severity. On wide screens a left panel and a right
// insight card; on phones the strip on top and an Apple Maps sheet below.
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { formatDate, t } from '../i18n/index.js';
import { useApp } from './useApp.js';
import { disruptionCard } from './disruptions.js';
import { gaugeCard } from './rivers.js';
import { warningCard } from './warnings.js';
import WarningCard from './components/WarningCard.vue';
import ParkingCard from './components/ParkingCard.vue';
import { affectedParkingIds } from '../layers/truckParking/records.js';
import { corridorView } from './today.js';
import { kaubRow } from '../layers/riverLevels/records.js';
import { useCollapsed } from './collapse.js';
import { PhCaretDown } from '@phosphor-icons/vue';
import BrandMark from './components/BrandMark.vue';
import CorridorCards from './components/CorridorCards.vue';
import CorridorDetail from './components/CorridorDetail.vue';
import DisruptionsSection from './components/DisruptionsSection.vue';
import GaugeCard from './components/GaugeCard.vue';
import HeaderTools from './components/HeaderTools.vue';
import HeroCard from './components/HeroCard.vue';
import HomePanel from './components/HomePanel.vue';
import KaubInsight from './components/KaubInsight.vue';
import MapControls from './components/MapControls.vue';
import MapLegend from './components/MapLegend.vue';
import MapStylePicker from './components/MapStylePicker.vue';
import PlaceCard from './components/PlaceCard.vue';
import RouteCheck from './components/RouteCheck.vue';
import MyPins from './components/MyPins.vue';
import PanelTabs from './components/PanelTabs.vue';
import IntroTour from './components/IntroTour.vue';
import SearchField from './components/SearchField.vue';
import TodayStrip from './components/TodayStrip.vue';
import TodaySkeleton from './components/TodaySkeleton.vue';
import InstallPrompt from './components/InstallPrompt.vue';
import { useSwipe } from './swipe.js';

const app = useApp();

/** A reactive media query. */
function useMedia(query) {
  const list = globalThis.matchMedia?.(query);
  const matches = ref(list?.matches === true);
  const update = () => (matches.value = list.matches);
  list?.addEventListener?.('change', update);
  onBeforeUnmount(() => list?.removeEventListener?.('change', update));
  return matches;
}
/** ≥ 1024 px: fixed left panel. ≥ 1280 px: the right insight card too. */
const wide = useMedia('(min-width: 1024px)');
const wider = useMedia('(min-width: 1280px)');
const narrow = useMedia('(max-width: 639px)');

// ── Selection ────────────────────────────────────────────────
const card = computed(() =>
  app.selected.value ? disruptionCard(app.selected.value) : null,
);
const gauge = computed(() =>
  app.selectedGauge.value ? gaugeCard(app.selectedGauge.value) : null,
);
const warning = computed(() =>
  app.selectedWarning.value ? warningCard(app.selectedWarning.value) : null,
);
const parkingRow = computed(() => app.selectedParking.value);
const parkingAffected = computed(
  () =>
    Boolean(parkingRow.value) &&
    affectedParkingIds([parkingRow.value], app.disruptions.value).size > 0,
);
const corridors = computed(() => app.corridors.value.map(corridorView));
const corridor = computed(
  () =>
    corridors.value.find((c) => c.id === app.selectedCorridorId.value) || null,
);
const kaub = computed(() => kaubRow(app.gauges.value));
const insight = useCollapsed('insight');
const insightTitle = computed(() =>
  corridor.value
    ? `${corridor.value.title} · ${corridor.value.score ?? '–'}`
    : kaub.value
      ? `Kaub · ${kaub.value.levelCm} ${t('cm')}`
      : '',
);
function closeCard() {
  app.select(null);
  app.selectGauge(null);
  app.selectWarning(null);
  app.selectParking(null);
}

// ── The sheet (below 1024 px): peek, half and full, as in Apple Maps ──
const DETENTS = ['peek', 'half', 'full'];
const sheet = ref('peek');
const expanded = computed(() => wide.value || sheet.value !== 'peek');
function open() {
  if (!wide.value && sheet.value === 'peek') sheet.value = 'half';
}
watch(
  [card, gauge, warning, parkingRow],
  (selections) => selections.some(Boolean) && open(),
);
watch(corridor, (next) => next && !wider.value && open());
function step(direction) {
  const order = narrow.value ? DETENTS : ['peek', 'full'];
  const index = Math.max(0, order.indexOf(sheet.value));
  sheet.value =
    order[Math.min(order.length - 1, Math.max(0, index + direction))];
}
function toggleSheet() {
  sheet.value = expanded.value ? 'peek' : narrow.value ? 'half' : 'full';
}
const dragOffset = ref(0);
let drag = null;
function onDragStart(event) {
  if (wide.value) return;
  if (event.button !== undefined && event.button !== 0) return;
  if (event.target.closest('input, button:not([data-grabber])')) return;
  drag = { y: event.clientY, t: performance.now(), moved: false };
  event.currentTarget.setPointerCapture?.(event.pointerId);
}
function onDragMove(event) {
  if (!drag) return;
  const dy = event.clientY - drag.y;
  if (Math.abs(dy) > 4) drag.moved = true;
  dragOffset.value = Math.max(-120, Math.min(240, dy));
}
function onDragEnd(event) {
  if (!drag) return;
  const dy = event.clientY - drag.y;
  const velocity = dy / Math.max(1, performance.now() - drag.t);
  const moved = drag.moved;
  drag = null;
  dragOffset.value = 0;
  if (!moved) return;
  if (dy < -40 || velocity < -0.5) step(1);
  else if (dy > 40 || velocity > 0.5) step(-1);
}

// ── Swipes in the panel (touch) ──────────────────────────────
// On the tabs: left and right move between Today, Routes and Map. On a
// corridor: to the next or previous corridor (right on the first goes
// back). On any other card: right goes back to the list.
const TAB_ORDER = ['today', 'routes', 'map'];
const hasCard = computed(() =>
  Boolean(card.value || gauge.value || warning.value || parkingRow.value),
);
const corridorIndex = computed(() =>
  corridors.value.findIndex((c) => c.id === corridor.value?.id),
);
const showsCorridor = computed(
  () => !hasCard.value && Boolean(corridor.value) && !wider.value,
);
function canSwipe(direction) {
  if (hasCard.value) return direction === 'right';
  if (showsCorridor.value)
    return (
      direction === 'right' || corridorIndex.value < corridors.value.length - 1
    );
  const index = TAB_ORDER.indexOf(app.tab.value);
  return direction === 'left' ? index < TAB_ORDER.length - 1 : index > 0;
}
const swipe = useSwipe({
  canSwipe,
  onSwipe(direction) {
    const step = direction === 'left' ? 1 : -1;
    if (hasCard.value) return closeCard();
    if (showsCorridor.value) {
      const next = corridors.value[corridorIndex.value + step];
      return app.selectCorridor(next ? next.id : null);
    }
    const index = TAB_ORDER.indexOf(app.tab.value) + step;
    if (TAB_ORDER[index]) app.setTab(TAB_ORDER[index]);
  },
});

// ── Today strip and headline ─────────────────────────────────
const activeKpi = computed(
  () =>
    ({ critical: 'closed', major: 'warnings', minor: 'exits' })[
      app.severity.value
    ] || null,
);
function pickKpi(kpi) {
  const action = kpi.action || {};
  if (action.severity) {
    app.setTab('today');
    app.setSeverity(action.severity);
    open();
  } else if (action.gauge) app.showGaugeOnMap(action.gauge);
  else if (action.rivers) {
    app.setLayer('river-levels', true);
    app.setTab('map');
    open();
  } else if (action.warnings) {
    const [first] = app.warnings.value;
    if (first) app.showWarningOnMap(first);
    else open();
  }
}
function openHeadline(headline) {
  if (headline.gauge) app.showGaugeOnMap(headline.gauge);
  else if (headline.warning) app.showWarningOnMap(headline.warning);
  else if (headline.corridorId) app.selectCorridor(headline.corridorId);
}
const peekLine = computed(() =>
  app.disruptions.value.length || app.gauges.value.length
    ? app.headline.value.title
    : t('Loading live traffic…'),
);
const updatedAt = computed(() => {
  const stamp = app.layerById('autobahn-traffic')?.stats?.lastUpdate;
  return Number.isFinite(stamp)
    ? formatDate(stamp, { hour: '2-digit', minute: '2-digit' })
    : null;
});

// ── Map style and location ───────────────────────────────────
const styleOpen = ref(false);
const mapStyles = computed(() =>
  [
    {
      id: 'streets',
      label: t('Map'),
      preview:
        'linear-gradient(135deg, #f2efe9 0 55%, #f7d58b 55% 60%, #aad3df 60%)',
    },
    {
      id: 'esri-imagery',
      label: t('Satellite'),
      preview: 'linear-gradient(135deg, #3d5a3a, #6b7f4f 50%, #2f4a63)',
    },
    {
      id: 'photoreal',
      label: t('3D city'),
      preview:
        'linear-gradient(160deg, #9fb8d0 0 40%, #8b8f86 40% 70%, #5e6b57 70%)',
    },
  ].filter((style) => app.stackAvailable(style.id)),
);
async function pickStyle(id) {
  await app.setMapStyle(id);
  styleOpen.value = false;
}
const locating = ref(false);
async function locate() {
  locating.value = true;
  try {
    await app.locate();
  } finally {
    locating.value = false;
  }
}
</script>

<template>
  <div class="nadeloehr nd-compact pointer-events-none fixed inset-0 z-[400]">
    <!-- Top bar: brand, search, freshness -->
    <header
      class="absolute inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))] z-20 flex items-start gap-2.5 lg:inset-x-4"
    >
      <div
        class="glass pointer-events-auto flex h-11 shrink-0 items-center gap-2 rounded-full px-2 lg:ps-2.5 lg:pe-4"
      >
        <BrandMark class="size-7 text-foreground" />
        <span class="text-headline font-bold max-lg:sr-only" translate="no"
          >Nadelöhr</span
        >
      </div>
      <div
        class="glass pointer-events-auto min-w-0 flex-1 rounded-[22px] lg:mx-auto lg:max-w-[460px]"
      >
        <SearchField floating :search="app.search" @pick="app.pickResult" />
      </div>
      <HeaderTools v-if="wide" :app="app" />
      <p
        v-if="updatedAt"
        class="glass pointer-events-auto mt-1.5 flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-caption font-semibold text-muted-foreground max-lg:hidden"
      >
        <span
          class="size-[7px] rounded-full bg-[#34c759] shadow-[0_0_0_3px_rgb(52_199_89/0.2)]"
        />
        {{ t('Live · {time}', { time: updatedAt }) }}
      </p>
    </header>

    <!-- Today in numbers -->
    <TodayStrip
      v-if="app.kpis.value.length"
      class="pointer-events-auto absolute inset-x-3 top-[calc(max(0.75rem,env(safe-area-inset-top))+56px)] lg:right-4 lg:left-[432px]"
      :kpis="app.kpis.value"
      :active="activeKpi"
      :horizon="app.horizon.value"
      :loading="!app.loaded.value"
      @pick="pickKpi"
      @update:horizon="app.setHorizon"
    />

    <!-- Right insight: the selected corridor, else Kaub (≥ 1280 px) -->
    <aside
      v-if="wider && (corridor || kaub)"
      class="glass-strong nd-scroll pointer-events-auto absolute top-[184px] right-4 max-h-[calc(100%-264px)] w-[320px] overflow-y-auto rounded-[26px]"
      :class="insight.isCollapsed() ? 'px-4 py-2.5' : 'p-4'"
    >
      <button
        type="button"
        class="absolute top-3 right-3 z-10 grid size-7 cursor-pointer place-items-center rounded-full text-muted-foreground outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring"
        :class="insight.isCollapsed() ? 'top-2' : corridor ? 'right-12' : ''"
        :aria-label="insight.isCollapsed() ? t('Expand') : t('Collapse')"
        :aria-expanded="String(!insight.isCollapsed())"
        @click="insight.toggle"
      >
        <PhCaretDown
          weight="bold"
          class="size-3.5 transition-transform"
          :class="insight.isCollapsed() ? '' : 'rotate-180'"
        />
      </button>
      <p v-if="insight.isCollapsed()" class="truncate pe-8 text-headline">
        {{ insightTitle }}
      </p>
      <template v-else>
        <CorridorDetail
          v-if="corridor"
          :corridor="corridor"
          :history="app.corridorHistory.value"
          @close="app.selectCorridor(null)"
        />
        <KaubInsight
          v-else
          :gauge="kaub"
          :horizon="app.horizon.value"
          :range="app.range.value"
          @open="app.showGaugeOnMap"
        />
      </template>
    </aside>

    <!-- Map controls: under the strip on phones, bottom right on desktop -->
    <div
      class="pointer-events-auto absolute top-[calc(max(0.75rem,env(safe-area-inset-top))+150px)] right-3 flex flex-col items-end gap-3 lg:top-auto lg:right-4 lg:bottom-14 xl:right-[352px] xl:bottom-14"
    >
      <MapControls
        :heading-deg="app.camera.value?.heading ?? 0"
        :tilted="app.camera.value?.tilted === true"
        :locating="locating"
        @map-style="styleOpen = !styleOpen"
        @toggle-3d="app.toggleTilt()"
        @locate="locate"
        @zoom-in="app.zoom('in')"
        @zoom-out="app.zoom('out')"
        @north="app.northUp()"
      />
    </div>
    <div
      v-if="styleOpen"
      class="pointer-events-auto absolute top-[calc(max(0.75rem,env(safe-area-inset-top))+150px)] right-16 left-3 flex justify-end sm:left-auto lg:top-auto lg:right-20 lg:bottom-14 xl:right-[416px]"
    >
      <MapStylePicker
        :styles="mapStyles"
        :selected="app.mapStyle.value"
        @select="pickStyle"
        @close="styleOpen = false"
      />
    </div>

    <MapLegend
      v-if="wider"
      :app="app"
      class="pointer-events-auto absolute bottom-12 left-[432px]"
    />

    <!-- A tool's short message -->
    <p
      v-if="app.notice.value"
      role="status"
      class="glass-strong pointer-events-auto absolute top-[calc(max(0.75rem,env(safe-area-inset-top))+150px)] left-1/2 max-w-[min(420px,calc(100vw-2rem))] -translate-x-1/2 rounded-full px-4 py-2 text-center text-callout font-semibold"
    >
      {{ app.notice.value }}
    </p>

    <!-- Panel (≥ 1024 px) or sheet -->
    <section
      class="glass-strong pointer-events-auto absolute inset-x-0 bottom-0 flex flex-col rounded-t-[var(--sheet-radius)] pb-[env(safe-area-inset-bottom)] transition-[height,transform] duration-300 ease-[cubic-bezier(0.2,0.9,0.3,1)] sm:inset-x-auto sm:bottom-4 sm:left-4 sm:w-[400px] sm:rounded-sheet sm:pb-0 lg:top-[calc(max(0.75rem,env(safe-area-inset-top))+56px)]"
      :class="
        wide
          ? ''
          : {
              'h-[52dvh]': sheet === 'half',
              'h-[88dvh]': sheet === 'full',
              'sm:h-auto sm:max-h-[calc(100dvh-14rem)]': expanded,
            }
      "
      :style="dragOffset ? { transform: `translateY(${dragOffset}px)` } : null"
      aria-label="Nadelöhr"
    >
      <div
        v-if="!wide"
        class="shrink-0 touch-none select-none"
        @pointerdown="onDragStart"
        @pointermove="onDragMove"
        @pointerup="onDragEnd"
        @pointercancel="onDragEnd"
      >
        <button
          type="button"
          data-grabber
          class="nd-no-hit mx-auto block h-11 w-20 cursor-grab"
          :aria-label="expanded ? t('Collapse') : t('Expand')"
          :aria-expanded="String(expanded)"
          @click="toggleSheet"
        >
          <span
            class="mx-auto block h-[5px] w-9 rounded-full bg-muted-foreground/45"
          ></span>
        </button>
        <button
          v-if="!expanded"
          type="button"
          class="block min-h-11 w-full cursor-pointer truncate px-5 pb-3 text-start text-headline"
          @click="toggleSheet"
        >
          {{ peekLine }}
        </button>
      </div>

      <div
        v-if="expanded"
        class="nd-scroll scroll-edge min-h-0 flex-1 touch-pan-y px-4 pt-1 pb-4 lg:pt-4"
        :style="
          swipe.offset.value
            ? { transform: `translateX(${swipe.offset.value}px)` }
            : { transition: 'transform 200ms ease-out' }
        "
        v-bind="swipe.handlers"
      >
        <PlaceCard
          v-if="card"
          :card="card"
          @close="closeCard"
          @focus="app.showOnMap(app.selected.value, { close: true })"
          @share="app.share()"
        />
        <GaugeCard
          v-else-if="gauge"
          :card="gauge"
          :series="app.selectedGauge.value?.series || []"
          @close="closeCard"
          @focus="app.showGaugeOnMap(app.selectedGauge.value, { close: true })"
          @share="app.share()"
        />
        <WarningCard
          v-else-if="warning"
          :card="warning"
          @close="closeCard"
          @focus="app.showWarningOnMap(app.selectedWarning.value)"
          @share="app.share()"
        />
        <ParkingCard
          v-else-if="parkingRow"
          :row="parkingRow"
          :affected="parkingAffected"
          @close="closeCard"
          @focus="app.showParkingOnMap(parkingRow)"
          @share="app.share()"
        />
        <CorridorDetail
          v-else-if="corridor && !wider"
          :corridor="corridor"
          :history="app.corridorHistory.value"
          @close="app.selectCorridor(null)"
        />
        <div v-else class="flex flex-col gap-4">
          <!-- Sticky tabs on a near-solid band, so cards scrolling under
               them never show through the labels. -->
          <div
            class="sticky -top-1 z-10 -mx-4 -mt-1 lg:-top-4 bg-[color-mix(in_oklch,var(--background)_94%,transparent)] px-4 pt-1 pb-2 backdrop-blur-xl lg:-mt-4 lg:pt-4"
          >
            <PanelTabs
              :model-value="app.tab.value"
              @update:model-value="app.setTab"
            />
          </div>
          <div
            v-if="app.tab.value === 'today'"
            id="nd-panel-today"
            role="tabpanel"
            aria-labelledby="nd-tab-today"
            class="flex flex-col gap-5"
          >
            <TodaySkeleton v-if="!app.loaded.value" />
            <template v-else>
              <HeroCard
                :headline="app.headline.value"
                :horizon="app.horizon.value"
                @open="openHeadline"
              />
              <MyPins :app="app" />
              <CorridorCards
                :corridors="corridors"
                :selected-id="app.selectedCorridorId.value"
                @select="app.selectCorridor"
              />
              <DisruptionsSection :app="app" />
            </template>
          </div>
          <div
            v-else-if="app.tab.value === 'routes'"
            id="nd-panel-routes"
            role="tabpanel"
            aria-labelledby="nd-tab-routes"
            class="flex flex-col gap-5"
          >
            <RouteCheck :app="app" />
          </div>
          <div
            v-else
            id="nd-panel-map"
            role="tabpanel"
            aria-labelledby="nd-tab-map"
          >
            <HomePanel :app="app" :tools-in-bar="wide" />
          </div>
        </div>
      </div>
    </section>

    <!-- First visit: a short welcome (once per browser). -->
    <IntroTour v-if="app.kpis.value.length" />
    <!-- Later visits: offer to add the app to the home screen. -->
    <InstallPrompt />
  </div>
</template>
