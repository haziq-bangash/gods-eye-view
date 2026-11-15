<script setup>
import { cn } from './utils.js';

const props = defineProps({
  class: { type: [String, Array, Object], default: '' },
});
const model = defineModel({ type: String, default: '' });
</script>

<template>
  <input
    v-model="model"
    data-slot="input"
    :class="
      cn(
        'h-10 w-full min-w-0 rounded-full border-0 bg-input px-4 text-[15px] outline-none placeholder:text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-ring',
        props.class,
      )
    "
  />
</template>
