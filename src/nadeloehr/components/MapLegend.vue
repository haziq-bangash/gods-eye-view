<script setup>
// What the map's marks mean, in one line.
import { t } from '../../i18n/index.js';
import { SEVERITY_COLORS, severityCopy } from '../disruptions.js';
</script>

<template>
  <div
    class="glass flex items-center gap-3.5 rounded-2xl px-3.5 py-2 text-caption font-semibold text-muted-foreground"
    role="note"
    :aria-label="t('Map legend')"
  >
    <span
      v-for="severity in ['critical', 'major', 'minor']"
      :key="severity"
      class="flex items-center gap-1.5"
    >
      <span
        class="size-2.5 rounded-full border-2 border-white shadow-[0_0_0_1px_rgb(0_0_0/0.12)]"
        :style="{ background: SEVERITY_COLORS[severity] }"
      />
      {{ severityCopy(severity).label }}
    </span>
    <span class="flex items-center gap-1.5">
      <span
        class="size-3 rounded-[4px] border-2 border-white bg-[#007aff] shadow-[0_0_0_1px_rgb(0_0_0/0.12)]"
      />
      {{ t('River gauge') }}
    </span>
    <span class="flex items-center gap-1.5">
      <span
        class="grid size-3 place-items-center rounded-[3px] border border-white bg-[#007aff] text-[8px] leading-none font-extrabold text-white shadow-[0_0_0_1px_rgb(0_0_0/0.12)]"
        >P</span
      >
      {{ t('Truck parking') }}
    </span>
    <span class="flex items-center gap-1.5">
      <span
        class="size-3 rounded-[3px] border border-[#ff9500] bg-[linear-gradient(135deg,#ffcc00aa,#ff3b30aa)]"
      />
      {{ t('Weather warning') }}
    </span>
    <span class="flex items-center gap-1.5">
      <span class="h-1.5 w-4 rounded-full bg-[#ff9500]/40" />
      {{ t('Corridor') }}
    </span>
  </div>
</template>
