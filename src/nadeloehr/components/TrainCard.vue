<script setup>
// One long-distance train: where it is now, its next stop, how far along its
// run it is and, where Deutsche Bahn reports it, its real delay. Positions
// between stations are estimates, and the card says so.
import { computed } from 'vue';
import { PhCrosshair, PhShareNetwork, PhTrain, PhX } from '@phosphor-icons/vue';
import { formatDate, t } from '../../i18n/index.js';
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
const percent = computed(() =>
  Math.round(Math.min(1, Math.max(0, props.row.progress || 0)) * 100),
);
const title = computed(
  () => props.row.number || props.row.line || props.row.category,
);
/** Whole minutes late, or null where DB has not reported this train. */
const lateMinutes = computed(() =>
  Number.isFinite(props.row.delay)
    ? Math.max(0, Math.round(props.row.delay / 60))
    : null,
);
const delayBadge = computed(() => {
  const minutes = lateMinutes.value;
  if (minutes === null) return null;
  if (minutes < 1) return { text: t('On time'), color: SYSTEM_COLORS.green };
  return {
    text: t('+{count} min', { count: minutes }),
    color: minutes >= 6 ? SYSTEM_COLORS.red : SYSTEM_COLORS.orange,
  };
});
const status = computed(() =>
  props.row.stop
    ? t('At {station} until {time}', {
        station: props.row.stop.name,
        time: clock(props.row.stop.departs),
      })
    : props.row.previous && props.row.next
      ? t('Between {from} and {to}', {
          from: props.row.previous.name,
          to: props.row.next.name,
        })
      : '',
);
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

    <section class="rounded-group bg-card p-3">
      <p class="flex items-center gap-2 text-headline">
        <span
          class="size-2.5 shrink-0 rounded-full"
          :style="{ background: color }"
          aria-hidden="true"
        />
        {{ status }}
      </p>
      <p v-if="row.next" class="mt-1 text-body">
        {{
          t('Next stop: {station} at {time}', {
            station: row.next.name,
            time: clock(row.next.arrives),
          })
        }}
      </p>
      <div class="mt-3">
        <div
          class="h-1.5 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          :aria-valuenow="percent"
          aria-valuemin="0"
          aria-valuemax="100"
          :aria-label="t('Journey progress')"
        >
          <div
            class="h-full rounded-full"
            :style="{ width: `${percent}%`, background: color }"
          />
        </div>
        <p
          class="mt-1 flex justify-between gap-2 text-caption text-muted-foreground"
        >
          <span class="truncate">{{ row.from }}</span>
          <span class="truncate text-right">{{ row.headsign }}</span>
        </p>
      </div>
    </section>

    <p class="text-body text-muted-foreground">
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
