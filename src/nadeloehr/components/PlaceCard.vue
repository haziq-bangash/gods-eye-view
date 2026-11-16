<script setup>
// One selected disruption, laid out like an Apple Maps place card: title and
// place, an action row, when it applies, what it means for the corridors and
// where to park, then the plain explanation and the official notice.
import { computed } from 'vue';
import {
  PhBellRinging,
  PhBellSimple,
  PhCaretRight,
  PhClock,
  PhGauge,
  PhMapPin,
  PhRuler,
  PhShareNetwork,
  PhTimer,
  PhTruck,
  PhX,
} from '@phosphor-icons/vue';
import { formatDate, formatNumber, t, tn } from '../../i18n/index.js';
import { berlinParts } from '../../freight/horizon.js';
import Button from '../ui/Button.vue';
import Separator from '../ui/Separator.vue';
import { KIND_ICONS, SYSTEM_COLORS } from '../icons.js';
import IconBadge from './IconBadge.vue';
import RoadShield from './RoadShield.vue';

const FACT_ICONS = {
  delay: { icon: PhTimer, color: SYSTEM_COLORS.orange },
  length: { icon: PhRuler, color: SYSTEM_COLORS.blue },
  speed: { icon: PhGauge, color: SYSTEM_COLORS.green },
  since: { icon: PhClock, color: SYSTEM_COLORS.purple },
};

const props = defineProps({
  card: { type: Object, required: true },
  /** Corridors this disruption lies on: {id, title, score, levelLabel, color}. */
  corridors: { type: Array, default: () => [] },
  /** The nearest open truck parking on the road: {row, km}, or null. */
  parking: { type: Object, default: null },
  /** Whether the road is pinned (alerts for it when they are on). */
  watching: { type: Boolean, default: false },
});
defineEmits(['close', 'focus', 'share', 'watch', 'corridor', 'parking']);

