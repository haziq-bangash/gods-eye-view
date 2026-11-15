<script setup>
// The one message that matters most today, in plain words.
import { PhCaretDown } from '@phosphor-icons/vue';
import { t } from '../../i18n/index.js';
import { useCollapsed } from '../collapse.js';

const card = useCollapsed('headline');

defineProps({
  headline: { type: Object, required: true },
});
defineEmits(['open']);
</script>

<template>
  <div class="relative">
    <button
      type="button"
      class="press relative block w-full cursor-pointer overflow-hidden rounded-[20px] border bg-card p-4 pe-11 text-start outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
      :class="
        headline.tone === 'calm'
          ? 'border-[color-mix(in_oklch,#34c759_30%,transparent)]'
          : 'border-primary/30'
      "
      @click="$emit('open', headline)"
    >
      <span
        class="pointer-events-none absolute inset-0"
        :class="
          headline.tone === 'calm'
            ? 'bg-[linear-gradient(135deg,rgb(52_199_89/0.12),transparent_70%)]'
            : 'bg-[linear-gradient(135deg,color-mix(in_oklch,var(--primary)_16%,transparent),transparent_70%)]'
        "
        aria-hidden="true"
      />
      <span
        class="relative flex items-center gap-1.5 text-caption font-bold tracking-wider uppercase"
        :class="headline.tone === 'calm' ? 'text-[#248a3d]' : 'text-primary'"
      >
        <span class="size-1.5 rounded-full bg-current" aria-hidden="true" />
        {{ t('What matters today') }}
      </span>
      <span class="relative mt-1.5 block text-title2">{{
        headline.title
      }}</span>
      <span
        v-if="!card.isCollapsed()"
        class="relative mt-1 block text-callout text-muted-foreground"
        >{{ headline.body }}</span
      >
    </button>
    <button
      type="button"
      class="absolute top-3 right-3 grid size-7 cursor-pointer place-items-center rounded-full text-muted-foreground hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring outline-none"
      :aria-label="card.isCollapsed() ? t('Expand') : t('Collapse')"
      :aria-expanded="String(!card.isCollapsed())"
      @click="card.toggle"
    >
      <PhCaretDown
        weight="bold"
        class="size-3.5 transition-transform"
        :class="card.isCollapsed() ? '' : 'rotate-180'"
      />
    </button>
  </div>
</template>
