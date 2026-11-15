<script setup>
// A small ⓘ that reveals one plain sentence under its label, so cards stay
// short but every number can explain itself.
import { ref } from 'vue';
import { PhInfo } from '@phosphor-icons/vue';
import { t } from '../../i18n/index.js';

defineProps({
  /** What the tip explains, for its accessible name. */
  label: { type: String, required: true },
  text: { type: String, required: true },
});
const open = ref(false);
let uid = 0;
const id = `nd-tip-${Math.random().toString(36).slice(2, 8)}-${uid++}`;
</script>

<template>
  <span class="contents">
    <button
      type="button"
      class="inline-grid size-6 shrink-0 cursor-pointer place-items-center rounded-full align-middle text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring"
      :aria-label="t('What is {name}?', { name: label })"
      :aria-expanded="String(open)"
      :aria-controls="id"
      @click.stop="open = !open"
    >
      <PhInfo :weight="open ? 'fill' : 'regular'" class="size-4" />
    </button>
    <span
      v-if="open"
      :id="id"
      class="col-span-full block basis-full rounded-[10px] bg-muted px-2.5 py-1.5 text-caption leading-snug text-foreground"
      role="note"
      >{{ text }}</span
    >
  </span>
</template>
