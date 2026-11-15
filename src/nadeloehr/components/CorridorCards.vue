<script setup>
// The watched freight corridors, riskiest first: score, level, what drives
// it. Tapping one draws it on the map and opens its breakdown.
import { t } from '../../i18n/index.js';
import RoadShield from './RoadShield.vue';
import SectionHeader from './SectionHeader.vue';
import { useCollapsed } from '../collapse.js';

const section = useCollapsed('corridors');

defineProps({
  corridors: { type: Array, required: true },
  selectedId: { type: String, default: null },
});
defineEmits(['select']);
</script>

<template>
  <section aria-labelledby="nd-corridors">
    <SectionHeader
      id="nd-corridors"
      :title="t('Corridors')"
      :collapsed="section.isCollapsed()"
      @toggle="section.toggle"
    />
    <div
      v-if="!section.isCollapsed()"
      id="nd-corridors-body"
      class="flex flex-col gap-2"
    >
      <button
        v-for="corridor in corridors"
        :key="corridor.id"
        type="button"
        class="press grid cursor-pointer grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 rounded-[18px] border bg-card px-3.5 py-3 text-start outline-none transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring"
        :class="
          selectedId === corridor.id
            ? 'border-[var(--risk)] shadow-[0_0_0_3px_color-mix(in_oklch,var(--risk)_18%,transparent)]'
            : 'border-transparent'
        "
        :style="{ '--risk': corridor.color }"
        :aria-pressed="String(selectedId === corridor.id)"
        @click="
          $emit('select', selectedId === corridor.id ? null : corridor.id)
        "
      >
        <span class="min-w-0">
          <span class="block truncate text-headline">{{ corridor.title }}</span>
          <span class="mt-1 flex flex-wrap items-center gap-1">
            <RoadShield
              v-for="road in corridor.roads"
              :key="road"
              :road="road"
            />
            <span
              v-if="corridor.river"
              class="rounded-[4px] bg-[#0062cc] px-1.5 text-caption leading-4 font-bold text-white"
              >{{ corridor.river }}</span
            >
          </span>
        </span>
        <span class="row-span-2 text-end">
          <span class="nd-figure block text-[30px] leading-none">{{
            corridor.score ?? '–'
          }}</span>
          <span
            class="nd-ink mt-1 inline-block rounded-full px-2 py-0.5 text-caption font-bold"
            :style="{
              '--ink': corridor.color,
              background: `color-mix(in oklch, ${corridor.color} 14%, transparent)`,
            }"
            >{{ corridor.levelLabel }}</span
          >
        </span>
        <span
          class="col-span-2 mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-muted"
          aria-hidden="true"
        >
          <span
            v-for="part in corridor.parts"
            :key="part.key"
            class="h-full"
            :style="{ width: `${part.share}%`, background: part.color }"
          />
        </span>
        <span class="col-span-2 truncate text-caption text-muted-foreground">{{
          corridor.driver
        }}</span>
      </button>
    </div>
  </section>
</template>
