<script setup>
// Kaub at a glance for the desktop's right card: level, band, the last day
// against the low-water lines, and what it means for barges.
import { computed } from 'vue';
import { formatNumber, t } from '../../i18n/index.js';
import {
  kaubHydrologyScore,
  levelDuring,
} from '../../layers/riverLevels/records.js';
import { gaugeCard } from '../rivers.js';
import LevelChart from './LevelChart.vue';

const props = defineProps({
  gauge: { type: Object, required: true },
  /** 'now', 'tonight' or 'tomorrow', and its [from, to] range. */
  horizon: { type: String, default: 'now' },
  range: { type: Array, default: null },
});
defineEmits(['open']);

const later = computed(() => props.horizon !== 'now' && props.range);
/** The level shown: now the reading, later the lowest forecast value. */
const level = computed(() =>
  later.value ? levelDuring(props.gauge, props.range) : props.gauge.levelCm,
);
// The card describes the shown level (its band, colour and hint).
const card = computed(() =>
  gaugeCard({
    ...props.gauge,
    levelCm: Number.isFinite(level.value) ? level.value : props.gauge.levelCm,
  }),
);
/** Later: the forecast from now to the end of the range. */
const chartSeries = computed(() =>
  later.value
    ? (props.gauge.forecast || [])
        .filter(([at]) => at <= props.range[1])
        .map(([at, value]) => [at, value])
    : props.gauge.series || [],
);
const facts = computed(() =>
  later.value
    ? [
        {
          key: 'now',
          label: t('Now'),
          value: t('{level} cm', { level: formatNumber(props.gauge.levelCm) }),
        },
        {
          key: 'score',
          label: t('Water score'),
          value: formatNumber(kaubHydrologyScore(level.value) ?? 0),
        },
      ]
    : [
        ...card.value.facts.filter((fact) => fact.key !== 'level'),
        {
          key: 'score',
          label: t('Water score'),
          value: formatNumber(kaubHydrologyScore(props.gauge.levelCm) ?? 0),
        },
      ],
);
</script>

<template>
  <article class="flex flex-col" :aria-label="card.title">
    <p class="nd-eyebrow">
      {{
        later
          ? horizon === 'tonight'
            ? t('Forecast low tonight')
            : t('Forecast low tomorrow')
          : t('Middle Rhine bottleneck')
      }}
    </p>
    <h2 class="mt-1 text-title">{{ card.title }}</h2>
    <p class="text-subhead text-muted-foreground">
      {{ card.river }} · {{ card.km }}
    </p>
    <div class="mt-3 flex items-baseline gap-2">
      <span class="nd-figure text-[56px] leading-[0.9]">{{
        Number.isFinite(level) ? formatNumber(level) : '–'
      }}</span>
      <span class="text-title2 text-muted-foreground">{{ t('cm') }}</span>
    </div>
    <span
      class="nd-ink mt-2 self-start rounded-full px-2.5 py-1 text-subhead font-bold"
      :style="{
        '--ink': card.color,
        background: `color-mix(in oklch, ${card.color} 14%, transparent)`,
      }"
      >● {{ card.status }}</span
    >
    <LevelChart
      v-if="chartSeries.length > 1"
      class="mt-3"
      :series="chartSeries"
      :start-label="later ? t('now') : t('24 h ago')"
      :end-label="
        later ? (horizon === 'tonight' ? t('morning') : t('evening')) : t('now')
      "
    />
    <dl class="mt-2 grid grid-cols-3 gap-1.5">
      <div
        v-for="fact in facts"
        :key="fact.key"
        class="rounded-[14px] bg-muted px-2.5 py-2"
      >
        <dt
          class="text-caption leading-tight font-semibold text-muted-foreground"
        >
          {{ fact.label }}
        </dt>
        <dd class="text-headline tabular-nums">{{ fact.value }}</dd>
      </div>
    </dl>
    <p class="mt-3 text-callout">{{ card.hint }}</p>
    <button
      type="button"
      class="mt-2 self-start cursor-pointer text-callout font-semibold text-primary-ink hover:underline"
      @click="$emit('open', gauge)"
    >
      {{ t('Show on map') }}
    </button>
  </article>
</template>
