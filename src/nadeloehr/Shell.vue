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
import SearchField from './components/SearchField.vue';
import TodayStrip from './components/TodayStrip.vue';

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
}

// ── The sheet (below 1024 px): peek, half and full, as in Apple Maps ──
const DETENTS = ['peek', 'half', 'full'];
const sheet = ref('peek');
const expanded = computed(() => wide.value || sheet.value !== 'peek');
function open() {
  if (!wide.value && sheet.value === 'peek') sheet.value = 'half';
}
watch([card, gauge], ([a, b]) => (a || b) && open());
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
    app.setSeverity(action.severity);
    open();
  } else if (action.gauge) app.showGaugeOnMap(action.gauge);
  else if (action.rivers) {
    app.setLayer('river-levels', true);
    open();
  }
}
function openHeadline(headline) {
  if (headline.gauge) app.showGaugeOnMap(headline.gauge);
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
      @pick="pickKpi"
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
          @close="app.selectCorridor(null)"
        />
        <KaubInsight v-else :gauge="kaub" @open="app.showGaugeOnMap" />
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
      class="pointer-events-auto absolute bottom-4 left-[432px]"
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
          class="mx-auto mt-2 mb-1 block h-5 w-12 cursor-grab"
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
          class="block w-full cursor-pointer truncate px-5 pt-1 pb-4 text-start text-headline"
          @click="toggleSheet"
        >
          {{ peekLine }}
        </button>
      </div>

      <div
        v-if="expanded"
        class="nd-scroll scroll-edge min-h-0 flex-1 px-4 pt-1 pb-4 lg:pt-4"
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
        <CorridorDetail
          v-else-if="corridor && !wider"
          :corridor="corridor"
          @close="app.selectCorridor(null)"
        />
        <div v-else class="flex flex-col gap-5">
          <HeroCard :headline="app.headline.value" @open="openHeadline" />
          <CorridorCards
            :corridors="corridors"
            :selected-id="app.selectedCorridorId.value"
            @select="app.selectCorridor"
          />
          <DisruptionsSection :app="app" />
          <HomePanel :app="app" :tools-in-bar="wide" />
        </div>
      </div>
    </section>
  </div>
</template>
