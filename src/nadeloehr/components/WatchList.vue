<script setup>
// The few things to keep an eye on, as tappable rows with a figure on the
// right: shown in the sheet's peek on phones, under the day's headline.
import { PhCaretRight } from '@phosphor-icons/vue';
import IconBadge from './IconBadge.vue';

defineProps({
  /**
   * @type {Array<{id: string, icon: object, color: string, title: string,
   *   sub: string, value: string, valueSub?: string, valueColor?: string}>}
   */
  rows: { type: Array, required: true },
});
defineEmits(['pick']);
</script>

<template>
  <ul class="flex flex-col gap-1.5">
    <li v-for="row in rows" :key="row.id">
      <button
        type="button"
        class="nd-tap flex w-full cursor-pointer items-center gap-3 rounded-group bg-muted px-3 py-2 text-start outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring"
        @click="$emit('pick', row)"
      >
        <IconBadge :icon="row.icon" :color="row.color" />
        <span class="min-w-0 flex-1">
          <span class="block truncate text-headline">{{ row.title }}</span>
          <span class="block truncate text-caption text-muted-foreground">{{
            row.sub
          }}</span>
        </span>
        <span class="shrink-0 text-end">
          <span class="block text-headline tabular-nums">{{ row.value }}</span>
          <span
            v-if="row.valueSub"
            class="block text-caption font-semibold"
            :style="{ color: row.valueColor }"
            >{{ row.valueSub }}</span
          >
        </span>
        <PhCaretRight class="size-3.5 shrink-0 text-muted-foreground" />
      </button>
    </li>
  </ul>
</template>
