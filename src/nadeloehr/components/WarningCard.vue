<script setup>
// One DWD warning: what it is in plain words, when, what it means for a
// truck, then the official German text.
import { PhMapPin, PhShareNetwork, PhX } from '@phosphor-icons/vue';
import { t } from '../../i18n/index.js';
import Button from '../ui/Button.vue';
import Separator from '../ui/Separator.vue';
import { KIND_ICONS } from '../icons.js';
import IconBadge from './IconBadge.vue';

defineProps({
  card: { type: Object, required: true },
});
defineEmits(['close', 'focus', 'share']);
</script>

<template>
  <article class="flex flex-col gap-4" :aria-label="card.title">
    <header class="flex items-start gap-3">
      <IconBadge
        class="mt-1"
        :icon="KIND_ICONS.warning.icon"
        :color="card.color"
        size="lg"
      />
      <div class="min-w-0 flex-1">
        <h2 class="text-title">{{ card.title }}</h2>
        <p class="mt-1 text-body text-muted-foreground">{{ card.when }}</p>
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
      <Button size="lg" @click="$emit('focus')"
        ><PhMapPin weight="fill" class="size-4" />{{ t('Show on map') }}</Button
      >
      <Button variant="secondary" size="lg" @click="$emit('share')"
        ><PhShareNetwork weight="fill" class="size-4" />{{ t('Share') }}</Button
      >
    </div>

    <section class="rounded-group bg-card p-3">
      <p class="flex items-center gap-2 text-headline">
        <span
          class="size-2.5 shrink-0 rounded-full"
          :style="{ background: card.color }"
          aria-hidden="true"
        />
        {{ card.level }}
      </p>
      <p class="mt-1 text-body">{{ card.hint }}</p>
    </section>

    <template v-if="card.headline || card.description">
      <Separator />
      <section lang="de">
        <h3 class="text-subhead font-semibold text-muted-foreground">
          {{ t('Official warning (German)') }}
        </h3>
        <p v-if="card.headline" class="mt-1 text-callout font-semibold">
          {{ card.headline }}
        </p>
        <p v-if="card.description" class="mt-1 text-callout">
          {{ card.description }}
        </p>
        <p
          v-if="card.instruction"
          class="mt-1 text-callout whitespace-pre-line text-muted-foreground"
        >
          {{ card.instruction }}
        </p>
      </section>
    </template>

    <p class="text-caption text-muted-foreground">
      {{ t('Source: Deutscher Wetterdienst (CC BY 4.0).') }}
    </p>
  </article>
</template>
