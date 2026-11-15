<script setup>
// The tools beside the search on wide screens: assistant, cameras, street
// view, share, language and data settings, as one glass row of icons.
import { computed } from 'vue';
import { t } from '../../i18n/index.js';
import { TOOL_ICONS } from '../icons.js';
import IconBadge from './IconBadge.vue';

const props = defineProps({
  app: { type: Object, required: true },
});

const tools = computed(() => [
  {
    id: 'chat',
    ...TOOL_ICONS.chat,
    label: t('Ask Nadelöhr'),
    action: props.app.openChat,
  },
  {
    id: 'cameras',
    ...TOOL_ICONS.cameras,
    label: t('Traffic cameras'),
    action: props.app.openCameras,
  },
  {
    id: 'street',
    ...TOOL_ICONS.street,
    label: t('Street view'),
    action: props.app.openStreetView,
  },
  {
    id: 'share',
    ...TOOL_ICONS.share,
    label: t('Share this view'),
    action: props.app.share,
  },
  {
    id: 'sources',
    ...TOOL_ICONS.sources,
    label: t('Data sources and keys'),
    action: props.app.openSettings,
  },
]);
const localeCode = computed(() =>
  String(props.app.locale.value || 'en')
    .slice(0, 2)
    .toUpperCase(),
);
</script>

<template>
  <div
    class="glass pointer-events-auto flex h-11 shrink-0 items-center gap-0.5 rounded-full px-1.5"
    role="toolbar"
    :aria-label="t('Tools')"
  >
    <button
      v-for="tool in tools"
      :key="tool.id"
      type="button"
      class="press grid size-9 cursor-pointer place-items-center rounded-full outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring"
      :title="tool.label"
      :aria-label="tool.label"
      @click="tool.action()"
    >
      <IconBadge :icon="tool.icon" :color="tool.color" size="sm" />
    </button>
    <label
      class="relative flex h-8 cursor-pointer items-center gap-1.5 rounded-full ps-1.5 pe-2.5 hover:bg-accent"
      :title="t('Language')"
    >
      <IconBadge
        :icon="TOOL_ICONS.language.icon"
        :color="TOOL_ICONS.language.color"
        size="sm"
      />
      <span class="text-caption font-bold" aria-hidden="true">{{
        localeCode
      }}</span>
      <select
        class="absolute inset-0 cursor-pointer opacity-0"
        :value="app.locale.value"
        :aria-label="t('Language')"
        @change="app.setLocale($event.target.value)"
      >
        <option v-for="item in app.locales" :key="item.id" :value="item.id">
          {{ item.name }}
        </option>
      </select>
    </label>
  </div>
</template>
