<script setup>
// The rest of the home after today's corridors and disruptions: the river
// gauges, what is on the map, and a few tools. Written for someone who has
// never used a GIS.
import { computed, ref } from 'vue';
import { PhCaretDown, PhCaretRight } from '@phosphor-icons/vue';
import { t, tn } from '../../i18n/index.js';
import { layerNameForId } from '../../ui/layerNames.js';
import { MAIN_LAYERS, HIDDEN_FROM_MORE } from '../mapLayers.js';
import { gaugeStatus, levelText, riverName, trendText } from '../rivers.js';
import { gaugeColor } from '../../layers/riverLevels/records.js';
import { KIND_ICONS, TOOL_ICONS, layerIcon } from '../icons.js';
import IconBadge from './IconBadge.vue';
import Switch from '../ui/Switch.vue';
import Separator from '../ui/Separator.vue';
import SectionHeader from './SectionHeader.vue';
import { useCollapsed } from '../collapse.js';

const props = defineProps({
  app: { type: Object, required: true },
  /** Tools and settings live in the top bar (wide screens). */
  toolsInBar: { type: Boolean, default: false },
});
const riversSection = useCollapsed('rivers');
const mapSection = useCollapsed('map-layers');

const moreOpen = ref(false);

// Rivers: Kaub first, then the other gauges barge operators watch.
const riversOn = computed(
  () => props.app.layerById('river-levels')?.enabled === true,
);
const gaugeRows = computed(() =>
  props.app.gauges.value.filter((row) => row.key),
);

// "Show on the map": plain names for the layers that matter for freight.
const mainRows = computed(() =>
  MAIN_LAYERS.map((entry) => {
    if (entry.group === 'minor') {
      return {
        ...entry,
        badge: KIND_ICONS.roadworks,
        title: t(entry.title),
        subtitle: t(entry.subtitle),
        on: autobahnOn.value && props.app.minorOnMap.value,
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

const autobahnOn = computed(
  () => props.app.layerById('autobahn-traffic')?.enabled === true,
);

function setMain(row, on) {
  if (row.group === 'minor') props.app.setMinorOnMap(on);
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
    <!-- Rivers -->
    <section aria-labelledby="nd-rivers">
      <SectionHeader
        id="nd-rivers"
        :title="t('Rhine and Elbe')"
        :collapsed="riversSection.isCollapsed()"
        @toggle="riversSection.toggle"
      >
        <template #actions>
          <span
            v-if="riversOn && !riversSection.isCollapsed()"
            class="shrink-0 text-caption text-muted-foreground"
            >{{ t('Water levels, updated every 15 min') }}</span
          >
        </template>
      </SectionHeader>
      <template v-if="!riversSection.isCollapsed()">
        <div
          v-if="!riversOn"
          class="flex items-center justify-between gap-3 rounded-group bg-card p-3"
        >
          <p class="text-body">{{ t('Water levels are hidden.') }}</p>
          <button
            type="button"
            class="cursor-pointer rounded-full bg-primary px-4 py-2 text-callout font-semibold text-primary-foreground"
            @click="app.setLayer('river-levels', true)"
          >
            {{ t('Show') }}
          </button>
        </div>

        <p
          v-else-if="!app.gauges.value.length"
          class="rounded-group bg-card p-3 text-body text-muted-foreground"
        >
          {{ t('Loading water levels…') }}
        </p>

        <template v-else>
          <ul
            v-if="gaugeRows.length"
            class="mt-2 overflow-hidden rounded-group bg-card"
            :aria-label="t('River gauges')"
          >
            <li v-for="(row, index) in gaugeRows" :key="row.stableId">
              <Separator v-if="index" class="ms-9 w-auto" />
              <button
                type="button"
                class="press flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-start outline-none hover:bg-accent focus-visible:bg-accent"
                @click="app.showGaugeOnMap(row)"
              >
                <span
                  class="size-3 shrink-0 rounded-full"
                  :style="{ background: gaugeColor(row) }"
                  aria-hidden="true"
                />
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-headline">{{
                    row.name
                  }}</span>
                  <span
                    class="block truncate text-subhead text-muted-foreground"
                    >{{ riverName(row.water) }} ·
                    {{ gaugeStatus(row).label }}</span
                  >
                </span>
                <span class="shrink-0 text-end">
                  <span class="block text-headline">{{
                    levelText(row.levelCm)
                  }}</span>
                  <span
                    v-if="trendText(row.trendCm)"
                    class="block text-caption text-muted-foreground"
                    >{{ trendText(row.trendCm) }}</span
                  >
                </span>
              </button>
            </li>
          </ul>
        </template>
      </template>
    </section>

    <!-- On the map -->
    <section aria-labelledby="nd-map">
      <SectionHeader
        id="nd-map"
        :title="t('Show on the map')"
        :collapsed="mapSection.isCollapsed()"
        @toggle="mapSection.toggle"
      />
      <template v-if="!mapSection.isCollapsed()">
        <ul class="overflow-hidden rounded-group bg-card">
          <li v-for="(row, index) in mainRows" :key="row.id || row.group">
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
      </template>
    </section>

    <!-- Tools -->
    <section v-if="!toolsInBar" aria-labelledby="nd-tools">
      <h2 id="nd-tools" class="nd-eyebrow mb-2 px-1">{{ t('Tools') }}</h2>
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
    <section v-if="!toolsInBar" class="flex flex-col gap-2 pb-2">
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
    </section>
    <p class="px-1 pb-2 text-caption text-muted-foreground">
      {{
        t(
          'Nadelöhr shows public data for information only. Always follow road signs and official notices.',
        )
      }}
    </p>
  </div>
</template>
