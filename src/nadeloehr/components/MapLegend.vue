<script setup>
// What the map's marks mean — and a switch for each: tap an item to show
// or hide it. Critical and major events are always shown.
import { computed } from 'vue';
import { t } from '../../i18n/index.js';
import { SEVERITY_COLORS, severityCopy } from '../disruptions.js';

const props = defineProps({
  app: { type: Object, required: true },
});

const layerOn = (id) => props.app.layerById(id)?.enabled === true;
const items = computed(() => [
  {
    id: 'minor',
    label: severityCopy('minor').label,
    swatch: 'dot',
    color: SEVERITY_COLORS.minor,
    on: props.app.minorOnMap.value,
    toggle: () => props.app.setMinorOnMap(!props.app.minorOnMap.value),
  },
  {
    id: 'river-levels',
    label: t('River gauge'),
    swatch: 'gauge',
    on: layerOn('river-levels'),
    toggle: () => props.app.setLayer('river-levels', !layerOn('river-levels')),
  },
  {
    id: 'truck-parking',
    label: t('Truck parking'),
    swatch: 'parking',
    on: layerOn('truck-parking'),
    toggle: () =>
      props.app.setLayer('truck-parking', !layerOn('truck-parking')),
  },
  {
    id: 'weather-warnings',
    label: t('Weather warning'),
    swatch: 'weather',
    on: layerOn('weather-warnings'),
    toggle: () =>
      props.app.setLayer('weather-warnings', !layerOn('weather-warnings')),
  },
  {
    id: 'corridors',
    label: t('Corridor'),
    swatch: 'corridor',
    on: props.app.corridorsOnMap.value,
    toggle: () => props.app.setCorridorsOnMap(!props.app.corridorsOnMap.value),
  },
]);
</script>

<template>
  <div
    class="glass flex items-center gap-1 rounded-2xl px-2 py-1 text-caption font-semibold text-muted-foreground"
    role="group"
    :aria-label="t('Map legend')"
  >
    <span
      v-for="severity in ['critical', 'major']"
      :key="severity"
      class="flex items-center gap-1.5 px-1.5 py-1"
    >
      <span
        class="size-2.5 rounded-full border-2 border-white shadow-[0_0_0_1px_rgb(0_0_0/0.12)]"
        :style="{ background: SEVERITY_COLORS[severity] }"
      />
      {{ severityCopy(severity).label }}
    </span>
    <button
      v-for="item in items"
      :key="item.id"
      type="button"
      class="flex cursor-pointer items-center gap-1.5 rounded-full px-2 py-1 outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring"
      :class="item.on ? '' : 'opacity-45 line-through decoration-1'"
      :aria-pressed="String(item.on)"
      :title="
        item.on
          ? t('Hide {name}', { name: item.label })
          : t('Show {name}', { name: item.label })
      "
      @click="item.toggle()"
    >
      <span
        v-if="item.swatch === 'dot'"
        class="size-2.5 rounded-full border-2 border-white shadow-[0_0_0_1px_rgb(0_0_0/0.12)]"
        :style="{ background: item.color }"
      />
      <span
        v-else-if="item.swatch === 'gauge'"
        class="size-3 rounded-[4px] border-2 border-white bg-[#0062cc] shadow-[0_0_0_1px_rgb(0_0_0/0.12)]"
      />
      <span
        v-else-if="item.swatch === 'parking'"
        class="grid size-3.5 place-items-center rounded-[3px] border border-white bg-[#0062cc] text-[10px] leading-none font-extrabold text-white shadow-[0_0_0_1px_rgb(0_0_0/0.12)]"
        aria-hidden="true"
        >P</span
      >
      <span
        v-else-if="item.swatch === 'weather'"
        class="size-3 rounded-[3px] border border-[#ff9500] bg-[linear-gradient(135deg,#ffcc00aa,#ff3b30aa)]"
      />
      <span v-else class="h-1.5 w-4 rounded-full bg-[#ff9500]/40" />
      {{ item.label }}
    </button>
  </div>
</template>