const sameDay = (a, b) => {
  const x = berlinParts(a);
  const y = berlinParts(b);
  return x.year === y.year && x.month === y.month && x.day === y.day;
};
/** "22:00" today, else "Tue, Nov 17, 05:30". */
const when = (ms) =>
  sameDay(ms, Date.now())
    ? formatDate(ms, { hour: '2-digit', minute: '2-digit' })
    : formatDate(ms, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
const schedule = computed(() => props.card.schedule);
const projectEnd = computed(() =>
  schedule.value?.projectEnd
    ? formatDate(schedule.value.projectEnd, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : '',
);
</script>

<template>
  <article class="flex flex-col gap-4" :aria-label="card.title">
    <header class="flex items-start gap-3">
      <IconBadge
        class="mt-1"
        :icon="KIND_ICONS[card.kind]?.icon"
        :color="KIND_ICONS[card.kind]?.color"
        size="lg"
      />
      <div class="min-w-0 flex-1">
        <h2 class="text-title">
          {{ card.title }}
        </h2>
        <p
          class="mt-1 flex items-center gap-1.5 text-body text-muted-foreground"
        >
          <RoadShield :road="card.road" />
          <span class="truncate">{{ card.place }}</span>
        </p>
        <p
          v-if="card.direction"
          class="truncate text-subhead text-muted-foreground"
        >
          {{ t('Direction') }}: {{ card.direction }}
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

    <div class="grid grid-cols-3 gap-2">
      <Button size="lg" @click="$emit('focus')"
        ><PhMapPin weight="fill" class="size-4" />{{ t('Map') }}</Button
      >
      <Button
        v-if="card.road"
        variant="secondary"
        size="lg"
        :aria-pressed="String(watching)"
        :title="
          t('Pin {road} to My roads and places; alerts cover pinned roads', {
            road: card.road,
          })
        "
        @click="$emit('watch')"
        ><component
          :is="watching ? PhBellRinging : PhBellSimple"
          weight="fill"
          class="size-4"
        />{{
          watching ? t('Watching') : t('Watch {road}', { road: card.road })
        }}</Button
      >
      <Button variant="secondary" size="lg" @click="$emit('share')"
        ><PhShareNetwork weight="fill" class="size-4" />{{ t('Share') }}</Button
      >
    </div>

    <!-- When it applies: the window in force or the next one, as a bar. -->
    <section
      v-if="schedule && schedule.from"
      class="rounded-group bg-card p-3"
      :aria-label="t('When')"
    >
      <template v-if="schedule.active">
        <p class="flex justify-between gap-3 text-subhead font-semibold">
          <span>{{ t('Since {time}', { time: when(schedule.from) }) }}</span>
          <span class="text-end">{{
            t('Until {time}', { time: when(schedule.to) })
          }}</span>
        </p>
        <div
          class="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          :aria-valuenow="Math.round(schedule.progress * 100)"
          aria-valuemin="0"
          aria-valuemax="100"
        >
          <div
            class="h-full rounded-full"
            :style="{
              width: `${Math.max(3, schedule.progress * 100)}%`,
              background: card.color,
            }"
          />
        </div>
      </template>
      <p v-else class="text-subhead font-semibold">
        {{
          t('Next: {from} to {to}', {
            from: when(schedule.from),
            to: when(schedule.to),
          })
        }}
      </p>
      <p
        v-if="schedule.later || projectEnd"
        class="mt-1.5 text-caption text-muted-foreground"
      >
        <span v-if="schedule.later">{{
          tn(
            schedule.later,
            '{count} more window planned.',
            '{count} more windows planned.',
          )
        }}</span>
        {{ ' ' }}
        <span v-if="projectEnd">{{
          t('The whole project runs until {date}.', { date: projectEnd })
        }}</span>
      </p>
    </section>

    <dl
      v-if="card.facts.length"
      class="grid gap-2"
      :style="{
        gridTemplateColumns: `repeat(${Math.max(2, card.facts.length)}, minmax(0, 1fr))`,
      }"
    >
      <div
        v-for="fact in card.facts"
        :key="fact.label"
        class="flex flex-col items-center gap-1 rounded-group bg-muted px-2 py-2.5 text-center"
      >
        <IconBadge
          v-if="FACT_ICONS[fact.key]"
          :icon="FACT_ICONS[fact.key].icon"
          :color="FACT_ICONS[fact.key].color"
          size="sm"
        />
        <dt class="text-caption font-medium text-muted-foreground">
          {{ fact.label }}
        </dt>
        <dd
          class="mt-0.5 text-headline"
          :class="fact.emphasis ? 'text-primary-ink' : ''"
        >
          {{ fact.value }}
        </dd>
      </div>
    </dl>

    <p class="text-body">{{ card.hint }}</p>

    <!-- What it means: the corridors it lies on and where to park. -->
    <section
      v-if="corridors.length || parking"
      class="flex flex-col gap-2"
      :aria-label="t('What it means')"
    >
      <button
        v-for="corridor in corridors"
        :key="corridor.id"
        type="button"
        class="nd-tap flex cursor-pointer items-center gap-3 rounded-group bg-muted px-3 py-2.5 text-start outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring"
        @click="$emit('corridor', corridor.id)"
      >
        <span
          class="grid size-8 shrink-0 place-items-center rounded-[10px] text-subhead font-bold text-white"
          :style="{ background: corridor.color }"
          >{{ corridor.score ?? '–' }}</span
        >
        <span class="min-w-0 flex-1">
          <span class="block truncate text-headline">{{ corridor.title }}</span>
          <span class="block text-caption text-muted-foreground">{{
            t('On this corridor · {level}', { level: corridor.levelLabel })
          }}</span>
        </span>
        <PhCaretRight class="size-4 text-muted-foreground" />
      </button>
      <button
        v-if="parking"
        type="button"
        class="nd-tap flex cursor-pointer items-center gap-3 rounded-group bg-muted px-3 py-2.5 text-start outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring"
        @click="$emit('parking', parking.row)"
      >
        <IconBadge :icon="PhTruck" :color="SYSTEM_COLORS.blue" />
        <span class="min-w-0 flex-1">
          <span class="block text-headline">{{
            t('Nearest truck parking')
          }}</span>
          <span class="block truncate text-caption text-muted-foreground">{{
            t('{name} · {km} km away', {
              name: parking.row.name || t('Rest area'),
              km: formatNumber(parking.km, { maximumFractionDigits: 0 }),
            })
          }}</span>
        </span>
        <span class="text-end">
          <span class="block text-headline tabular-nums">{{
            formatNumber(parking.row.lorrySpaces)
          }}</span>
          <span class="block text-caption text-muted-foreground">{{
            t('spaces')
          }}</span>
        </span>
      </button>
    </section>

    <template v-if="card.details.length">
      <Separator />
      <details class="group">
        <summary
          class="flex cursor-pointer list-none items-center justify-between text-subhead font-semibold text-muted-foreground"
        >
          {{ t('Official notice (German)') }}
          <PhCaretRight
            class="size-4 transition-transform group-open:rotate-90"
          />
        </summary>
        <p
          v-for="(line, index) in card.details"
          :key="index"
          class="mt-1 text-callout"
          lang="de"
        >
          {{ line }}
        </p>
      </details>
    </template>

    <p class="text-caption text-muted-foreground">
      {{
        t(
          'Source: Die Autobahn GmbH des Bundes. For information only, always follow road signs.',
        )
      }}
    </p>
  </article>
</template>
