<script setup>
// The round button stack on the right edge, as in Apple Maps: map style,
// 3D, my location, then zoom and a compass that appears once the map turns.
// Each glyph has its own colour; an active control lights up as a glass lens.
import {
  PhCompass,
  PhCube,
  PhMapTrifold,
  PhMinus,
  PhNavigationArrow,
  PhPlus,
} from '@phosphor-icons/vue';
import { t } from '../../i18n/index.js';
import { SYSTEM_COLORS as C } from '../icons.js';
import IconBadge from './IconBadge.vue';
import Tip from './Tip.vue';

const props = defineProps({
  headingDeg: { type: Number, default: 0 },
  tilted: { type: Boolean, default: false },
  locating: { type: Boolean, default: false },
});
defineEmits([
  'map-style',
  'toggle-3d',
  'locate',
  'zoom-in',
  'zoom-out',
  'north',
]);

const stackButton =
  'grid size-11 cursor-pointer place-items-center text-foreground transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring outline-none active:scale-95';
const compassStyle = () => ({
  color: C.red,
  transform: `rotate(${-props.headingDeg}deg)`,
});
</script>

<template>
  <div class="flex flex-col items-end gap-3">
    <Tip :text="t('Point north')" side="left">
      <button
        v-if="Math.abs(headingDeg) > 2"
        type="button"
        class="glass grid size-11 cursor-pointer place-items-center rounded-full"
        :aria-label="t('Point north')"
        @click="$emit('north')"
      >
        <PhCompass class="size-5" :style="compassStyle()" weight="fill" />
      </button>
    </Tip>

    <div class="glass flex flex-col overflow-hidden rounded-full">
      <Tip :text="t('Map style')" side="left">
        <button
          type="button"
          :class="stackButton"
          :aria-label="t('Map style')"
          @click="$emit('map-style')"
        >
          <PhMapTrifold
            class="size-5"
            :style="{ color: C.indigo }"
            weight="fill"
          />
        </button>
      </Tip>
      <span class="mx-2.5 h-px bg-border" aria-hidden="true"></span>
      <Tip :text="tilted ? t('Flat view') : t('3D view')" side="left">
        <button
          type="button"
          :class="stackButton"
          :aria-label="tilted ? t('Flat view') : t('3D view')"
          :aria-pressed="String(tilted)"
          @click="$emit('toggle-3d')"
        >
          <IconBadge v-if="tilted" :icon="PhCube" :color="C.brand" size="sm" />
          <PhCube
            v-else
            class="nd-ink size-5"
            :style="{ '--ink': C.orange }"
            weight="fill"
          />
        </button>
      </Tip>
      <span class="mx-2.5 h-px bg-border" aria-hidden="true"></span>
      <Tip :text="t('Show my location')" side="left">
        <button
          type="button"
          :class="stackButton"
          :aria-label="t('Show my location')"
          @click="$emit('locate')"
        >
          <IconBadge
            v-if="locating"
            :icon="PhNavigationArrow"
            :color="C.blue"
            size="sm"
          />
          <PhNavigationArrow
            v-else
            class="size-5 -scale-x-100"
            :style="{ color: C.blue }"
            weight="fill"
          />
        </button>
      </Tip>
    </div>

    <div class="glass flex flex-col overflow-hidden rounded-full max-sm:hidden">
      <Tip :text="t('Zoom in')" side="left">
        <button
          type="button"
          :class="stackButton"
          :aria-label="t('Zoom in')"
          @click="$emit('zoom-in')"
        >
          <PhPlus
            class="nd-ink size-5"
            :style="{ '--ink': C.gray }"
            weight="bold"
          />
        </button>
      </Tip>
      <span class="mx-2.5 h-px bg-border" aria-hidden="true"></span>
      <Tip :text="t('Zoom out')" side="left">
        <button
          type="button"
          :class="stackButton"
          :aria-label="t('Zoom out')"
          @click="$emit('zoom-out')"
        >
          <PhMinus
            class="nd-ink size-5"
            :style="{ '--ink': C.gray }"
            weight="bold"
          />
        </button>
      </Tip>
    </div>
  </div>
</template>
