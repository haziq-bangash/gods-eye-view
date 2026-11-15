<script setup>
// One selected disruption, laid out like an Apple Maps place card: title and
// place, an action row, a facts row, then the plain explanation and the
// official notice.
import {
  PhClock,
  PhGauge,
  PhMapPin,
  PhRuler,
  PhShareNetwork,
  PhTimer,
  PhX,
} from '@phosphor-icons/vue';
import { t } from '../../i18n/index.js';
import Button from '../ui/Button.vue';
import Separator from '../ui/Separator.vue';
import { KIND_ICONS, SYSTEM_COLORS } from '../icons.js';
import IconBadge from './IconBadge.vue';
import RoadShield from './RoadShield.vue';

const FACT_ICONS = {
  delay: { icon: PhTimer, color: SYSTEM_COLORS.orange },
  length: { icon: PhRuler, color: SYSTEM_COLORS.blue },
  speed: { icon: PhGauge, color: SYSTEM_COLORS.green },
  since: { icon: PhClock, color: SYSTEM_COLORS.purple },
};

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
        :icon="KIND_ICONS[card.kind]?.icon"
        :color="KIND_ICONS[card.kind]?.color"
        size="lg"
      />
      <div class="min-w-0 flex-1">
        <h2 class="text-title">
          {{ card.title }}
        </h2>
        <p
          class="mt-1 flex items-center gap-1.5 text-body text-muted-foreground"
        >
          <RoadShield :road="card.road" />
          <span class="truncate">{{ card.place }}</span>
        </p>
        <p
          v-if="card.direction"
          class="truncate text-subhead text-muted-foreground"
        >
          {{ t('Direction') }}: {{ card.direction }}
        </p>
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

    <dl
      v-if="card.facts.length"
      class="grid gap-2"
      :style="{
        gridTemplateColumns: `repeat(${card.facts.length}, minmax(0, 1fr))`,
      }"
    >
      <div
        v-for="fact in card.facts"
        :key="fact.label"
        class="flex flex-col items-center gap-1 rounded-group bg-muted px-2 py-2.5 text-center"
      >
        <IconBadge
          v-if="FACT_ICONS[fact.key]"
          :icon="FACT_ICONS[fact.key].icon"
          :color="FACT_ICONS[fact.key].color"
          size="sm"
        />
        <dt class="text-caption font-medium text-muted-foreground">
          {{ fact.label }}
        </dt>
        <dd
          class="mt-0.5 text-headline"
          :class="fact.emphasis ? 'text-primary' : ''"
        >
          {{ fact.value }}
        </dd>
      </div>
    </dl>

    <p class="text-body">{{ card.hint }}</p>

    <template v-if="card.details.length">
      <Separator />
      <section>
        <h3 class="text-subhead font-semibold text-muted-foreground">
          {{ t('Official notice (German)') }}
        </h3>
        <p
          v-for="(line, index) in card.details"
          :key="index"
          class="mt-1 text-callout"
          lang="de"
        >
          {{ line }}
        </p>
      </section>
    </template>

    <p class="text-caption text-muted-foreground">
      {{
        t(
          'Source: Die Autobahn GmbH des Bundes. For information only, always follow road signs.',
        )
      }}
    </p>
  </article>
</template>
