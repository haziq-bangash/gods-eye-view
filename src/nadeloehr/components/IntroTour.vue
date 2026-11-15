<script setup>
// A three-step welcome on the first visit: what the numbers are, what the
// corridor score means, how to make it your own. Shown once per browser.
import { computed, ref } from 'vue';
import {
  PhChartBar,
  PhPushPinSimple,
  PhRoadHorizon,
} from '@phosphor-icons/vue';
import { t } from '../../i18n/index.js';
import { SYSTEM_COLORS } from '../icons.js';
import IconBadge from './IconBadge.vue';
import BrandMark from './BrandMark.vue';

const KEY = 'nadeloehr.intro.v1';
const seen = () => {
  try {
    return globalThis.localStorage?.getItem(KEY) === 'done';
  } catch {
    return false;
  }
};
const open = ref(!seen());
const step = ref(0);

const STEPS = computed(() => [
  {
    icon: PhChartBar,
    color: SYSTEM_COLORS.red,
    title: t('The numbers show today'),
    body: t(
      'The strip at the top counts closed roads, traffic warnings, the Rhine water level at Kaub and weather warnings. Tap one for the details, or switch to Tonight or Tomorrow to look ahead.',
    ),
  },
  {
    icon: PhRoadHorizon,
    color: SYSTEM_COLORS.orange,
    title: t('Corridors score the risk'),
    body: t(
      'Each freight corridor gets a score from 0 to 100 from closures, truck parking, water level and weather. Tap a corridor to see what drives it.',
    ),
  },
  {
    icon: PhPushPinSimple,
    color: SYSTEM_COLORS.blue,
    title: t('Make it yours'),
    body: t(
      'Pin an Autobahn or a town from search to follow it, or type a trip such as “Hamburg → München” to check your route.',
    ),
  },
]);

function finish() {
  open.value = false;
  try {
    globalThis.localStorage?.setItem(KEY, 'done');
  } catch {
    /* Private mode: it may show again next visit. */
  }
}
function next() {
  if (step.value < STEPS.value.length - 1) step.value += 1;
  else finish();
}
</script>

<template>
  <div
    v-if="open"
    class="pointer-events-auto fixed inset-0 z-50 grid place-items-center bg-black/25 p-4 backdrop-blur-[2px]"
    role="dialog"
    aria-modal="true"
    :aria-label="t('Welcome to Nadelöhr')"
    @keydown.esc="finish"
  >
    <div class="glass-strong w-full max-w-[380px] rounded-[28px] p-6">
      <div class="flex items-center gap-2">
        <BrandMark class="size-7 text-foreground" />
        <span class="text-headline font-bold" translate="no">Nadelöhr</span>
        <span class="ms-auto text-caption text-muted-foreground"
          >{{ step + 1 }} / {{ STEPS.length }}</span
        >
      </div>
      <div class="mt-5 flex items-start gap-3">
        <IconBadge
          :icon="STEPS[step].icon"
          :color="STEPS[step].color"
          size="lg"
        />
        <div class="min-w-0">
          <h2 class="text-title2">{{ STEPS[step].title }}</h2>
          <p class="mt-1.5 text-body text-muted-foreground">
            {{ STEPS[step].body }}
          </p>
        </div>
      </div>
      <div class="mt-6 flex items-center gap-2">
        <span class="flex gap-1.5" aria-hidden="true">
          <span
            v-for="(_, index) in STEPS"
            :key="index"
            class="size-1.5 rounded-full"
            :class="index === step ? 'bg-foreground' : 'bg-muted-foreground/40'"
          />
        </span>
        <button
          type="button"
          class="ms-auto cursor-pointer rounded-full px-3 py-2 text-callout font-semibold text-muted-foreground outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring"
          @click="finish"
        >
          {{ t('Skip') }}
        </button>
        <button
          type="button"
          class="cursor-pointer rounded-full bg-primary-fill px-4 py-2 text-callout font-semibold text-primary-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
          autofocus
          @click="next"
        >
          {{ step < STEPS.length - 1 ? t('Next') : t('Get started') }}
        </button>
      </div>
    </div>
  </div>
</template>
