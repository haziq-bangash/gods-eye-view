<script setup>
// The Today tab before the first data: the shapes of the headline and the
// corridor cards, so the panel does not jump when the numbers arrive.
import { t } from '../../i18n/index.js';
</script>

<template>
  <div class="flex flex-col gap-5" aria-busy="true">
    <span class="sr-only" role="status">{{ t('Loading live traffic…') }}</span>
    <div
      class="flex flex-col gap-2.5 rounded-[20px] border bg-card p-4"
      aria-hidden="true"
    >
      <span class="nd-skeleton h-3 w-32 rounded-full" />
      <span class="nd-skeleton h-5 w-4/5 rounded-[8px]" />
      <span class="nd-skeleton h-3 w-3/5 rounded-full" />
    </div>
    <div class="flex flex-col gap-2" aria-hidden="true">
      <span class="nd-skeleton mb-1 h-3 w-24 rounded-full" />
      <div
        v-for="index in 4"
        :key="index"
        class="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2 rounded-[18px] bg-card px-3.5 py-3"
      >
        <span class="nd-skeleton h-4 w-40 rounded-[6px]" />
        <span class="nd-skeleton row-span-2 h-8 w-10 rounded-[8px]" />
        <span class="flex gap-1">
          <span class="nd-skeleton h-4 w-8 rounded-[4px]" />
          <span class="nd-skeleton h-4 w-8 rounded-[4px]" />
        </span>
        <span class="nd-skeleton col-span-2 h-1.5 rounded-full" />
      </div>
    </div>
  </div>
</template>
