<script setup>
// Apple Maps' map-style card: a few big, labelled choices instead of a list
// of imagery providers.
import { PhCheck, PhX } from '@phosphor-icons/vue';
import { t } from '../../i18n/index.js';
import Button from '../ui/Button.vue';

defineProps({
  styles: { type: Array, required: true },
  selected: { type: String, default: '' },
});
defineEmits(['select', 'close']);
</script>

<template>
  <section
    class="glass-strong w-full max-w-[320px] rounded-[26px] p-4"
    :aria-label="t('Map style')"
  >
    <header class="mb-3 flex items-center justify-between">
      <h2 class="text-headline">{{ t('Map style') }}</h2>
      <Button
        variant="secondary"
        size="icon-sm"
        :aria-label="t('Close')"
        @click="$emit('close')"
        ><PhX weight="bold" class="size-4"
      /></Button>
    </header>
    <div
      class="grid grid-cols-3 gap-2"
      role="radiogroup"
      :aria-label="t('Map style')"
    >
      <button
        v-for="style in styles"
        :key="style.id"
        type="button"
        role="radio"
        :aria-checked="String(style.id === selected)"
        class="group flex cursor-pointer flex-col items-center gap-1.5 rounded-2xl p-1 outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
        @click="$emit('select', style.id)"
      >
        <span
          class="relative block aspect-square w-full overflow-hidden rounded-[10px] ring-2 ring-transparent transition"
          :class="
            style.id === selected ? 'ring-primary' : 'group-hover:ring-border'
          "
          :style="{ background: style.preview }"
        >
          <span
            v-if="style.id === selected"
            class="absolute top-1 right-1 grid size-5 place-items-center rounded-full bg-primary-fill text-primary-foreground"
            ><PhCheck weight="bold" class="size-3.5"
          /></span>
        </span>
        <span class="text-subhead font-semibold">{{ style.label }}</span>
      </button>
    </div>
  </section>
</template>
