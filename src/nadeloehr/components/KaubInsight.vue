<script setup>
// Kaub at a glance for the desktop's right card: level, band, the last day
// against the low-water lines, and what it means for barges.
import { computed } from 'vue';
import { formatNumber, t } from '../../i18n/index.js';
import { kaubHydrologyScore } from '../../layers/riverLevels/records.js';
import { gaugeCard } from '../rivers.js';
import LevelChart from './LevelChart.vue';

const props = defineProps({
  gauge: { type: Object, required: true },
});
defineEmits(['open']);

const card = computed(() => gaugeCard(props.gauge));
const facts = computed(() => [
  ...card.value.facts.filter((fact) => fact.key !== 'level'),
  {
    key: 'score',
    label: t('Water score'),
    value: formatNumber(kaubHydrologyScore(props.gauge.levelCm) ?? 0),
  },
]);
</script>

<template>
  <article class="flex flex-col" :aria-label="card.title">
    <p class="nd-eyebrow">{{ t('Middle Rhine bottleneck') }}</p>
    <h2 class="mt-1 text-title">{{ card.title }}</h2>
    <p class="text-subhead text-muted-foreground">
      {{ card.river }} · {{ card.km }}
    </p>
    <div class="mt-3 flex items-baseline gap-2">
      <span class="nd-figure text-[56px] leading-[0.9]">{{
        formatNumber(gauge.levelCm)
      }}</span>
      <span class="text-title2 text-muted-foreground">{{ t('cm') }}</span>
    </div>
    <span
      class="mt-2 self-start rounded-full px-2.5 py-1 text-subhead font-bold"
      :style="{
        color: card.color,
        background: `color-mix(in oklch, ${card.color} 14%, transparent)`,
      }"
      >● {{ card.status }}</span
    >
    <LevelChart
      v-if="gauge.series?.length > 1"
      class="mt-3"
      :series="gauge.series"
    />
    <dl class="mt-2 grid grid-cols-3 gap-1.5">
      <div
        v-for="fact in facts"
        :key="fact.key"
        class="rounded-[14px] bg-muted px-2.5 py-2"
      >
        <dt class="truncate text-[11px] font-semibold text-muted-foreground">
          {{ fact.label }}
        </dt>
        <dd class="text-headline tabular-nums">{{ fact.value }}</dd>
      </div>
    </dl>
    <p class="mt-3 text-callout">{{ card.hint }}</p>
    <button
      type="button"
      class="mt-2 self-start cursor-pointer text-callout font-semibold text-primary hover:underline"
      @click="$emit('open', gauge)"
    >
      {{ t('Show on map') }}
    </button>
  </article>
</template>
