<script setup>
// A place field with suggestions while typing: German cities at once, the
// place search's answers when they arrive. Arrow keys move, Enter picks,
// Escape closes. Picking keeps the place itself, so a route goes exactly
// where the reader chose rather than wherever the name first geocodes.
import { computed, onBeforeUnmount, ref, useId, watch } from 'vue';
import { PhMapPin } from '@phosphor-icons/vue';
import { t } from '../../i18n/index.js';
import { moveActive } from '../suggest.js';
import { SYSTEM_COLORS } from '../icons.js';
import IconBadge from './IconBadge.vue';

const props = defineProps({
  modelValue: { type: String, default: '' },
  placeholder: { type: String, default: '' },
  label: { type: String, required: true },
  /** (text) => results shown at once. */
  instant: { type: Function, required: true },
  /** (text, { signal }) => Promise of all results. */
  search: { type: Function, required: true },
});
const emit = defineEmits(['update:modelValue', 'pick']);

// Prefixed: the upstream globe UI is a second Vue app with the same ids.
const id = `nd-${useId()}`;
const listId = `${id}-list`;
const results = ref([]);
const active = ref(-1);
const open = ref(false);
let timer = null;
let controller = null;
// The text a pick wrote: typing over it starts a new search.
let picked = null;

const text = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
});

function stop() {
  clearTimeout(timer);
  controller?.abort();
}
watch(
  () => props.modelValue,
  (value) => {
    if (value === picked) return;
    picked = null;
    stop();
    active.value = -1;
    const query = value.trim();
    if (!query) {
      results.value = [];
      return;
    }
    results.value = props.instant(query);
    if (query.length < 2) return;
    timer = setTimeout(async () => {
      controller = new AbortController();
      const found = await props.search(query, { signal: controller.signal });
      if (props.modelValue.trim() === query) results.value = found;
    }, 250);
  },
);
onBeforeUnmount(stop);

const expanded = computed(() => open.value && results.value.length > 0);

function pick(result) {
  const place = result?.place;
  if (!place) return;
  picked = place.name;
  emit('update:modelValue', place.name);
  emit('pick', place);
  stop();
  open.value = false;
  active.value = -1;
}
function onKeydown(event) {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    if (!results.value.length) return;
    event.preventDefault();
    open.value = true;
    active.value = moveActive(
      active.value,
      results.value.length,
      event.key === 'ArrowDown' ? 1 : -1,
    );
  } else if (event.key === 'Enter' && expanded.value && active.value >= 0) {
    // Enter on a highlighted suggestion picks it instead of submitting.
    event.preventDefault();
    pick(results.value[active.value]);
  } else if (event.key === 'Escape' && expanded.value) {
    event.preventDefault();
    open.value = false;
  }
}
// A click on a suggestion lands after the field's blur; wait for it.
function onBlur() {
  setTimeout(() => (open.value = false), 150);
}
function sublabel(place) {
  return place.label && place.label !== place.name ? place.label : '';
}
</script>

<template>
  <div class="relative">
    <input
      v-model="text"
      type="text"
      autocomplete="off"
      role="combobox"
      aria-autocomplete="list"
      :aria-expanded="String(expanded)"
      :aria-controls="listId"
      :aria-activedescendant="
        expanded && active >= 0 ? `${id}-${active}` : undefined
      "
      class="h-9 w-full rounded-[12px] bg-input px-3 text-callout outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
      :placeholder="placeholder"
      :aria-label="label"
      @focus="open = true"
      @input="open = true"
      @blur="onBlur"
      @keydown="onKeydown"
    />
    <ul
      v-show="expanded"
      :id="listId"
      role="listbox"
      :aria-label="t('Suggestions for {field}', { field: label })"
      class="glass-strong absolute inset-x-0 top-10 z-20 max-h-72 overflow-y-auto rounded-group py-1"
    >
      <li
        v-for="(result, index) in results"
        :id="`${id}-${index}`"
        :key="result.id || index"
        role="option"
        :aria-selected="String(index === active)"
        class="flex cursor-pointer items-center gap-3 px-3 py-2"
        :class="index === active ? 'bg-accent' : 'hover:bg-accent'"
        @mousedown.prevent
        @click="pick(result)"
      >
        <IconBadge :icon="PhMapPin" :color="SYSTEM_COLORS.red" size="sm" />
        <span class="min-w-0">
          <span class="block truncate text-headline">{{
            result.place.name
          }}</span>
          <span
            v-if="sublabel(result.place)"
            class="block truncate text-subhead text-muted-foreground"
            >{{ sublabel(result.place) }}</span
          >
        </span>
      </li>
    </ul>
  </div>
</template>
