<script setup>
// The sheet's home: what is happening on the Autobahn right now, what is on
// the map, and a few tools. Written for someone who has never used a GIS.
import { computed, ref } from 'vue';
import { PhCaretDown, PhCaretRight } from '@phosphor-icons/vue';
import { t, tn } from '../../i18n/index.js';
import { layerNameForId } from '../../ui/layerNames.js';
import {
  disruptionCountLabel,
  disruptionPlace,
  disruptionSummary,
  disruptionTitle,
  sortDisruptions,
} from '../disruptions.js';
import { MAIN_LAYERS, HIDDEN_FROM_MORE } from '../mapLayers.js';
import { KIND_ICONS, TOOL_ICONS, layerIcon } from '../icons.js';
import IconBadge from './IconBadge.vue';
import RoadShield from './RoadShield.vue';
import Switch from '../ui/Switch.vue';
import Separator from '../ui/Separator.vue';

const props = defineProps({
  app: { type: Object, required: true },
});

const LIST_LIMIT = 40;
const kindFilter = ref(null);
const showAll = ref(false);
const moreOpen = ref(false);

const autobahnOn = computed(
  () => props.app.layerById('autobahn-traffic')?.enabled === true,
);
const summary = computed(() =>
  disruptionSummary(props.app.disruptions.value).filter(({ count }) => count),
);
const sorted = computed(() => {
  const rows = sortDisruptions(props.app.disruptions.value);
  return kindFilter.value
    ? rows.filter((row) => row.kind === kindFilter.value)
    : rows;
});
const shown = computed(() =>
  showAll.value ? sorted.value : sorted.value.slice(0, LIST_LIMIT),
);

function toggleKind(kind) {
  kindFilter.value = kindFilter.value === kind ? null : kind;
  showAll.value = false;
}

// "Show on the map": plain names for the layers that matter for freight.
const mainRows = computed(() =>
  MAIN_LAYERS.map((entry) => {
    if (entry.kind) {
      return {
        ...entry,
        badge: KIND_ICONS[entry.kind],
        title: t(entry.title),
        subtitle: t(entry.subtitle),
        on: autobahnOn.value && props.app.kindVisible(entry.kind),
        disabled: !autobahnOn.value,
        note: autobahnOn.value ? '' : t('Turn on Autobahn disruptions first'),
      };
    }
    const layer = props.app.layerById(entry.id);
    if (!layer) return null;
    const needsKey = layer.stats?.keyRequired === true;
    return {
      ...entry,
      badge: layerIcon(entry.id),
      title: t(entry.title),
      subtitle: t(entry.subtitle),
      on: layer.enabled === true,
      disabled: needsKey && !layer.enabled,
      note: needsKey ? t('Needs a free key — open Settings') : '',
    };
  }).filter(Boolean),
);

function setMain(row, on) {
  if (row.kind) props.app.setKindVisible(row.kind, on);
  else props.app.setLayer(row.id, on);
}

// "More on the map": every other layer, under its own name.
const mainIds = new Set(MAIN_LAYERS.map((entry) => entry.id).filter(Boolean));
const moreRows = computed(() =>
  props.app.layers.value
    .filter(
      (layer) =>
        layer.showInTogglePanel &&
        !mainIds.has(layer.id) &&
        !HIDDEN_FROM_MORE.has(layer.id),
    )
    .map((layer) => ({
      id: layer.id,
      badge: layerIcon(layer.id),
      title: layerNameForId(layer.id) || layer.name,
      on: layer.enabled === true,
      needsKey: layer.stats?.keyRequired === true,
    }))
    .sort((a, b) => a.title.localeCompare(b.title)),
);
const moreOnCount = computed(
  () => moreRows.value.filter((row) => row.on).length,
);

const tools = computed(() => [
  {
    id: 'chat',
    ...TOOL_ICONS.chat,
    title: t('Ask Nadelöhr'),
    subtitle: t('Ask about traffic in plain words'),
    action: props.app.openChat,
  },
  {
    id: 'cameras',
    ...TOOL_ICONS.cameras,
    title: t('Traffic cameras'),
    subtitle: t('Live road cameras near you'),
    action: props.app.openCameras,
  },
  {
    id: 'street',
    ...TOOL_ICONS.street,
    title: t('Street view'),
    subtitle: t('Look around the middle of the map'),
    action: props.app.openStreetView,
  },
  {
    id: 'share',
    ...TOOL_ICONS.share,
    title: t('Share this view'),
    subtitle: t('Copy a link to what you see'),
    action: props.app.share,
  },
]);
</script>

