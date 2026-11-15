<script setup>
// A small ⓘ that opens one plain explanation in a floating card, so cards
// stay short and the layout never jumps. Tap or click to open; tap outside,
// press Esc or tap ⓘ again to close. Works the same with touch, mouse and
// keyboard. Rendered into #nd-float, outside the desktop's 80% zoom.
import { onBeforeUnmount, ref, watch } from 'vue';
import { PhInfo, PhX } from '@phosphor-icons/vue';
import {
  PopoverArrow,
  PopoverClose,
  PopoverContent,
  PopoverPortal,
  PopoverRoot,
  PopoverTrigger,
} from 'reka-ui';
import { t } from '../../i18n/index.js';

defineProps({
  /** What the tip explains, as a short title ("Water score"): the card's
   *  heading, and "About …" for the button's accessible name. */
  label: { type: String, required: true },
  text: { type: String, required: true },
});
const open = ref(false);
const trigger = ref(null);

// Escape closes the card wherever focus is, and hands focus back to the ⓘ.
// (Listened for here: the map's own shortcuts also watch Escape.)
function onKey(event) {
  if (event.key !== 'Escape' || !open.value) return;
  event.stopPropagation();
  open.value = false;
  trigger.value?.focus?.();
}
watch(open, (isOpen) => {
  if (isOpen) globalThis.addEventListener?.('keydown', onKey, true);
  else globalThis.removeEventListener?.('keydown', onKey, true);
});
onBeforeUnmount(() => globalThis.removeEventListener?.('keydown', onKey, true));
</script>

<template>
  <PopoverRoot v-model:open="open">
    <PopoverTrigger as-child>
      <button
        ref="trigger"
        type="button"
        class="inline-grid size-6 shrink-0 cursor-pointer place-items-center rounded-full align-middle text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring data-[state=open]:bg-accent data-[state=open]:text-foreground"
        :aria-label="t('About {name}', { name: label })"
        @click.stop
      >
        <PhInfo :weight="open ? 'fill' : 'regular'" class="size-4" />
      </button>
    </PopoverTrigger>
    <PopoverPortal to="#nd-float">
      <PopoverContent
        side="top"
        align="center"
        :side-offset="6"
        :collision-padding="10"
        class="nd-pop z-[700] w-[min(300px,calc(100vw-20px))] rounded-[16px] border border-[var(--glass-edge)] bg-popover p-3 pe-9 text-popover-foreground shadow-[0_12px_32px_rgb(0_0_0/0.18),0_2px_6px_rgb(0_0_0/0.08)] outline-none"
        role="note"
      >
        <p class="text-[13px] leading-tight font-bold">
          {{ label }}
        </p>
        <p class="mt-1 text-[13px] leading-snug text-muted-foreground">
          {{ text }}
        </p>
        <PopoverClose
          class="absolute top-2 right-2 grid size-6 cursor-pointer place-items-center rounded-full text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring"
          :aria-label="t('Close')"
        >
          <PhX weight="bold" class="size-3" />
        </PopoverClose>
        <PopoverArrow class="fill-[var(--popover)]" :width="14" :height="7" />
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>
