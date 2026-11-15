<script setup>
// One corridor's score taken apart: each part, its weight after rescaling,
// why it is what it is, and the formula, so a reader can challenge it.
import { PhX } from '@phosphor-icons/vue';
import { t } from '../../i18n/index.js';
import Button from '../ui/Button.vue';

defineProps({
  corridor: { type: Object, required: true },
  closable: { type: Boolean, default: true },
});
defineEmits(['close']);
</script>

<template>
  <article class="flex flex-col gap-3" :aria-label="corridor.title">
    <header class="flex items-start gap-3">
      <div class="min-w-0 flex-1">
        <p class="nd-eyebrow">{{ t('Corridor risk') }}</p>
        <h2 class="mt-1 text-title">{{ corridor.title }}</h2>
        <p class="text-subhead text-muted-foreground">
          {{ corridor.name
          }}<template v-if="corridor.roads.length">
            · {{ corridor.roads.join(' · ') }}</template
          ><template v-if="corridor.river"> · {{ corridor.river }}</template>
        </p>
      </div>
      <Button
        v-if="closable"
        variant="secondary"
        size="icon-sm"
        :aria-label="t('Close')"
        @click="$emit('close')"
        ><PhX weight="bold" class="size-4"
      /></Button>
    </header>

    <div class="flex items-baseline gap-2">
      <span class="nd-figure text-[56px] leading-[0.9]">{{
        corridor.score ?? '–'
      }}</span>
      <span class="text-title2 text-muted-foreground">/ 100</span>
    </div>
    <span
      class="nd-ink self-start rounded-full px-2.5 py-1 text-subhead font-bold"
      :style="{
        '--ink': corridor.color,
        background: `color-mix(in oklch, ${corridor.color} 14%, transparent)`,
      }"
      >● {{ corridor.levelLabel }}</span
    >

    <ul class="mt-1 flex flex-col gap-3">
      <li
        v-for="part in corridor.parts"
        :key="part.key"
        class="grid grid-cols-[1fr_auto] gap-x-2 gap-y-1"
        :class="part.available ? '' : 'opacity-55'"
      >
        <span class="text-callout font-semibold">{{ part.label }}</span>
        <span class="text-callout font-semibold tabular-nums">{{
          part.available ? part.value : t('Soon')
        }}</span>
        <span class="col-span-2 h-1.5 overflow-hidden rounded-full bg-muted">
          <span
            class="block h-full rounded-full"
            :style="{
              width: `${part.available ? part.value : 0}%`,
              background: part.color,
            }"
          />
        </span>
        <span class="col-span-2 text-caption text-muted-foreground">
          {{ part.why
          }}<template v-if="part.available">
            · {{ t('weight {weight}%', { weight: part.weight }) }}</template
          >
        </span>
      </li>
    </ul>

    <p class="text-caption text-muted-foreground">
      {{
        t(
          'R = 0.35·C + 0.20·P + 0.25·H + 0.20·W. Parts without data, and water on road-only corridors, are left out and the rest rescaled. A rough guide, not a delay forecast.',
        )
      }}
    </p>
  </article>
</template>
