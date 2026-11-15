<script setup>
// A tiny trend line with a dot on the latest value.
import { computed } from 'vue';

const props = defineProps({
  values: { type: Array, default: () => [] },
  color: { type: String, default: 'currentColor' },
  width: { type: Number, default: 64 },
  height: { type: Number, default: 28 },
});

const points = computed(() => {
  const values = props.values.filter(Number.isFinite);
  if (values.length < 2) return [];
  const min = Math.min(...values);
  const span = Math.max(...values) - min || 1;
  return values.map((value, index) => [
    (index / (values.length - 1)) * props.width,
    props.height - ((value - min) / span) * (props.height - 6) - 3,
  ]);
});
const line = computed(() =>
  points.value.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' '),
);
</script>

<template>
  <svg
    v-if="points.length"
    :viewBox="`0 0 ${width} ${height}`"
    :width="width"
    :height="height"
    class="overflow-visible"
    aria-hidden="true"
  >
    <polyline
      :points="line"
      fill="none"
      :stroke="color"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
    <circle :cx="points.at(-1)[0]" :cy="points.at(-1)[1]" r="3" :fill="color" />
  </svg>
</template>