<template>
  <div class="flex flex-col gap-5">
    <!-- Right now -->
    <section :aria-labelledby="'nd-now'">
      <div class="mb-2 px-1">
        <h2 id="nd-now" class="text-title2">{{ t('Autobahn right now') }}</h2>
        <p v-if="autobahnOn" class="text-caption text-muted-foreground">
          {{ t('Updates every 5 min') }}
        </p>
      </div>

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
          class="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
          role="group"
          :aria-label="t('Filter by type')"
        >
          <button
            v-for="item in summary"
            :key="item.kind"
            type="button"
            class="press flex shrink-0 cursor-pointer items-center gap-2 rounded-full bg-card px-3 py-2 text-callout font-semibold transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
            :class="
              kindFilter === item.kind
                ? 'ring-2 ring-primary'
                : 'hover:bg-accent'
            "
            :aria-pressed="String(kindFilter === item.kind)"
            @click="toggleKind(item.kind)"
          >
            <IconBadge
              :icon="KIND_ICONS[item.kind].icon"
              :color="KIND_ICONS[item.kind].color"
              size="xs"
            />
            {{ disruptionCountLabel(item.kind, item.count) }}
          </button>
        </div>

        <p
          v-if="!sorted.length"
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
          v-if="sorted.length > shown.length"
          type="button"
          class="mt-2 w-full cursor-pointer rounded-full py-2 text-callout font-semibold text-primary hover:bg-accent"
          @click="showAll = true"
        >
          {{ tn(sorted.length, 'Show all {count}', 'Show all {count}') }}
        </button>
      </template>
    </section>

    <!-- On the map -->
    <section aria-labelledby="nd-map">
      <h2 id="nd-map" class="mb-2 px-1 text-title2">{{
        t('Show on the map')
      }}</h2>
      <ul class="overflow-hidden rounded-group bg-card">
        <li v-for="(row, index) in mainRows" :key="row.id || row.kind">
          <Separator v-if="index" class="ms-14 w-auto" />
          <label
            class="flex cursor-pointer items-center gap-3 px-3 py-2.5"
            :class="row.disabled ? 'opacity-60' : ''"
          >
            <IconBadge :icon="row.badge.icon" :color="row.badge.color" />
            <span class="min-w-0 flex-1">
              <span class="block text-headline">{{ row.title }}</span>
              <span class="block text-subhead text-muted-foreground">{{
                row.note || row.subtitle
              }}</span>
            </span>
            <Switch
              :model-value="row.on"
              :disabled="row.disabled"
              :aria-label="row.title"
              @update:model-value="(on) => setMain(row, on)"
            />
          </label>
        </li>
      </ul>

      <button
        type="button"
        class="mt-2 flex w-full cursor-pointer items-center gap-2 rounded-group bg-card px-3 py-3 text-start outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring"
        :aria-expanded="String(moreOpen)"
        @click="moreOpen = !moreOpen"
      >
        <IconBadge
          :icon="TOOL_ICONS.more.icon"
          :color="TOOL_ICONS.more.color"
          size="sm"
        />
        <span class="flex-1 text-headline">{{ t('More on the map') }}</span>
        <span
          v-if="moreOnCount"
          class="text-subhead font-semibold text-primary"
          >{{ tn(moreOnCount, '{count} on', '{count} on') }}</span
        >
        <PhCaretDown
          weight="bold"
          class="size-4 text-muted-foreground transition-transform"
          :class="moreOpen ? 'rotate-180' : ''"
          aria-hidden="true"
        />
      </button>
      <ul v-if="moreOpen" class="mt-2 overflow-hidden rounded-group bg-card">
        <li v-for="(row, index) in moreRows" :key="row.id">
          <Separator v-if="index" class="ms-13 w-auto" />
          <label class="flex cursor-pointer items-center gap-3 px-3 py-2">
            <IconBadge
              :icon="row.badge.icon"
              :color="row.badge.color"
              size="sm"
            />
            <span class="min-w-0 flex-1 truncate text-body">{{
              row.title
            }}</span>
            <span
              v-if="row.needsKey && !row.on"
              class="text-caption text-muted-foreground"
              >{{ t('Needs setup') }}</span
            >
            <Switch
              :model-value="row.on"
              :aria-label="row.title"
              @update:model-value="(on) => app.setLayer(row.id, on)"
            />
          </label>
        </li>
      </ul>
    </section>

    <!-- Tools -->
    <section aria-labelledby="nd-tools">
      <h2 id="nd-tools" class="mb-2 px-1 text-title2">{{ t('Tools') }}</h2>
      <div class="grid grid-cols-2 gap-2">
        <button
          v-for="tool in tools"
          :key="tool.id"
          type="button"
          class="press flex cursor-pointer flex-col items-start gap-2 rounded-group bg-card p-3 text-start outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring"
          @click="tool.action()"
        >
          <IconBadge
            :icon="tool.icon"
            :color="tool.color"
            size="lg"
            shape="squircle"
          />
          <span>
            <span class="block text-headline">{{ tool.title }}</span>
            <span class="block text-caption text-muted-foreground">{{
              tool.subtitle
            }}</span>
          </span>
        </button>
      </div>
    </section>

    <!-- Settings -->
    <section class="flex flex-col gap-2 pb-2">
      <label
        class="flex items-center justify-between gap-3 rounded-group bg-card px-3 py-2.5"
      >
        <span class="flex items-center gap-3">
          <IconBadge
            :icon="TOOL_ICONS.language.icon"
            :color="TOOL_ICONS.language.color"
            size="sm"
          />
          <span class="text-headline">{{ t('Language') }}</span>
        </span>
        <select
          class="cursor-pointer rounded-full bg-input px-3 py-1.5 text-callout outline-none"
          :value="app.locale.value"
          :aria-label="t('Language')"
          @change="app.setLocale($event.target.value)"
        >
          <option v-for="item in app.locales" :key="item.id" :value="item.id">{{
            item.name
          }}</option>
        </select>
      </label>
      <button
        type="button"
        class="flex cursor-pointer items-center gap-3 rounded-group bg-card px-3 py-2.5 text-start hover:bg-accent"
        @click="app.openSettings()"
      >
        <IconBadge
          :icon="TOOL_ICONS.sources.icon"
          :color="TOOL_ICONS.sources.color"
          size="sm"
        />
        <span class="flex-1 text-headline">{{
          t('Data sources and keys')
        }}</span>
        <PhCaretRight
          weight="bold"
          class="size-4 text-muted-foreground"
          aria-hidden="true"
        />
      </button>
      <p class="px-1 text-caption text-muted-foreground">
        {{
          t(
            'Nadelöhr shows public data for information only. Always follow road signs and official notices.',
          )
        }}
      </p>
    </section>
  </div>
</template>
