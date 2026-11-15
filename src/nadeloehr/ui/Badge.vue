<script setup>
import { cva } from 'class-variance-authority';
import { cn } from './utils.js';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap',
  {
    variants: {
      variant: {
        default: 'bg-primary-fill text-primary-foreground',
        secondary: 'bg-secondary text-secondary-foreground',
        outline: 'border border-border text-foreground',
      },
    },
    defaultVariants: { variant: 'secondary' },
  },
);

const props = defineProps({
  variant: { type: String, default: 'secondary' },
  class: { type: [String, Array, Object], default: '' },
});
</script>

<template>
  <span data-slot="badge" :class="cn(badgeVariants({ variant }), props.class)"
    ><slot
  /></span>
</template>
