<script setup>
// Check a route: two places in, a driving route scored like a corridor
// out — closures on the route, truck parking beside it, the weather it
// crosses — for now, tonight or tomorrow.
import { computed } from 'vue';
import {
  PhArrowsDownUp,
  PhArrowsSplit,
  PhBookmarkSimple,
  PhCalendarBlank,
  PhCaretRight,
  PhCheckCircle,
  PhCircleNotch,
  PhCloudLightning,
  PhCloudSlash,
  PhPath,
  PhTruck,
  PhWarningCircle,
  PhX,
} from '@phosphor-icons/vue';
import { formatNumber, t } from '../../i18n/index.js';
import { WARNING_COLORS } from '../../layers/weatherWarnings/records.js';
import { KIND_ICONS, SYSTEM_COLORS } from '../icons.js';
import { corridorView } from '../today.js';
import { useCollapsed } from '../collapse.js';
import { routeId, useSavedRoutes } from '../savedRoutes.js';
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
  const time = t('{distance} km · {hours} h {minutes} min by car', {
    distance: formatNumber(Math.round(route.distanceM / 1000)),
    hours: formatNumber(hours),
    minutes: formatNumber(minutes),
  });
  return route.summary
    ? `${time} · ${t('via {roads}', { roads: route.summary })}`
    : time;
});
const verdict = computed(() => props.app.routeVerdict.value);
const TONES = {
  clear: { icon: PhCheckCircle, color: SYSTEM_COLORS.green },
  caution: { icon: PhWarningCircle, color: SYSTEM_COLORS.orange },
  blocked: { icon: PhWarningCircle, color: SYSTEM_COLORS.red },
};
/** The icon and colour for one line of the verdict. */
function lineIcon(line) {
  if (line.kind === 'closure') return KIND_ICONS.closure;
  if (line.kind === 'traffic') return KIND_ICONS.warning;
  if (line.kind === 'detour')
    return { icon: PhArrowsSplit, color: SYSTEM_COLORS.blue };
  if (line.kind === 'ban') return { icon: PhTruck, color: SYSTEM_COLORS.red };
  if (line.kind === 'next-ban')
    return { icon: PhCalendarBlank, color: SYSTEM_COLORS.gray };
  if (line.kind === 'weather')
    return { icon: PhCloudLightning, color: WARNING_COLORS[line.level] };
  return { icon: PhCloudSlash, color: SYSTEM_COLORS.gray };
}

const savedRoutes = useSavedRoutes();
const isSaved = computed(() => {
  const route = props.app.route.value;
  return Boolean(route) && savedRoutes.isSaved(from.value, to.value);
});
function toggleSaved() {
  if (!from.value.trim() || !to.value.trim()) return;
  if (isSaved.value) savedRoutes.remove(routeId(from.value, to.value));
  else savedRoutes.save(from.value.trim(), to.value.trim());
}
function checkSaved(item) {
  props.app.checkRoute(item.from, item.to);
}

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

      <ul
        v-if="!view && savedRoutes.saved.value.length"
        class="mt-2 flex flex-wrap gap-1.5"
        :aria-label="t('Saved routes')"
      >
        <li
          v-for="item in savedRoutes.saved.value"
          :key="item.id"
          class="flex items-center rounded-full bg-card"
        >
          <button
            type="button"
            class="press cursor-pointer rounded-full py-1.5 ps-3 pe-1 text-subhead outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring"
            @click="checkSaved(item)"
          >
            {{ item.from }} → {{ item.to }}
          </button>
          <button
            type="button"
            class="grid size-7 cursor-pointer place-items-center rounded-full text-muted-foreground outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring"
            :aria-label="
              t('Remove {route}', { route: `${item.from} → ${item.to}` })
            "
            @click="savedRoutes.remove(item.id)"
          >
            <PhX weight="bold" class="size-3" />
          </button>
        </li>
      </ul>

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
            class="grid size-7 cursor-pointer place-items-center rounded-full outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring"
            :class="isSaved ? 'text-primary-ink' : 'text-muted-foreground'"
            :aria-label="isSaved ? t('Remove saved route') : t('Save route')"
            :aria-pressed="isSaved"
            @click="toggleSaved"
          >
            <PhBookmarkSimple
              :weight="isSaved ? 'fill' : 'bold'"
              class="size-3.5"
            />
          </button>
          <button
            type="button"
            class="grid size-7 cursor-pointer place-items-center rounded-full text-muted-foreground outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring"
            :aria-label="t('Clear route')"
            @click="app.clearRoute()"
          >
            <PhX weight="bold" class="size-3.5" />
          </button>
        </div>

        <template v-if="verdict">
          <p
            role="status"
            class="nd-ink flex items-center gap-2 text-title2 font-bold"
            :style="{ '--ink': TONES[verdict.tone].color }"
          >
            <component
              :is="TONES[verdict.tone].icon"
              weight="fill"
              class="size-5 shrink-0"
              aria-hidden="true"
            />
            {{ verdict.headline }}
          </p>
          <ul v-if="verdict.lines.length" class="-mx-1">
            <li v-for="(line, index) in verdict.lines" :key="index">
              <component
                :is="line.row ? 'button' : 'div'"
                :type="line.row ? 'button' : undefined"
                class="flex w-full items-center gap-3 rounded-[12px] px-1 py-1.5 text-start"
                :class="
                  line.row
                    ? 'press cursor-pointer outline-none hover:bg-accent focus-visible:bg-accent'
                    : ''
                "
                @click="line.row && app.showOnMap(line.row)"
              >
                <IconBadge
                  :icon="lineIcon(line).icon"
                  :color="lineIcon(line).color"
                  size="sm"
                />
                <span class="min-w-0 flex-1">
                  <span class="flex items-center gap-1.5">
                    <RoadShield v-if="line.row?.road" :road="line.row.road" />
                    <span class="text-headline">{{ line.title }}</span>
                  </span>
                  <span
                    v-if="line.detail"
                    class="block text-subhead text-muted-foreground"
                    >{{ line.detail }}</span
                  >
                </span>
              </component>
            </li>
          </ul>
        </template>

        <Separator />
        <CorridorDetail :corridor="view" :closable="false" />
      </div>
    </template>
  </section>
</template>
