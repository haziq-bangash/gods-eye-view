<script setup>
// "Today" in big numbers: closures, warnings, exits, Kaub and the rivers.
// Each card is a shortcut — tapping one filters the list or opens a gauge.
import { PhCaretDown } from '@phosphor-icons/vue';
import { t } from '../../i18n/index.js';
import { useCollapsed } from '../collapse.js';
import Sparkline from './Sparkline.vue';

const strip = useCollapsed('today');

defineProps({
  kpis: { type: Array, required: true },
  active: { type: String, default: null },
});
defineEmits(['pick']);
</script>

<template>
  <section
    class="glass flex items-stretch gap-1 rounded-[24px] p-1.5"
    :aria-label="t('Today')"
  >
    <!-- Minimised: one line of small chips -->
    <div
      v-if="strip.isCollapsed()"
      class="nd-strip flex min-w-0 flex-1 items-center gap-1 overflow-x-auto"
    >
      <button
        v-for="kpi in kpis"
        :key="kpi.id"
        type="button"
        class="press flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full bg-card px-3 py-1.5 text-caption font-semibold outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring"
        :class="active === kpi.id ? 'ring-2 ring-[var(--kpi)]' : ''"
        :style="{ '--kpi': kpi.color }"
        @click="$emit('pick', kpi)"
      >
        <span class="size-2 rounded-full" :style="{ background: kpi.color }" />
        <span class="tabular-nums"
          >{{ kpi.value }}{{ kpi.unit ? ` ${kpi.unit}` : '' }}</span
        >
        <span class="text-muted-foreground">{{ kpi.label }}</span>
      </button>
    </div>
    <div v-else class="nd-strip flex min-w-0 flex-1 gap-1.5 overflow-x-auto">
      <button
        v-for="kpi in kpis"
        :key="kpi.id"
        type="button"
        class="press grid min-w-[136px] flex-1 cursor-pointer grid-cols-[1fr_auto] items-end gap-x-2 rounded-[18px] bg-card px-3.5 py-3 text-start outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring max-lg:min-w-[124px] max-lg:px-3 max-lg:py-2.5"
        :class="active === kpi.id ? 'ring-2 ring-[var(--kpi)]' : ''"
        :style="{ '--kpi': kpi.color }"
        :aria-pressed="String(active === kpi.id)"
        @click="$emit('pick', kpi)"
      >
        <span
          class="col-span-2 flex items-center gap-1.5 truncate text-caption font-semibold text-muted-foreground"
        >
          <span
            class="size-2 shrink-0 rounded-full"
            :style="{ background: kpi.color }"
          />
          {{ kpi.label }}
        </span>
        <span class="nd-figure mt-1 text-[34px] leading-none max-lg:text-[26px]"
          >{{ kpi.value
          }}<small
            v-if="kpi.unit"
            class="ms-1 text-subhead font-medium tracking-normal text-muted-foreground"
            >{{ kpi.unit }}</small
          ></span
        >
        <Sparkline
          v-if="kpi.series?.length > 1"
          :values="kpi.series"
          :color="kpi.color"
          class="max-lg:hidden"
        />
        <span v-else />
        <span
          class="col-span-2 mt-1 truncate text-caption text-muted-foreground"
          >{{ kpi.note }}</span
        >
      </button>
    </div>
    <button
      type="button"
      class="grid w-7 shrink-0 cursor-pointer place-items-center rounded-full text-muted-foreground outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring"
      :aria-label="strip.isCollapsed() ? t('Expand') : t('Collapse')"
      :aria-expanded="String(!strip.isCollapsed())"
      @click="strip.toggle"
    >
      <PhCaretDown
        weight="bold"
        class="size-3.5 transition-transform"
        :class="strip.isCollapsed() ? '' : 'rotate-180'"
      />
    </button>
  </section>
</template>
