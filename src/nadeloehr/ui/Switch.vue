<script setup>
import { SwitchRoot, SwitchThumb } from 'reka-ui';
import { cn } from './utils.js';

const props = defineProps({
  class: { type: [String, Array, Object], default: '' },
  disabled: { type: Boolean, default: false },
});
const model = defineModel({ type: Boolean, default: false });
</script>

<template>
  <SwitchRoot
    v-model="model"
    data-slot="switch"
    :disabled="disabled"
    :class="
      cn(
        'peer inline-flex h-[26px] w-[44px] shrink-0 cursor-pointer items-center rounded-full p-[2px] transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input',
        props.class,
      )
    "
  >
    <SwitchThumb
      class="pointer-events-none block size-[22px] rounded-full bg-white shadow-md transition-transform data-[state=checked]:translate-x-[18px] data-[state=unchecked]:translate-x-0"
    />
  </SwitchRoot>
</template>
