<script setup>
// Truck driving bans for the chosen time: a card when one applies (Sunday,
// a holiday, a summer Saturday), else one quiet line with the next one.
import { PhTruck } from '@phosphor-icons/vue';
import { t } from '../../i18n/index.js';
import { BAN_EXPLAIN } from '../bans.js';
import { SYSTEM_COLORS } from '../icons.js';
import IconBadge from './IconBadge.vue';
import InfoTip from './InfoTip.vue';
import Tip from './Tip.vue';

const props = defineProps({
  /** { active: [...], next } from banNotice(). */
  bans: { type: Object, required: true },
  horizon: { type: String, default: 'now' },
});

function title(ban) {
  if (props.horizon === 'tonight') return t('Truck ban tonight');
  if (props.horizon === 'tomorrow') return t('Truck ban tomorrow');
  return t('Truck ban in force until {time}', { time: ban.until });
}
</script>

<template>
  <section
    v-if="bans.active.length"
    class="flex flex-col gap-2 rounded-[20px] border border-[color-mix(in_oklch,#ff3b30_30%,transparent)] bg-card p-3.5"
    :aria-label="t('Truck driving ban')"
  >
    <div
      v-for="ban in bans.active"
      :key="ban.date"
      class="flex flex-wrap items-start gap-3"
    >
      <IconBadge :icon="PhTruck" :color="SYSTEM_COLORS.red" />
      <div class="min-w-0 flex-1">
        <p class="flex items-center gap-1 text-headline">
          {{ title(ban) }}
        </p>
        <p class="nd-ink text-subhead font-semibold" style="--ink: #ff3b30">
          {{ ban.name }}
        </p>
        <Tip :text="ban.stateNames">
          <p
            class="mt-0.5 text-callout text-muted-foreground"
            :tabindex="ban.stateNames ? 0 : undefined"
          >
            {{ ban.body }}
          </p>
        </Tip>
      </div>
      <InfoTip :label="t('Truck driving ban')" :text="t(BAN_EXPLAIN)" />
    </div>
  </section>
  <p
    v-else-if="bans.next"
    class="flex flex-wrap items-center gap-x-1.5 px-1 text-subhead text-muted-foreground"
  >
    <PhTruck class="size-4 shrink-0" aria-hidden="true" />
    <Tip :text="bans.next.stateNames">
      <span
        class="min-w-0 flex-1"
        :tabindex="bans.next.stateNames ? 0 : undefined"
      >
        {{
          t('Next truck ban: {when} ({name})', {
            when: bans.next.when,
            name: bans.next.label,
          })
        }}
      </span>
    </Tip>
    <InfoTip :label="t('Truck driving ban')" :text="t(BAN_EXPLAIN)" />
  </p>
</template>
