<script setup>
// Apple Maps' search field: an Autobahn ("A7"), a gauge, a corridor or a
// place; pick a suggestion and the map follows.
import { computed, ref, watch, onBeforeUnmount } from 'vue';
import { PhMagnifyingGlass, PhPushPinSimple, PhX } from '@phosphor-icons/vue';
import { KIND_ICONS, TOOL_ICONS, layerIcon } from '../icons.js';
import { gaugeStatus, levelText } from '../rivers.js';
import { corridorTitle } from '../today.js';
import RoadShield from './RoadShield.vue';
import IconBadge from './IconBadge.vue';
import { t, tn } from '../../i18n/index.js';
import { placeId, usePins } from '../pins.js';

const props = defineProps({
  search: { type: Function, required: true },
  /** Results float under the field (the desktop bar) instead of in flow. */
  floating: { type: Boolean, default: false },
});
const emit = defineEmits(['pick', 'focus']);

// Pins: follow a road or place under "My roads and places".
const pins = usePins();
const pinnable = (result) => result.type === 'road' || result.type === 'place';
const pinned = (result) =>
  result.type === 'road'
    ? pins.isRoadPinned(result.road)
    : result.type === 'place'
      ? pins.isPlacePinned(result.place)
      : false;
function togglePin(result) {
  if (result.type === 'road')
    pinned(result) ? pins.unpinRoad(result.road) : pins.pinRoad(result.road);
  else if (result.type === 'place') {
    if (pinned(result)) pins.unpinPlace(placeId(result.place));
    else pins.pinPlace(result.place);
  }
}

// The field's prompt, also its accessible name.
const prompt = computed(() => t('Search a city, an Autobahn (A7) or a river'));
const query = ref('');
const results = ref([]);
const searching = ref(false);
let timer = null;
let controller = null;

function reset() {
  clearTimeout(timer);
  controller?.abort();
  results.value = [];
  searching.value = false;
}

watch(query, (text) => {
  reset();
  if (text.trim().length < 2) return;
  searching.value = true;
  timer = setTimeout(async () => {
    controller = new AbortController();
    const found = await props.search(text, { signal: controller.signal });
    if (query.value === text) {
      results.value = found;
      searching.value = false;
    }
  }, 280);
});
onBeforeUnmount(reset);

function label(result) {
  if (result.type === 'road')
    return t('Autobahn {road}', { road: result.road });
  if (result.type === 'gauge') return result.gauge.name;
  if (result.type === 'corridor') return corridorTitle(result.corridor);
  const place = result.place || result;
  return place?.name || place?.label || t('Unnamed place');
}
function sublabel(result) {
  if (result.type === 'road')
    return result.count
      ? tn(
          result.count,
          '{count} disruption — show it',
          '{count} disruptions — show them',
        )
      : t('No disruptions reported');
  if (result.type === 'gauge')
    return `${levelText(result.gauge.levelCm)} · ${gaugeStatus(result.gauge).label}`;
  if (result.type === 'corridor') return t('Freight corridor');
  const place = result.place || result;
  const text = place?.label || '';
  return text && text !== label(result) ? text : '';
}
function badge(result) {
  if (result.type === 'gauge') return layerIcon('river-levels');
  if (result.type === 'corridor') return KIND_ICONS.warning;
  return TOOL_ICONS.place;
}

function pick(place) {
  emit('pick', place);
  query.value = '';
  reset();
}

function submit() {
  if (results.value[0]) pick(results.value[0]);
  else if (query.value.trim()) pick({ label: query.value.trim() });
}
</script>

<template>
  <div class="relative flex flex-col gap-2">
    <form
      role="search"
      class="flex h-11 items-center gap-2 rounded-full bg-input px-3.5 transition-shadow focus-within:ring-[3px] focus-within:ring-ring"
      @submit.prevent="submit"
    >
      <PhMagnifyingGlass
        weight="bold"
        class="size-[18px] shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
      <input
        v-model="query"
        type="search"
        enterkeyhint="search"
        autocomplete="off"
        class="h-full min-w-0 flex-1 bg-transparent text-body outline-none placeholder:text-muted-foreground"
        :placeholder="prompt"
        :aria-label="prompt"
        @focus="$emit('focus')"
      />
      <button
        v-if="query"
        type="button"
        class="grid size-6 cursor-pointer place-items-center rounded-full bg-muted-foreground/30 text-background"
        :aria-label="t('Clear search')"
        @click="query = ''"
      >
        <PhX weight="bold" class="size-3.5" />
      </button>
    </form>

    <p
      v-if="searching"
      class="px-2 text-subhead text-muted-foreground"
      :class="
        floating
          ? 'glass absolute inset-x-0 top-12 z-10 rounded-group py-2'
          : ''
      "
    >
      {{ t('Searching…') }}
    </p>
    <ul
      v-else-if="results.length"
      class="overflow-hidden rounded-group"
      :class="
        floating
          ? 'glass-strong absolute inset-x-0 top-12 z-10 max-h-[60dvh] overflow-y-auto'
          : 'bg-card'
      "
      :aria-label="t('Search results')"
    >
      <li
        v-for="result in results"
        :key="result.id || label(result)"
        class="flex items-center pe-1.5"
      >
        <button
          type="button"
          class="flex min-w-0 flex-1 cursor-pointer items-center gap-3 px-3 py-2.5 text-start hover:bg-accent focus-visible:bg-accent outline-none"
          @click="pick(result)"
        >
          <span
            v-if="result.type === 'road'"
            class="grid size-7 shrink-0 place-items-center"
            ><RoadShield :road="result.road"
          /></span>
          <IconBadge
            v-else
            :icon="badge(result).icon"
            :color="badge(result).color"
            size="sm"
          />
          <span class="min-w-0">
            <span class="block truncate text-headline">{{
              label(result)
            }}</span>
            <span
              v-if="sublabel(result)"
              class="block truncate text-subhead text-muted-foreground"
              >{{ sublabel(result) }}</span
            >
          </span>
        </button>
        <!-- Follow this road or place under "My roads and places". -->
        <button
          v-if="pinnable(result)"
          type="button"
          class="grid size-8 shrink-0 cursor-pointer place-items-center rounded-full outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring"
          :class="pinned(result) ? 'text-primary-ink' : 'text-muted-foreground'"
          :aria-label="
            pinned(result)
              ? t('Unpin {name}', { name: label(result) })
              : t('Pin {name}', { name: label(result) })
          "
          :aria-pressed="String(pinned(result))"
          @click="togglePin(result)"
        >
          <PhPushPinSimple
            :weight="pinned(result) ? 'fill' : 'bold'"
            class="size-4"
          />
        </button>
      </li>
    </ul>
  </div>
</template>
