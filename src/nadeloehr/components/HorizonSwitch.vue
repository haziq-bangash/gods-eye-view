<script setup>
// Now, tonight or tomorrow: what the numbers, map and corridors show.
import { t } from '../../i18n/index.js';
import { HORIZONS, HORIZON_LABELS } from '../../freight/horizon.js';

defineProps({
  modelValue: { type: String, default: 'now' },
});
defineEmits(['update:modelValue']);
</script>

<template>
  <div
    class="flex shrink-0 flex-col justify-center gap-0.5 rounded-[18px] bg-card p-1 max-sm:w-full max-sm:flex-row"
    role="radiogroup"
    :aria-label="t('When')"
  >
    <button
      v-for="horizon in HORIZONS"
      :key="horizon"
      type="button"
      role="radio"
      class="nd-no-hit cursor-pointer rounded-[14px] px-3 py-1 text-start text-caption font-semibold max-sm:min-h-11 max-sm:flex-1 max-sm:text-center whitespace-nowrap outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
      :class="
        modelValue === horizon
          ? 'bg-primary-fill text-primary-foreground shadow-sm'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground'
      "
      :aria-checked="String(modelValue === horizon)"
      @click="$emit('update:modelValue', horizon)"
    >
      {{ t(HORIZON_LABELS[horizon]) }}
    </button>
  </div>
</template>
