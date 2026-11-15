<script setup>
// "Alert me": a switch under the pinned roads and places that sends a phone
// or desktop notification when one of them gets a new closure (and, if
// chosen, when Kaub crosses a low-water line). Hidden when the server has
// no alert setup; explains itself where the browser cannot do it.
import { computed } from 'vue';
import { PhBell, PhBellSlash } from '@phosphor-icons/vue';
import { t } from '../../i18n/index.js';
import { useAlerts } from '../alerts.js';
import { SYSTEM_COLORS } from '../icons.js';
import IconBadge from './IconBadge.vue';
import InfoTip from './InfoTip.vue';
import Switch from '../ui/Switch.vue';

const props = defineProps({
  /** Whether any road or place is pinned (alerts follow the pins). */
  hasPins: { type: Boolean, default: false },
});
const alerts = useAlerts();
const on = computed(() => alerts.status.value === 'on');

const note = computed(() => {
  switch (alerts.status.value) {
    case 'needs-install':
      return t(
        'On iPhone and iPad, add Nadelöhr to the Home Screen first (Share, then “Add to Home Screen”), then turn alerts on there.',
      );
    case 'unsupported':
      return t('This browser cannot show alerts.');
    case 'blocked':
      return t(
        'Notifications are blocked for this site. Allow them in the browser settings to turn alerts on.',
      );
    case 'error':
      return t('Alerts could not be turned on. Try again.');
    default:
      if (on.value && !props.hasPins)
        return t('Pin a road or place to get alerts for it.');
      return on.value
        ? t('Checked every 15 minutes. New closures arrive as a notification.')
        : t(
            'Get a notification when a pinned road or place gets a new closure.',
          );
  }
});

function toggle(next) {
  if (next) alerts.enable();
  else alerts.disable();
}
</script>

<template>
  <div
    v-if="!['checking', 'unavailable'].includes(alerts.status.value)"
    class="mt-2 rounded-group bg-card px-3.5 py-3"
  >
    <div class="flex items-center gap-3">
      <IconBadge
        :icon="on ? PhBell : PhBellSlash"
        :color="on ? SYSTEM_COLORS.red : SYSTEM_COLORS.gray"
        size="sm"
      />
      <div class="min-w-0 flex-1">
        <p id="nd-alerts-label" class="text-headline">
          {{ t('Alerts') }}
        </p>
        <p class="text-subhead text-muted-foreground">{{ note }}</p>
      </div>
      <InfoTip
        :label="t('Alerts')"
        :text="
          t(
            'A check runs every 15 minutes against the official Autobahn closures and the Kaub gauge, and sends a notification for anything new on your pins. Your pins and this browser’s push address are stored for that, with no name or account; turning alerts off deletes them.',
          )
        "
      />
      <Switch
        v-if="['off', 'on', 'error'].includes(alerts.status.value)"
        :model-value="on"
        :disabled="alerts.busy.value"
        aria-labelledby="nd-alerts-label"
        @update:model-value="toggle"
      />
    </div>
    <label
      v-if="on"
      class="mt-2.5 flex cursor-pointer items-center gap-2 ps-10 text-callout"
    >
      <input
        type="checkbox"
        class="size-4 accent-[var(--primary-fill)]"
        :checked="alerts.kaub.value"
        @change="alerts.setKaub($event.target.checked)"
      />
      {{ t('Also when Kaub crosses a low-water line') }}
    </label>
  </div>
</template>
