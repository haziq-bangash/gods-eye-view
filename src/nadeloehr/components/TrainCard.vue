<script setup>
// One long-distance train, as a live tracker: when it reaches its next stop,
// its stops with scheduled and expected times and, where Deutsche Bahn
// reports it, its real delay. Positions between stations are estimates, and
// the card says so.
import { computed, ref, watch } from 'vue';
import { PhCrosshair, PhShareNetwork, PhTrain, PhX } from '@phosphor-icons/vue';
import { formatDate, t, tn } from '../../i18n/index.js';
import { trainColor } from '../../freight/dbTrains.js';
import Button from '../ui/Button.vue';
import { SYSTEM_COLORS } from '../icons.js';
import IconBadge from './IconBadge.vue';

const props = defineProps({
  row: { type: Object, required: true },
});
defineEmits(['close', 'follow', 'share']);

const color = computed(() => trainColor(props.row.category));
const clock = (ms) => formatDate(ms, { hour: '2-digit', minute: '2-digit' });
const title = computed(
  () => props.row.number || props.row.line || props.row.category,
);
/** Whole minutes late, or null where DB has not reported this train. */
const lateMinutes = computed(() =>
  Number.isFinite(props.row.delay)
    ? Math.max(0, Math.round(props.row.delay / 60))
    : null,
);
const late = computed(() => (lateMinutes.value ?? 0) >= 1);
const delayBadge = computed(() => {
  const minutes = lateMinutes.value;
  if (minutes === null) return null;
  if (minutes < 1) return { text: t('On time'), color: SYSTEM_COLORS.green };
  return {
    text: t('+{count} min', { count: minutes }),
    color: minutes >= 6 ? SYSTEM_COLORS.red : SYSTEM_COLORS.orange,
  };
});

const stops = computed(() => props.row.stops || []);
const current = computed(
  () =>
    stops.value.find((stop) => stop.state === 'here') ||
    stops.value.find((stop) => stop.state === 'next') ||
    null,
);
const minutesUntil = (ms) => Math.max(0, Math.ceil((ms - Date.now()) / 60_000));
/** "Hannover Hbf in 4 min", or "At Hannover Hbf, leaves in 2 min". */
const headline = computed(() => {
  const stop = current.value;
  if (!stop) return '';
  if (stop.state === 'here')
    return stop.expectedDeparts
      ? tn(
          minutesUntil(stop.expectedDeparts),
          'At {station}, leaves in {count} min',
          'At {station}, leaves in {count} min',
          { station: stop.name },
        )
      : t('Arrived at {station}', { station: stop.name });
  const minutes = minutesUntil(stop.expectedArrives);
  return minutes < 1
    ? t('Arriving at {station}', { station: stop.name })
    : tn(minutes, '{station} in {count} min', '{station} in {count} min', {
        station: stop.name,
      });
});
const subline = computed(() => {
  const stop = current.value;
  if (!stop) return '';
  const due = stop.state === 'here' ? stop.departs : stop.arrives;
  const expected =
    stop.state === 'here' ? stop.expectedDeparts : stop.expectedArrives;
  if (!due) return '';
  return late.value
    ? t('Due {due}, expected {expected}', {
        due: clock(due),
        expected: clock(expected),
      })
    : t('Due {due}', { due: clock(due) });
});

/** The timeline: the last stop passed, then the next three, unless expanded. */
const expanded = ref(false);
watch(
  () => props.row.id,
  () => (expanded.value = false),
);
const timeline = computed(() => {
  const all = stops.value;
  if (expanded.value) return { shown: all, hidden: 0 };
  const at = all.findIndex((stop) => stop.state !== 'passed');
  const from = Math.max(0, (at < 0 ? all.length : at) - 1);
  const to = Math.min(all.length, from + 4);
  // Never hide just one stop behind a button.
  const end = all.length - to === 1 ? all.length : to;
  return { shown: all.slice(from, end), hidden: all.length - end };
});
const last = computed(() => stops.value.at(-1) || null);
/**
 * The time a stop is shown with: when the train left (or leaves) a stop it
 * has reached, and when it gets to the ones ahead, as the headline does.
 */
const shownTimes = (stop) => {
  const leaving =
    (stop.state === 'passed' || stop.state === 'here' || !stop.arrives) &&
    stop.departs;
  return leaving
    ? { due: stop.departs, expected: stop.expectedDeparts }
    : { due: stop.arrives, expected: stop.expectedArrives };
};
</script>

