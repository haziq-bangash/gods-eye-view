import { defineStore } from 'pinia';
import { computed, shallowRef } from 'vue';

/**
 * What the Nadelöhr shell reads from the running application: the services
 * it drives (published once the scene and tools exist), and the Autobahn
 * events and river gauges the layers hand over (their onRows/onSelect).
 */
export const useNadeloehrStore = defineStore('nadeloehr', () => {
  /**
   * @type {import('vue').ShallowRef<null | {
   *   viewer: object, styleManager: object, dataManager: object,
   *   mapStackController: object, placeSearch: object|null,
   *   run: (name: string, args?: object, options?: object) => Promise<object>,
   * }>}
   */
  const services = shallowRef(null);
  const ready = computed(() => services.value !== null);

  /** Visible Autobahn events (filters applied), as the layer last drew them. */
  const disruptions = shallowRef([]);
  /** The event the user picked on the map or in the list. */
  const selected = shallowRef(null);
  /** Rhine and Elbe gauges, as the river layer last drew them. */
  const gauges = shallowRef([]);
  /** The gauge the user picked; one card shows at a time. */
  const selectedGauge = shallowRef(null);
  /** DWD warnings as the warnings layer last drew them, and the picked one. */
  const warnings = shallowRef([]);
  const selectedWarning = shallowRef(null);
  /** Bumped when layer state changes, so computed reads re-run. */
  const layerRevision = shallowRef(0);

  function connect(next) {
    services.value = next ? Object.freeze({ ...next }) : null;
  }

  function publishDisruptions(rows) {
    disruptions.value = Array.isArray(rows) ? rows : [];
    if (
      selected.value &&
      !disruptions.value.some((row) => row.stableId === selected.value.stableId)
    )
      selected.value = null;
  }

  function publishSelected(row) {
    selected.value = row || null;
    if (row) {
      selectedGauge.value = null;
      selectedWarning.value = null;
    }
  }

  function publishWarnings(rows) {
    warnings.value = Array.isArray(rows) ? rows : [];
    const picked = selectedWarning.value;
    if (picked)
      selectedWarning.value =
        warnings.value.find((row) => row.stableId === picked.stableId) || null;
  }

  function publishSelectedWarning(row) {
    selectedWarning.value = row || null;
    if (row) {
      selected.value = null;
      selectedGauge.value = null;
    }
  }

  function publishGauges(rows) {
    gauges.value = Array.isArray(rows) ? rows : [];
    const picked = selectedGauge.value;
    if (picked)
      selectedGauge.value =
        gauges.value.find((row) => row.stableId === picked.stableId) || null;
  }

  function publishSelectedGauge(row) {
    selectedGauge.value = row || null;
    if (row) {
      selected.value = null;
      selectedWarning.value = null;
    }
  }

  function touchLayers() {
    layerRevision.value += 1;
  }

  return {
    services,
    ready,
    disruptions,
    selected,
    gauges,
    selectedGauge,
    warnings,
    selectedWarning,
    layerRevision,
    connect,
    publishDisruptions,
    publishSelected,
    publishGauges,
    publishSelectedGauge,
    publishWarnings,
    publishSelectedWarning,
    touchLayers,
  };
});
