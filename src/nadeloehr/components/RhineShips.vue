<script setup>
// Live ships on the Middle Rhine (Bingen–Koblenz): how many are under way
// and how many are stopped, next to the Kaub level that limits them.
import { PhBoat } from '@phosphor-icons/vue';
import { formatNumber, t } from '../../i18n/index.js';
import InfoTip from './InfoTip.vue';

defineProps({
  /** { total, moving, stopped } from rhineShips.js, or null. */
  ships: { type: Object, default: null },
});
defineEmits(['show']);
</script>

<template>
  <div
    v-if="ships && ships.total"
    class="flex items-start gap-2 rounded-[14px] bg-muted px-3 py-2.5"
  >
    <PhBoat class="mt-0.5 size-4 shrink-0 text-[#0062cc]" aria-hidden="true" />
    <div class="min-w-0 flex-1">
      <p class="text-caption font-semibold text-muted-foreground">
        {{ t('Middle Rhine now (Bingen–Koblenz)') }}
      </p>
      <p class="text-callout">
        {{
          t('{moving} ships under way, {stopped} stopped', {
            moving: formatNumber(ships.moving),
            stopped: formatNumber(ships.stopped),
          })
        }}
      </p>
      <button
        type="button"
        class="mt-0.5 cursor-pointer text-callout font-semibold text-primary-ink hover:underline"
        @click="$emit('show')"
      >
        {{ t('Show ships') }}
      </button>
    </div>
    <InfoTip
      :label="t('the ship count')"
      :text="
        t(
          'Live AIS positions from the last 30 minutes between Bingen and Koblenz, where Kaub sets how much a barge can carry. Stopped includes ships moored at a quay or anchored for the night, so it hints at waiting traffic rather than counting a queue.',
        )
      "
    />
  </div>
</template>
