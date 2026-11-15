<script setup>
// From the second visit: a small card offering to add Nadelöhr to the home
// screen. Chrome and Edge install it directly; on iPhone the card shows
// the Share → "Add to Home Screen" steps. "Not now" hides it for good.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import {
  PhDeviceMobile,
  PhExport,
  PhPlusSquare,
  PhX,
} from '@phosphor-icons/vue';
import { t } from '../../i18n/index.js';
import {
  deferredInstall,
  installMemory,
  installed,
  isIosSafari,
  isStandalone,
  rememberInstall,
} from '../install.js';
import BrandMark from './BrandMark.vue';

const DELAY_MS = 15_000;
const memory = installMemory();
const ios = isIosSafari();
const due = ref(false);
const dismissed = ref(memory.dismissed);
let timer = null;

const introDone = () => {
  try {
    return globalThis.localStorage?.getItem('nadeloehr.intro.v1') === 'done';
  } catch {
    return true;
  }
};

onMounted(() => {
  if (isStandalone() || memory.dismissed) return;
  rememberInstall({ ...memory, visits: memory.visits + 1 });
  if (memory.visits + 1 < 2) return;
  timer = setTimeout(() => (due.value = introDone()), DELAY_MS);
});
onBeforeUnmount(() => clearTimeout(timer));

const show = computed(
  () =>
    due.value &&
    !dismissed.value &&
    !installed.value &&
    (Boolean(deferredInstall.value) || ios),
);

function dismiss() {
  dismissed.value = true;
  rememberInstall({ ...installMemory(), dismissed: true });
}
async function install() {
  const prompt = deferredInstall.value;
  if (!prompt) return;
  deferredInstall.value = null;
  prompt.prompt();
  const choice = await prompt.userChoice.catch(() => null);
  if (choice?.outcome === 'accepted') installed.value = true;
  dismiss();
}
</script>

<template>
  <Transition
    enter-from-class="opacity-0 translate-y-2"
    enter-active-class="transition duration-300 ease-out"
    leave-to-class="opacity-0 translate-y-2"
    leave-active-class="transition duration-200 ease-in"
  >
    <aside
      v-if="show"
      class="glass-strong pointer-events-auto absolute inset-x-3 top-[calc(max(0.75rem,env(safe-area-inset-top))+150px)] z-30 rounded-[22px] p-3.5 sm:inset-x-auto sm:top-auto sm:bottom-6 sm:left-1/2 sm:w-[360px] sm:-translate-x-1/2 lg:left-[calc(50%+208px)]"
      role="dialog"
      :aria-label="t('Add Nadelöhr to your home screen')"
    >
      <div class="flex items-start gap-3">
        <span
          class="grid size-11 shrink-0 place-items-center rounded-[12px] bg-[#351e1c] text-[#f5f4ed]"
          aria-hidden="true"
        >
          <BrandMark class="size-7" />
        </span>
        <div class="min-w-0 flex-1">
          <p class="text-headline">
            {{ t('Add Nadelöhr to your home screen') }}
          </p>
          <p class="mt-0.5 text-subhead text-muted-foreground">
            {{
              t(
                'Opens full screen in one tap, like an app. No store, no account.',
              )
            }}
          </p>
          <p
            v-if="!deferredInstall && ios"
            class="mt-2 flex items-start gap-1.5 text-subhead"
          >
            <span class="flex shrink-0 gap-0.5 pt-0.5" aria-hidden="true">
              <PhExport class="size-4 text-primary-ink" />
              <PhPlusSquare class="size-4 text-primary-ink" />
            </span>
            {{ t('In Safari, tap Share, then “Add to Home Screen”.') }}
          </p>
        </div>
        <button
          type="button"
          class="grid size-7 shrink-0 cursor-pointer place-items-center rounded-full text-muted-foreground outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring"
          :aria-label="t('Not now')"
          @click="dismiss"
        >
          <PhX weight="bold" class="size-3.5" />
        </button>
      </div>
      <div v-if="deferredInstall" class="mt-3 flex justify-end gap-2">
        <button
          type="button"
          class="nd-tap cursor-pointer rounded-full px-3 py-2 text-callout font-semibold text-muted-foreground outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring"
          @click="dismiss"
        >
          {{ t('Not now') }}
        </button>
        <button
          type="button"
          class="nd-tap flex cursor-pointer items-center gap-1.5 rounded-full bg-primary-fill px-4 py-2 text-callout font-semibold text-primary-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
          @click="install"
        >
          <PhDeviceMobile weight="bold" class="size-4" aria-hidden="true" />
          {{ t('Install') }}
        </button>
      </div>
    </aside>
  </Transition>
</template>
