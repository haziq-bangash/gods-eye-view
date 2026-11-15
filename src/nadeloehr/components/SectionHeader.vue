<script setup>
// A section's small uppercase title that also minimises the section.
import { PhCaretDown } from '@phosphor-icons/vue';
import { t } from '../../i18n/index.js';

defineProps({
  title: { type: String, required: true },
  id: { type: String, required: true },
  collapsed: { type: Boolean, default: false },
});
defineEmits(['toggle']);
</script>

<template>
  <div class="nd-section-head mb-2 flex items-center gap-2 px-1">
    <button
      type="button"
      class="group nd-tap nd-no-hit flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 text-start outline-none focus-visible:underline"
      :aria-expanded="String(!collapsed)"
      :aria-controls="`${id}-body`"
      @click="$emit('toggle')"
    >
      <h2 :id="id" class="nd-eyebrow truncate">{{ title }}</h2>
      <PhCaretDown
        weight="bold"
        class="size-3 shrink-0 text-muted-foreground opacity-60 transition-transform group-hover:opacity-100"
        :class="collapsed ? '-rotate-90' : ''"
        aria-hidden="true"
      />
    </button>
    <slot name="actions" />
  </div>
</template>
