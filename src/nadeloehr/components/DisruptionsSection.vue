<script setup>
// Autobahn disruptions by severity: three counts, then the critical and
// major events. Minor ones (exit closures, roadworks) stay folded until
// asked for. A road picked in search narrows everything to that road.
import { computed, ref, watch } from 'vue';
import { PhCaretRight, PhX } from '@phosphor-icons/vue';
import { t, tn } from '../../i18n/index.js';
import {
  SEVERITY_COLORS,
  disruptionPlace,
  disruptionTitle,
  severityCopy,
  severityCounts,
  severityOf,
  sortDisruptions,
} from '../disruptions.js';
import { KIND_ICONS } from '../icons.js';
import IconBadge from './IconBadge.vue';
import RoadShield from './RoadShield.vue';
import Separator from '../ui/Separator.vue';
import SectionHeader from './SectionHeader.vue';
import { useCollapsed } from '../collapse.js';

const section = useCollapsed('disruptions');

const props = defineProps({
  app: { type: Object, required: true },
});

const LIST_LIMIT = 12;
const showAll = ref(false);

const autobahnOn = computed(
  () => props.app.layerById('autobahn-traffic')?.enabled === true,
);
const onRoad = computed(() => {
  const road = props.app.roadFilter.value;
  const rows = props.app.disruptions.value;
  return road ? rows.filter((row) => row.road === road) : rows;
});
const counts = computed(() => severityCounts(onRoad.value));
const filtered = computed(() => {
  const severity = props.app.severity.value;
  const rows = sortDisruptions(onRoad.value);
  if (severity) return rows.filter((row) => severityOf(row.kind) === severity);
  return rows.filter((row) => severityOf(row.kind) !== 'minor');
});
const shown = computed(() =>
  showAll.value ? filtered.value : filtered.value.slice(0, LIST_LIMIT),
);
const minorCount = computed(
  () => counts.value.find((entry) => entry.severity === 'minor')?.count || 0,
);
watch(
  () => [props.app.severity.value, props.app.roadFilter.value],
  () => (showAll.value = false),
);
</script>

<template>
  <section aria-labelledby="nd-disruptions">
    <SectionHeader
      id="nd-disruptions"
      :title="t('Disruptions')"
      :collapsed="section.isCollapsed()"
      @toggle="section.toggle"
    >
      <template #actions>
        <button
          v-if="app.roadFilter.value"
          type="button"
          class="flex cursor-pointer items-center gap-1.5 rounded-full bg-card py-1 ps-1.5 pe-2.5 text-caption font-semibold hover:bg-accent"
          :aria-label="t('Show all roads')"
          @click="app.showRoad(null)"
        >
          <RoadShield :road="app.roadFilter.value" />
          <PhX weight="bold" class="size-3" />
        </button>
      </template>
    </SectionHeader>

    <template v-if="!section.isCollapsed()">
      <div
        v-if="!autobahnOn"
        class="flex items-center justify-between gap-3 rounded-group bg-card p-3"
      >
        <p class="text-body">{{ t('Disruptions are hidden.') }}</p>
        <button
          type="button"
          class="cursor-pointer rounded-full bg-primary px-4 py-2 text-callout font-semibold text-primary-foreground"
          @click="app.setLayer('autobahn-traffic', true)"
        >
          {{ t('Show') }}
        </button>
      </div>

      <template v-else>
        <div
          class="grid grid-cols-3 gap-1.5"
          role="group"
          :aria-label="t('Filter by severity')"
        >
          <button
            v-for="entry in counts"
            :key="entry.severity"
            type="button"
            class="press cursor-pointer rounded-[16px] border bg-card px-3 py-2.5 text-start outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring"
            :class="
              app.severity.value === entry.severity
                ? 'border-[var(--sev)]'
                : 'border-transparent'
            "
            :style="{ '--sev': SEVERITY_COLORS[entry.severity] }"
            :aria-pressed="String(app.severity.value === entry.severity)"
            @click="app.setSeverity(entry.severity)"
          >
            <span
              class="nd-figure block text-[28px] leading-none"
              :style="{ color: SEVERITY_COLORS[entry.severity] }"
              >{{ entry.count }}</span
            >
            <span class="mt-1 block truncate text-caption font-semibold">{{
              severityCopy(entry.severity).label
            }}</span>
            <span class="block truncate text-[11px] text-muted-foreground">{{
              severityCopy(entry.severity).hint
            }}</span>
          </button>
        </div>

        <p
          v-if="!filtered.length"
          class="mt-2 rounded-group bg-card p-3 text-body text-muted-foreground"
        >
          {{
            app.disruptions.value.length
              ? t('Nothing of this type right now.')
              : t('Loading disruptions…')
          }}
        </p>
        <ul
          v-else
          class="mt-2 overflow-hidden rounded-group bg-card"
          :aria-label="t('Disruptions')"
        >
          <li v-for="(row, index) in shown" :key="row.stableId">
            <Separator v-if="index" class="ms-14 w-auto" />
            <button
              type="button"
              class="press flex w-full cursor-pointer items-center gap-3 px-3 py-2.5 text-start outline-none hover:bg-accent focus-visible:bg-accent"
              @click="app.showOnMap(row)"
            >
              <IconBadge
                :icon="KIND_ICONS[row.kind]?.icon"
                :color="KIND_ICONS[row.kind]?.color"
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
                  >{{ disruptionPlace(row) || t('Location on the map') }}</span
                >
              </span>
              <span
                v-if="row.delayMinutes > 0"
                class="shrink-0 text-subhead font-semibold text-primary"
              >
                {{ t('+{minutes} min', { minutes: row.delayMinutes }) }}
              </span>
              <PhCaretRight
                weight="bold"
                class="size-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
            </button>
          </li>
        </ul>
        <button
          v-if="filtered.length > shown.length"
          type="button"
          class="mt-2 w-full cursor-pointer rounded-full py-2 text-callout font-semibold text-primary hover:bg-accent"
          @click="showAll = true"
        >
          {{ tn(filtered.length, 'Show all {count}', 'Show all {count}') }}
        </button>
        <button
          v-else-if="!app.severity.value && minorCount"
          type="button"
          class="mt-2 w-full cursor-pointer rounded-full py-2 text-callout font-semibold text-primary hover:bg-accent"
          @click="app.setSeverity('minor')"
        >
          {{
            tn(
              minorCount,
              'Show {count} minor (exits and roadworks)',
              'Show {count} minor (exits and roadworks)',
            )
          }}
        </button>
      </template>
    </template>
  </section>
</template>
