<script setup>
// The panel's three views, as an Apple segmented control: Today (what is
// happening), Routes (check a trip) and Map (layers, rivers, weather).
import { t } from '../../i18n/index.js';

defineProps({
  modelValue: { type: String, default: 'today' },
});
defineEmits(['update:modelValue']);

const TABS = [
  { id: 'today', label: () => t('Today') },
  { id: 'routes', label: () => t('Routes') },
  { id: 'map', label: () => t('Map') },
];
</script>

<template>
  <div
    class="grid grid-cols-3 gap-0.5 rounded-[12px] bg-muted p-0.5"
    role="tablist"
    :aria-label="t('Views')"
  >
    <button
      v-for="tab in TABS"
      :id="`nd-tab-${tab.id}`"
      :key="tab.id"
      type="button"
      role="tab"
      class="cursor-pointer rounded-[10px] py-1.5 text-callout font-semibold outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring"
      :class="
        modelValue === tab.id
          ? 'bg-card text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground'
      "
      :aria-selected="String(modelValue === tab.id)"
      :aria-controls="`nd-panel-${tab.id}`"
      @click="$emit('update:modelValue', tab.id)"
    >
      {{ tab.label() }}
    </button>
  </div>
</template>
