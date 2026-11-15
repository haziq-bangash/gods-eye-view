<script setup>
// "Mine": the pinned Autobahns and places, each with what applies to it for
// the chosen time. Pins come from search; they stay in this browser.
import { computed } from 'vue';
import { PhMapPin, PhPushPinSimple, PhX } from '@phosphor-icons/vue';
import { t } from '../../i18n/index.js';
import { pinSummary, usePins } from '../pins.js';
import { SYSTEM_COLORS } from '../icons.js';
import { useCollapsed } from '../collapse.js';
import IconBadge from './IconBadge.vue';
import RoadShield from './RoadShield.vue';
import SectionHeader from './SectionHeader.vue';
import Separator from '../ui/Separator.vue';

const props = defineProps({
  app: { type: Object, required: true },
});

const section = useCollapsed('mine');
const store = usePins();
const items = computed(() =>
  pinSummary(store.pins.value, {
    events: props.app.disruptions.value,
    warnings: props.app.weatherOn.value ? props.app.warnings.value : [],
  }),
);
const TONE = {
  alert: SYSTEM_COLORS.red,
  notice: SYSTEM_COLORS.orange,
  calm: SYSTEM_COLORS.green,
};

function open(item) {
  if (item.type === 'road') props.app.showRoad(item.road);
  else props.app.flyToPlace({ ...item.place, lng: item.place.lon });
}
function remove(item) {
  if (item.type === 'road') store.unpinRoad(item.road);
  else store.unpinPlace(item.place.id);
}
</script>

<template>
  <section aria-labelledby="nd-mine">
    <SectionHeader
      id="nd-mine"
      :title="t('My roads and places')"
      :collapsed="section.isCollapsed()"
      @toggle="section.toggle"
    />
    <template v-if="!section.isCollapsed()">
      <p
        v-if="!items.length"
        class="flex items-start gap-2.5 rounded-group bg-card p-3 text-callout text-muted-foreground"
      >
        <PhPushPinSimple weight="fill" class="mt-0.5 size-4 shrink-0" />
        {{
          t(
            'Search an Autobahn (A7) or a place and tap the pin to follow it here.',
          )
        }}
      </p>
      <ul v-else class="overflow-hidden rounded-group bg-card">
        <li v-for="(item, index) in items" :key="item.key">
          <Separator v-if="index" class="ms-12 w-auto" />
          <div class="flex items-center gap-1 pe-1.5">
            <button
              type="button"
              class="press flex min-w-0 flex-1 cursor-pointer items-center gap-3 px-3 py-2.5 text-start outline-none hover:bg-accent focus-visible:bg-accent"
              @click="open(item)"
            >
              <span
                class="grid size-7 shrink-0 place-items-center"
                aria-hidden="true"
              >
                <RoadShield v-if="item.type === 'road'" :road="item.road" />
                <IconBadge
                  v-else
                  :icon="PhMapPin"
                  :color="SYSTEM_COLORS.red"
                  size="sm"
                />
              </span>
              <span class="min-w-0 flex-1">
                <span class="block truncate text-headline">{{
                  item.title
                }}</span>
                <span class="flex items-center gap-1.5 text-subhead">
                  <span
                    class="size-2 shrink-0 rounded-full"
                    :style="{ background: TONE[item.tone] }"
                    aria-hidden="true"
                  />
                  <span class="truncate text-muted-foreground">{{
                    item.line
                  }}</span>
                </span>
              </span>
            </button>
            <button
              type="button"
              class="grid size-7 shrink-0 cursor-pointer place-items-center rounded-full text-muted-foreground outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring"
              :aria-label="t('Unpin {name}', { name: item.title })"
              @click="remove(item)"
            >
              <PhX weight="bold" class="size-3.5" />
            </button>
          </div>
        </li>
      </ul>
    </template>
  </section>
</template>
