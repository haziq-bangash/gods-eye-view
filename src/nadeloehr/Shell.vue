<script setup>
// Nadelöhr's whole interface over the map, after Apple Maps: one sheet for
// search, what is happening and what is shown; a place card when something
// is picked; a round button stack for the map itself.
import { computed, ref, watch } from 'vue';
import { t } from '../i18n/index.js';
import { useApp } from './useApp.js';
import { disruptionCard } from './disruptions.js';
import { gaugeCard, kaubSummary } from './rivers.js';
import GaugeCard from './components/GaugeCard.vue';
import BrandMark from './components/BrandMark.vue';
import HomePanel from './components/HomePanel.vue';
import MapControls from './components/MapControls.vue';
import MapStylePicker from './components/MapStylePicker.vue';
import PlaceCard from './components/PlaceCard.vue';
import SearchField from './components/SearchField.vue';

const app = useApp();

// The sheet has three detents, as in Apple Maps: 'peek' (search and a
// one-line summary), 'half' and 'full'. Wider screens use peek and full.
const DETENTS = ['peek', 'half', 'full'];
const sheet = ref('peek');
const expanded = computed(() => sheet.value !== 'peek');
const card = computed(() =>
  app.selected.value ? disruptionCard(app.selected.value) : null,
);
const gauge = computed(() =>
  app.selectedGauge.value ? gaugeCard(app.selectedGauge.value) : null,
);
watch(gauge, (next) => {
  if (next && sheet.value === 'peek') sheet.value = 'half';
});
watch(card, (next) => {
  if (next && sheet.value === 'peek') sheet.value = 'half';
});
const isNarrow = () =>
  globalThis.matchMedia?.('(max-width: 639px)')?.matches === true;
function step(direction) {
  const order = isNarrow() ? DETENTS : ['peek', 'full'];
  const index = Math.max(0, order.indexOf(sheet.value));
  sheet.value =
    order[Math.min(order.length - 1, Math.max(0, index + direction))];
}
function toggleSheet() {
  sheet.value = expanded.value ? 'peek' : isNarrow() ? 'half' : 'full';
}

// Drag the grabber (or the header) to move between detents; a short flick
// counts, a tap toggles.
const dragOffset = ref(0);
let drag = null;
function onDragStart(event) {
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

const peekSummary = computed(() => {
  const rows = app.disruptions.value;
  if (!rows.length) return t('Loading Autobahn disruptions…');
  const closed = rows.filter((row) => row.kind === 'closure').length;
  const warnings = rows.filter((row) => row.kind === 'warning').length;
  const kaub = kaubSummary(app.gauges.value);
  if (kaub)
    return t('{closed} closed · {warnings} warnings · Kaub {level}', {
      closed,
      warnings,
      level: kaub.level,
    });
  return t('{closed} closed · {warnings} warnings · tap for details', {
    closed,
    warnings,
  });
});

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

function closeCard() {
  app.select(null);
  app.selectGauge(null);
}
</script>

<template>
  <div class="nadeloehr pointer-events-none fixed inset-0 z-[400]">
    <!-- Brand chip, top left -->
    <div
      class="glass pointer-events-auto absolute top-[max(1rem,env(safe-area-inset-top))] left-4 flex items-center gap-2 rounded-full py-1.5 ps-2 pe-4"
    >
      <BrandMark class="size-7 text-foreground" />
      <span class="text-headline font-bold" translate="no">Nadelöhr</span>
    </div>

    <!-- Map controls, right edge -->
    <div
      class="pointer-events-auto absolute top-[max(1rem,env(safe-area-inset-top))] right-4 flex flex-col items-end gap-3"
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
      class="pointer-events-auto absolute top-[max(1rem,env(safe-area-inset-top))] right-20 left-4 flex justify-end sm:left-auto"
    >
      <MapStylePicker
        :styles="mapStyles"
        :selected="app.mapStyle.value"
        @select="pickStyle"
        @close="styleOpen = false"
      />
    </div>

    <!-- A tool's short message, top centre -->
    <p
      v-if="app.notice.value"
      role="status"
      class="glass-strong pointer-events-auto absolute top-[calc(max(1rem,env(safe-area-inset-top))+56px)] left-1/2 max-w-[min(420px,calc(100vw-2rem))] -translate-x-1/2 rounded-full px-4 py-2 text-center text-callout font-semibold sm:top-[max(1rem,env(safe-area-inset-top))]"
    >
      {{ app.notice.value }}
    </p>

    <!-- The sheet: bottom on phones, a floating card on wider screens -->
    <section
      class="glass-strong pointer-events-auto absolute inset-x-0 bottom-0 flex flex-col rounded-t-[var(--sheet-radius)] pb-[env(safe-area-inset-bottom)] transition-[height,transform] duration-300 ease-[cubic-bezier(0.2,0.9,0.3,1)] sm:inset-x-auto sm:bottom-4 sm:left-4 sm:w-[400px] sm:rounded-sheet sm:pb-0"
      :class="{
        'h-[52dvh]': sheet === 'half',
        'h-[92dvh]': sheet === 'full',
        'sm:h-auto sm:max-h-[calc(100dvh-6rem)]': expanded,
      }"
      :style="dragOffset ? { transform: `translateY(${dragOffset}px)` } : null"
      aria-label="Nadelöhr"
    >
      <div
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

        <div class="px-4 pb-3">
          <SearchField
            :search="app.searchPlaces"
            @pick="app.flyToPlace"
            @focus="sheet === 'peek' && toggleSheet()"
          />
          <button
            v-if="!expanded && !card && !gauge"
            type="button"
            class="mt-2 w-full cursor-pointer truncate px-1 text-start text-callout text-muted-foreground"
            @click="toggleSheet"
          >
            {{ peekSummary }}
          </button>
        </div>
      </div>

      <div
        v-if="expanded"
        class="nd-scroll scroll-edge min-h-0 flex-1 px-4 pt-1 pb-4"
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
          @close="closeCard"
          @focus="app.showGaugeOnMap(app.selectedGauge.value, { close: true })"
          @share="app.share()"
        />
        <HomePanel v-else :app="app" />
      </div>
    </section>
  </div>
</template>
