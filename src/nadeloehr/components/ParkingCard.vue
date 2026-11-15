<script setup>
// One truck rest area: its spaces, facilities and whether a closure nearby
// may shut it or its access.
import { computed } from 'vue';
import { PhMapPin, PhShareNetwork, PhTruck, PhX } from '@phosphor-icons/vue';
import { formatNumber, t } from '../../i18n/index.js';
import Button from '../ui/Button.vue';
import { SYSTEM_COLORS } from '../icons.js';
import IconBadge from './IconBadge.vue';
import RoadShield from './RoadShield.vue';

const props = defineProps({
  row: { type: Object, required: true },
  affected: { type: Boolean, default: false },
});
defineEmits(['close', 'focus', 'share']);

const color = computed(() =>
  props.affected ? SYSTEM_COLORS.red : SYSTEM_COLORS.blue,
);
</script>

<template>
  <article class="flex flex-col gap-4" :aria-label="row.name">
    <header class="flex items-start gap-3">
      <IconBadge class="mt-1" :icon="PhTruck" :color="color" size="lg" />
      <div class="min-w-0 flex-1">
        <h2 class="text-title">{{ row.name || t('Rest area') }}</h2>
        <p
          class="mt-1 flex items-center gap-1.5 text-body text-muted-foreground"
        >
          <RoadShield :road="row.road" />
          {{ t('Truck rest area') }}
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

    <dl class="grid grid-cols-2 gap-2">
      <div class="rounded-group bg-muted px-3 py-2.5 text-center">
        <dt class="text-caption font-medium text-muted-foreground">
          {{ t('Truck spaces') }}
        </dt>
        <dd class="nd-figure text-[30px] leading-none">
          {{ formatNumber(row.lorrySpaces) }}
        </dd>
      </div>
      <div class="rounded-group bg-muted px-3 py-2.5 text-center">
        <dt class="text-caption font-medium text-muted-foreground">
          {{ t('Car spaces') }}
        </dt>
        <dd class="nd-figure text-[30px] leading-none">
          {{ formatNumber(row.carSpaces) }}
        </dd>
      </div>
    </dl>

    <section class="rounded-group bg-card p-3">
      <p class="flex items-center gap-2 text-headline">
        <span
          class="size-2.5 shrink-0 rounded-full"
          :style="{ background: color }"
          aria-hidden="true"
        />
        {{
          row.blocked
            ? t('Closed')
            : affected
              ? t('Near an active closure')
              : t('No closure nearby')
        }}
      </p>
      <p class="mt-1 text-body">
        {{
          affected
            ? t(
                'A closure nearby or a closed exit may shut this rest area or its access. Plan another stop.',
              )
            : t(
                'Live occupancy is not published; at night most rest areas fill up early.',
              )
        }}
      </p>
    </section>

    <section v-if="row.features?.length">
      <h3 class="text-subhead font-semibold text-muted-foreground">
        {{ t('Facilities (German)') }}
      </h3>
      <ul class="mt-1 flex flex-wrap gap-1.5" lang="de">
        <li
          v-for="feature in row.features"
          :key="feature"
          class="rounded-full bg-muted px-2.5 py-1 text-caption"
        >
          {{ feature }}
        </li>
      </ul>
    </section>

    <p class="text-caption text-muted-foreground">
      {{ t('Source: Die Autobahn GmbH des Bundes.') }}
    </p>
  </article>
</template>
