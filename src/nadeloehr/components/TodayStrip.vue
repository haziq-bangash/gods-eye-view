<script setup>
// "Today" in big numbers: closures, warnings, exits, Kaub and the rivers.
// Each card is a shortcut — tapping one filters the list or opens a gauge.
import { PhCaretDown } from '@phosphor-icons/vue';
import { t } from '../../i18n/index.js';
import { useCollapsed } from '../collapse.js';
import { HORIZONS, HORIZON_LABELS } from '../../freight/horizon.js';
import Sparkline from './Sparkline.vue';
import HorizonSwitch from './HorizonSwitch.vue';

// On phones the strip starts as one line of chips, so the map stays in
// view; a tap on the arrow opens the big numbers (and is remembered).
const phone = globalThis.matchMedia?.('(max-width: 639px)').matches === true;
const strip = useCollapsed('today', { byDefault: () => phone });

defineProps({
  kpis: { type: Array, required: true },
  active: { type: String, default: null },
  horizon: { type: String, default: 'now' },
  /** Before the first data: placeholders instead of zeros. */
  loading: { type: Boolean, default: false },
  /** When the traffic data was fetched, as a clock time. */
  updatedAt: { type: String, default: null },
});
defineEmits(['pick', 'update:horizon']);
</script>

<template>
  <section
    class="glass flex items-stretch gap-1 rounded-[24px] p-1.5 max-sm:flex-wrap"
    :aria-label="t('Today')"
  >
    <HorizonSwitch
      v-if="!strip.isCollapsed()"
      :model-value="horizon"
      @update:model-value="$emit('update:horizon', $event)"
    />
    <!-- Minimised: when, and how fresh the data is; the numbers are one
         tap away under the arrow, so nothing is cut off on a phone. -->
    <div
      v-if="strip.isCollapsed()"
      class="flex min-w-0 flex-1 items-center gap-1.5"
    >
      <div
        class="flex shrink-0 rounded-full bg-card p-0.5"
        role="radiogroup"
        :aria-label="t('When')"
      >
        <button
          v-for="option in HORIZONS"
          :key="option"
          type="button"
          role="radio"
          class="nd-tap cursor-pointer rounded-full px-2.5 py-1.5 text-caption font-semibold whitespace-nowrap outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
          :class="
            horizon === option
              ? 'bg-primary-fill text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          "
          :aria-checked="String(horizon === option)"
          @click="$emit('update:horizon', option)"
        >
          {{ t(HORIZON_LABELS[option]) }}
        </button>
      </div>
      <span
        v-if="loading"
        class="nd-skeleton h-7 w-20 shrink rounded-full"
        aria-hidden="true"
      />
      <span
        v-else-if="updatedAt"
        class="flex min-w-0 items-center gap-1.5 rounded-full bg-card px-2.5 py-1.5 text-caption font-semibold"
        :title="t('Traffic data from {time}', { time: updatedAt })"
      >
        <span
          class="size-2 shrink-0 rounded-full bg-[#34c759]"
          aria-hidden="true"
        />
        <span class="sr-only">{{
          t('Live · {time}', { time: updatedAt })
        }}</span>
        <span class="truncate tabular-nums" aria-hidden="true">{{
          updatedAt
        }}</span>
      </span>
    </div>
    <div v-else class="nd-strip flex min-w-0 flex-1 gap-1.5 overflow-x-auto">
      <template v-if="loading">
        <span
          v-for="index in 5"
          :key="index"
          class="flex min-w-[136px] flex-1 flex-col gap-2 rounded-[18px] bg-card px-3.5 py-3 max-lg:min-w-[124px]"
          aria-hidden="true"
        >
          <span class="nd-skeleton h-3 w-20 rounded-full" />
          <span class="nd-skeleton h-7 w-14 rounded-[8px]" />
          <span class="nd-skeleton h-3 w-24 rounded-full" />
        </span>
        <span class="sr-only" role="status">{{
          t('Loading live traffic…')
        }}</span>
      </template>
      <button
        v-for="kpi in loading ? [] : kpis"
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
