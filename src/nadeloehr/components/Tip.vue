<script setup>
// A short label for an icon button, shown on hover or keyboard focus after
// a moment (replaces the browser's slow, unstyled `title`). The button
// keeps its own aria-label; the tip is visual help only. Rendered into
// #nd-float, outside the desktop's 80% zoom, so it lines up with its button.
import {
  TooltipArrow,
  TooltipContent,
  TooltipPortal,
  TooltipRoot,
  TooltipTrigger,
} from 'reka-ui';

defineProps({
  text: { type: String, default: '' },
  side: { type: String, default: 'top' },
});
</script>

<template>
  <slot v-if="!text" />
  <TooltipRoot v-else>
    <TooltipTrigger as-child>
      <slot />
    </TooltipTrigger>
    <TooltipPortal to="#nd-float">
      <TooltipContent
        :side="side"
        :side-offset="6"
        :collision-padding="8"
        class="nd-tip pointer-events-none z-[700] max-w-[240px] rounded-[8px] bg-foreground px-2 py-1 text-[12px] leading-snug font-semibold text-background shadow-[0_4px_14px_rgb(0_0_0/0.18)] select-none"
      >
        {{ text }}
        <TooltipArrow class="fill-foreground" :width="10" :height="5" />
      </TooltipContent>
    </TooltipPortal>
  </TooltipRoot>
</template>
