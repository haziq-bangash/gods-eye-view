<script setup>
// A colour icon on a Liquid Glass lens, like Apple Maps' category icons.
import { computed } from 'vue';

const props = defineProps({
  icon: { type: [Object, Function], default: null },
  color: { type: String, default: '#8e8e93' },
  size: { type: String, default: 'md' },
  shape: { type: String, default: 'circle' },
  text: { type: String, default: '' },
});

const SIZES = {
  xs: { box: 'size-5', glyph: 'size-3', text: 'text-[8px]' },
  sm: { box: 'size-7', glyph: 'size-4', text: 'text-[10px]' },
  md: { box: 'size-9', glyph: 'size-[18px]', text: 'text-caption' },
  lg: { box: 'size-11', glyph: 'size-[22px]', text: 'text-callout' },
};
const size = computed(() => SIZES[props.size] || SIZES.md);
</script>

<template>
  <span
    class="icon-glass grid shrink-0 place-items-center"
    :class="[size.box, shape === 'squircle' ? 'rounded-[30%]' : 'rounded-full']"
    :style="{ '--icon-color': color }"
    aria-hidden="true"
  >
    <component :is="icon" v-if="icon" :class="size.glyph" weight="fill" />
    <span
      v-else
      :class="[size.text, 'font-extrabold leading-none tracking-tight']"
      >{{ text }}</span
    >
  </span>
</template>
