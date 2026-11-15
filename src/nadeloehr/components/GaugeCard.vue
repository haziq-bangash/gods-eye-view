<script setup>
// One selected river gauge, laid out like the disruption card: name and
// river, actions, a facts row, then what the level means for barges.
import {
  PhArrowRight,
  PhClock,
  PhMapPin,
  PhShareNetwork,
  PhTrendDown,
  PhTrendUp,
  PhWaves,
  PhX,
} from '@phosphor-icons/vue';
import { t } from '../../i18n/index.js';
import Button from '../ui/Button.vue';
import { SYSTEM_COLORS } from '../icons.js';
import IconBadge from './IconBadge.vue';
import LevelChart from './LevelChart.vue';

const FACT_ICONS = {
  level: { icon: PhWaves, color: SYSTEM_COLORS.blue },
  rising: { icon: PhTrendUp, color: SYSTEM_COLORS.green },
  falling: { icon: PhTrendDown, color: SYSTEM_COLORS.orange },
  steady: { icon: PhArrowRight, color: SYSTEM_COLORS.gray },
  measured: { icon: PhClock, color: SYSTEM_COLORS.purple },
};

defineProps({
  card: { type: Object, required: true },
  /** [timeMs, levelCm] for the last day, when the gauge has it (Kaub). */
  series: { type: Array, default: () => [] },
});
defineEmits(['close', 'focus', 'share']);
</script>

<template>
  <article class="flex flex-col gap-4" :aria-label="card.title">
    <header class="flex items-start gap-3">
      <IconBadge class="mt-1" :icon="PhWaves" :color="card.color" size="lg" />
      <div class="min-w-0 flex-1">
        <h2 class="text-title">{{ card.title }}</h2>
        <p class="mt-1 truncate text-body text-muted-foreground">
          {{ card.river }}<template v-if="card.km"> · {{ card.km }}</template>
        </p>
      </div>
      <Button
        variant="secondary"
        size="icon-sm"
        :aria-label="t('Close')"
        @click="$emit('close')"
        ><PhX weight="bold" class="size-4"
      /></Button>
    </header>

    <div class="grid grid-cols-2 gap-2">
      <Button size="lg" @click="$emit('focus')"
        ><PhMapPin weight="fill" class="size-4" />{{ t('Show on map') }}</Button
      >
      <Button variant="secondary" size="lg" @click="$emit('share')"
        ><PhShareNetwork weight="fill" class="size-4" />{{ t('Share') }}</Button
      >
    </div>

    <dl
      class="grid gap-2"
      :style="{
        gridTemplateColumns: `repeat(${card.facts.length}, minmax(0, 1fr))`,
      }"
    >
      <div
        v-for="fact in card.facts"
        :key="fact.key"
        class="flex flex-col items-center gap-1 rounded-group bg-muted px-2 py-2.5 text-center"
      >
        <IconBadge
          :icon="FACT_ICONS[fact.key].icon"
          :color="FACT_ICONS[fact.key].color"
          size="sm"
        />
        <dt class="text-caption font-medium text-muted-foreground">
          {{ fact.label }}
        </dt>
        <dd
          class="mt-0.5 text-headline"
          :class="fact.emphasis ? 'text-primary' : ''"
        >
          {{ fact.value }}
        </dd>
      </div>
    </dl>

    <LevelChart
      v-if="series.length > 1"
      :series="series"
      :references="card.isKaub"
    />

    <section class="rounded-group bg-card p-3">
      <p class="flex items-center gap-2 text-headline">
        <span
          class="size-2.5 shrink-0 rounded-full"
          :style="{ background: card.color }"
          aria-hidden="true"
        />
        {{ card.status }}
      </p>
      <p class="mt-1 text-body">{{ card.hint }}</p>
      <p v-if="card.outdated" class="mt-1 text-callout text-muted-foreground">
        {{ t('This gauge has not reported recently.') }}
      </p>
    </section>

    <p class="text-caption text-muted-foreground">
      {{
        card.isKaub
          ? t(
              'Source: PEGELONLINE (WSV). Kaub bands are reference values, not navigation advice.',
            )
          : t('Source: PEGELONLINE (WSV). Not navigation advice.')
      }}
    </p>
  </article>
</template>
