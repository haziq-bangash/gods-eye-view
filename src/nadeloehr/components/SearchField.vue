<script setup>
// Apple Maps' search field: type a place, pick a suggestion, the map flies.
import { computed, ref, watch, onBeforeUnmount } from 'vue';
import { PhMagnifyingGlass, PhX } from '@phosphor-icons/vue';
import { TOOL_ICONS } from '../icons.js';
import IconBadge from './IconBadge.vue';
import { t } from '../../i18n/index.js';

const props = defineProps({
  search: { type: Function, required: true },
});
const emit = defineEmits(['pick', 'focus']);

// The field's prompt, also its accessible name.
const prompt = computed(() => t('Search a place or motorway'));
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

const label = (place) =>
  place?.name || place?.label || place?.displayName || t('Unnamed place');
const sublabel = (place) => {
  const text = place?.label || place?.address || '';
  return text && text !== label(place) ? text : '';
};

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
  <div class="flex flex-col gap-2">
    <form
      role="search"
      class="flex h-11 items-center gap-2 rounded-full bg-input px-3.5"
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

    <p v-if="searching" class="px-2 text-subhead text-muted-foreground">
      {{ t('Searching…') }}
    </p>
    <ul
      v-else-if="results.length"
      class="overflow-hidden rounded-group bg-card"
      :aria-label="t('Search results')"
    >
      <li v-for="(place, index) in results" :key="index">
        <button
          type="button"
          class="flex w-full cursor-pointer items-center gap-3 px-3 py-2.5 text-start hover:bg-accent focus-visible:bg-accent outline-none"
          @click="pick(place)"
        >
          <IconBadge
            :icon="TOOL_ICONS.place.icon"
            :color="TOOL_ICONS.place.color"
            size="sm"
          />
          <span class="min-w-0">
            <span class="block truncate text-headline">{{ label(place) }}</span>
            <span
              v-if="sublabel(place)"
              class="block truncate text-subhead text-muted-foreground"
              >{{ sublabel(place) }}</span
            >
          </span>
        </button>
      </li>
    </ul>
  </div>
</template>
