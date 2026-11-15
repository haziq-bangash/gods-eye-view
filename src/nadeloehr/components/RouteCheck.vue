<script setup>
// Check a route: two places in, a driving route scored like a corridor
// out — closures on the route, truck parking beside it, the weather it
// crosses — for now, tonight or tomorrow.
import { computed } from 'vue';
import {
  PhArrowsDownUp,
  PhCaretRight,
  PhCircleNotch,
  PhPath,
  PhX,
} from '@phosphor-icons/vue';
import { formatNumber, t } from '../../i18n/index.js';
import {
  disruptionPlace,
  disruptionTitle,
  severityOf,
  sortDisruptions,
} from '../disruptions.js';
import { KIND_ICONS, SYSTEM_COLORS } from '../icons.js';
import { corridorView } from '../today.js';
import { useCollapsed } from '../collapse.js';
import CorridorDetail from './CorridorDetail.vue';
import IconBadge from './IconBadge.vue';
import RoadShield from './RoadShield.vue';
import SectionHeader from './SectionHeader.vue';
import Separator from '../ui/Separator.vue';

const props = defineProps({
  app: { type: Object, required: true },
});

const section = useCollapsed('route');
// The fields live in the app so a route typed in search fills them too.
const from = computed({
  get: () => props.app.routeFrom.value,
  set: (value) => (props.app.routeFrom.value = value),
});
const to = computed({
  get: () => props.app.routeTo.value,
  set: (value) => (props.app.routeTo.value = value),
});
const loading = computed(() => props.app.routeStatus.value === 'loading');
const view = computed(() =>
  props.app.routeScore.value ? corridorView(props.app.routeScore.value) : null,
);
const summary = computed(() => {
  const route = props.app.route.value;
  if (!route) return '';
  const hours = Math.floor(route.durationS / 3600);
  const minutes = Math.round((route.durationS % 3600) / 60);
  return t('{distance} km · {hours} h {minutes} min by car', {
    distance: formatNumber(Math.round(route.distanceM / 1000)),
    hours: formatNumber(hours),
    minutes: formatNumber(minutes),
  });
});
/** Critical and major events on the route, worst first. */
const onRoute = computed(() =>
  sortDisruptions(props.app.routeScore.value?.events || []).filter(
    (row) => severityOf(row.kind) !== 'minor',
  ),
);

function submit() {
  if (from.value.trim() && to.value.trim())
    props.app.checkRoute(from.value.trim(), to.value.trim());
}
function swap() {
  [from.value, to.value] = [to.value, from.value];
}
</script>

<template>
  <section aria-labelledby="nd-route">
    <SectionHeader
      id="nd-route"
      :title="t('Check a route')"
      :collapsed="section.isCollapsed()"
      @toggle="section.toggle"
    />
    <template v-if="!section.isCollapsed()">
      <form
        class="flex items-stretch gap-2 rounded-group bg-card p-2"
        @submit.prevent="submit"
      >
        <div class="flex min-w-0 flex-1 flex-col gap-1.5">
          <input
            v-model="from"
            type="text"
            autocomplete="off"
            class="h-9 w-full rounded-[12px] bg-input px-3 text-callout outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
            :placeholder="t('From, e.g. Hamburg')"
            :aria-label="t('From')"
          />
          <input
            v-model="to"
            type="text"
            autocomplete="off"
            class="h-9 w-full rounded-[12px] bg-input px-3 text-callout outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
            :placeholder="t('To, e.g. München')"
            :aria-label="t('To')"
          />
        </div>
        <div class="flex flex-col gap-1.5">
          <button
            type="button"
            class="grid size-9 cursor-pointer place-items-center rounded-[12px] text-muted-foreground outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring"
            :aria-label="t('Swap from and to')"
            @click="swap"
          >
            <PhArrowsDownUp weight="bold" class="size-4" />
          </button>
          <button
            type="submit"
            class="grid size-9 cursor-pointer place-items-center rounded-[12px] bg-primary-fill text-primary-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring disabled:opacity-50"
            :aria-label="t('Check route')"
            :disabled="loading || !from.trim() || !to.trim()"
          >
            <PhCircleNotch
              v-if="loading"
              weight="bold"
              class="size-4 animate-spin"
            />
            <PhCaretRight v-else weight="bold" class="size-4" />
          </button>
        </div>
      </form>

      <p
        v-if="app.routeStatus.value === 'error'"
        role="status"
        class="mt-2 rounded-group bg-card p-3 text-callout"
      >
        {{ app.routeError.value }}
      </p>

      <div
        v-if="view"
        class="mt-2 flex flex-col gap-3 rounded-group bg-card p-3"
      >
        <div class="flex items-center gap-2">
          <IconBadge :icon="PhPath" :color="SYSTEM_COLORS.blue" size="sm" />
          <p class="min-w-0 flex-1 truncate text-subhead text-muted-foreground">
            {{ summary }}
          </p>
          <button
            type="button"
            class="grid size-7 cursor-pointer place-items-center rounded-full text-muted-foreground outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring"
            :aria-label="t('Clear route')"
            @click="app.clearRoute()"
          >
            <PhX weight="bold" class="size-3.5" />
          </button>
        </div>
        <CorridorDetail :corridor="view" :closable="false" />

        <template v-if="onRoute.length">
          <Separator />
          <h3 class="nd-eyebrow">{{ t('On your route') }}</h3>
          <ul class="-mx-1">
            <li v-for="row in onRoute.slice(0, 8)" :key="row.stableId">
              <button
                type="button"
                class="press flex w-full cursor-pointer items-center gap-3 rounded-[12px] px-1 py-1.5 text-start outline-none hover:bg-accent focus-visible:bg-accent"
                @click="app.showOnMap(row)"
              >
                <IconBadge
                  :icon="KIND_ICONS[row.kind]?.icon"
                  :color="KIND_ICONS[row.kind]?.color"
                  size="sm"
                />
                <span class="min-w-0 flex-1">
                  <span class="flex items-center gap-1.5">
                    <RoadShield :road="row.road" />
                    <span class="truncate text-headline">{{
                      disruptionTitle(row.kind)
                    }}</span>
                  </span>
                  <span
                    class="block truncate text-subhead text-muted-foreground"
                    >{{ disruptionPlace(row) }}</span
                  >
                </span>
              </button>
            </li>
          </ul>
        </template>
        <p v-else class="text-callout text-muted-foreground">
          {{ t('No closures or traffic warnings on this route.') }}
        </p>
      </div>
    </template>
  </section>
</template>
