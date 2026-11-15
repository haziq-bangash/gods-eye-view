<script setup>
// A gauge's last day as an area chart, with Kaub's reference levels.
import { computed } from 'vue';
import { t } from '../../i18n/index.js';
import { KAUB_LEVELS } from '../../layers/riverLevels/records.js';

const props = defineProps({
  /** [timeMs, levelCm] points, oldest first. */
  series: { type: Array, required: true },
  color: { type: String, default: '#007aff' },
  references: { type: Boolean, default: true },
});

const W = 288;
const H = 108;
const PAD = 16;
const model = computed(() => {
  const points = props.series.filter(
    ([time, value]) => Number.isFinite(time) && Number.isFinite(value),
  );
  if (points.length < 2) return null;
  const values = points.map(([, value]) => value);
  const refs = props.references
    ? [
        {
          value: KAUB_LEVELS.lowWater,
          label: t('Low water'),
          color: '#ff9500',
        },
        {
          value: KAUB_LEVELS.veryLowWater,
          label: t('Very low water'),
          color: '#ff3b30',
        },
      ]
    : [];
  const min = Math.min(...values, ...refs.map((r) => r.value)) - 6;
  const max = Math.max(...values, ...refs.map((r) => r.value)) + 6;
  const t0 = points[0][0];
  const t1 = points.at(-1)[0];
  const x = (time) => ((time - t0) / (t1 - t0 || 1)) * W;
  const y = (value) => H - PAD - ((value - min) / (max - min)) * (H - PAD * 2);
  const line = points
    .map(([time, value]) => `${x(time).toFixed(1)},${y(value).toFixed(1)}`)
    .join(' ');
  return {
    line,
    area: `0,${H} ${line} ${W},${H}`,
    refs: refs.map((r) => ({ ...r, y: y(r.value) })),
  };
});
</script>

<template>
  <svg
    v-if="model"
    :viewBox="`0 0 ${W} ${H}`"
    preserveAspectRatio="none"
    class="block h-[108px] w-full"
    role="img"
    :aria-label="t('Water level over the last 24 hours')"
  >
    <defs>
      <linearGradient id="nd-level-fill" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" :stop-color="color" stop-opacity="0.28" />
        <stop offset="1" :stop-color="color" stop-opacity="0" />
      </linearGradient>
    </defs>
    <g v-for="ref in model.refs" :key="ref.value">
      <line
        x1="0"
        :x2="W"
        :y1="ref.y"
        :y2="ref.y"
        :stroke="ref.color"
        stroke-dasharray="3 4"
        stroke-width="1"
        vector-effect="non-scaling-stroke"
      />
      <text
        :x="W"
        :y="ref.y - 4"
        text-anchor="end"
        class="fill-muted-foreground text-[14px] font-semibold"
      >
        {{ ref.label }} {{ ref.value }}
      </text>
    </g>
    <polygon :points="model.area" fill="url(#nd-level-fill)" />
    <polyline
      :points="model.line"
      fill="none"
      :stroke="color"
      stroke-width="2.2"
      stroke-linejoin="round"
      vector-effect="non-scaling-stroke"
    />
    <text :x="0" :y="H - 2" class="fill-muted-foreground text-[14px]">
      {{ t('24 h ago') }}
    </text>
    <text
      :x="W"
      :y="H - 2"
      text-anchor="end"
      class="fill-muted-foreground text-[14px]"
    >
      {{ t('now') }}
    </text>
  </svg>
</template>