<template>
  <article class="flex flex-col gap-4" :aria-label="title">
    <header class="flex items-start gap-3">
      <IconBadge class="mt-1" :icon="PhTrain" :color="color" size="lg" />
      <div class="min-w-0 flex-1">
        <h2 class="flex flex-wrap items-center gap-2 text-title">
          {{ title }}
          <span
            v-if="delayBadge"
            class="rounded-full px-2 py-0.5 text-caption font-semibold text-white"
            :style="{ background: delayBadge.color }"
            >{{ delayBadge.text }}</span
          >
        </h2>
        <p class="mt-1 text-body text-muted-foreground">
          {{ t('To {place}', { place: row.headsign }) }}
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

    <section
      v-if="headline"
      class="rounded-group bg-muted px-3 py-2.5"
      aria-live="polite"
    >
      <p class="text-[22px] leading-tight font-bold tracking-tight">
        {{ headline }}
      </p>
      <p class="mt-0.5 text-subhead text-muted-foreground">{{ subline }}</p>
    </section>

    <ol class="relative flex list-none flex-col" :aria-label="t('Stops')">
      <li
        v-for="(stop, index) in timeline.shown"
        :key="`${stop.name}-${index}`"
        class="relative flex items-baseline justify-between gap-3 py-1.5 ps-7"
        :class="stop.state === 'passed' ? 'text-muted-foreground' : ''"
      >
        <!-- The line between stops: in the train's colour up to here. -->
        <span
          v-if="index < timeline.shown.length - 1 || timeline.hidden"
          class="absolute start-[7px] top-4 h-full w-[3px] rounded-full"
          :style="{
            background:
              stop.state === 'passed'
                ? color
                : 'color-mix(in oklch, var(--muted-foreground) 35%, transparent)',
          }"
          aria-hidden="true"
        />
        <span
          class="absolute start-0.5 top-[9px] size-[13px] rounded-full border-[3px] bg-card"
          :style="{
            borderColor:
              stop.state === 'later'
                ? 'color-mix(in oklch, var(--muted-foreground) 35%, transparent)'
                : color,
            background: stop.state === 'passed' ? color : undefined,
            boxShadow:
              stop.state === 'next' || stop.state === 'here'
                ? `0 0 0 4px color-mix(in oklch, ${color} 22%, transparent)`
                : undefined,
          }"
          aria-hidden="true"
        />
        <span
          class="min-w-0 truncate text-body"
          :class="
            stop.state === 'next' || stop.state === 'here'
              ? 'font-semibold'
              : ''
          "
          >{{ stop.name }}</span
        >
        <span class="shrink-0 text-body tabular-nums">
          <template v-if="late">
            <s class="me-1.5 text-muted-foreground">{{
              clock(shownTimes(stop).due)
            }}</s>
            <span
              :class="stop.state === 'passed' ? '' : 'font-semibold'"
              :style="{
                color: stop.state === 'passed' ? undefined : SYSTEM_COLORS.red,
              }"
              >{{ clock(shownTimes(stop).expected) }}</span
            >
          </template>
          <span v-else>{{ clock(shownTimes(stop).due) }}</span>
        </span>
      </li>
      <li v-if="timeline.hidden" class="ps-7">
        <button
          type="button"
          class="nd-tap flex w-full cursor-pointer items-baseline justify-between gap-3 py-1.5 text-start text-subhead text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring"
          @click="expanded = true"
        >
          <span>{{
            tn(
              timeline.hidden,
              '+ {count} more stop to {place}',
              '+ {count} more stops to {place}',
              { place: last?.name || row.headsign },
            )
          }}</span>
          <span class="tabular-nums">{{
            last ? clock(last.expectedArrives) : ''
          }}</span>
        </button>
      </li>
    </ol>

    <div class="grid grid-cols-2 gap-2">
      <Button
        size="lg"
        :variant="row.following ? 'secondary' : 'default'"
        :aria-pressed="String(Boolean(row.following))"
        @click="$emit('follow')"
        ><PhCrosshair weight="bold" class="size-4" />{{
          row.following ? t('Following') : t('Follow')
        }}</Button
      >
      <Button variant="secondary" size="lg" @click="$emit('share')"
        ><PhShareNetwork weight="fill" class="size-4" />{{ t('Share') }}</Button
      >
    </div>

    <p class="text-subhead text-muted-foreground">
      {{
        lateMinutes !== null
          ? t(
              'Delay as Deutsche Bahn reports it at the major stations; between stations the position is estimated.',
            )
          : row.delaysOn
            ? t(
                'No delay reported for this train yet, so it is placed by the timetable.',
              )
            : t(
                'Position estimated from the timetable. Deutsche Bahn publishes no live train positions, so delays are not shown.',
              )
      }}
    </p>
    <p class="text-caption text-muted-foreground">
      {{
        row.delaysOn
          ? t(
              'Sources: gtfs.de with data from DELFI e.V., and the Deutsche Bahn Timetables API (both CC BY 4.0).',
            )
          : t('Source: gtfs.de, data from DELFI e.V. (CC BY 4.0).')
      }}
    </p>
  </article>
</template>
