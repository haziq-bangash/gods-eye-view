<script setup>
import { Separator } from 'reka-ui';
import { cn } from './utils.js';

const props = defineProps({
  class: { type: [String, Array, Object], default: '' },
});
</script>

<template>
  <Separator
    data-slot="separator"
    :class="cn('h-px w-full shrink-0 bg-border', props.class)"
  />
</template>
