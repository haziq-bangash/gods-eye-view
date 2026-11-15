import { defineStore } from 'pinia';
import { computed, shallowRef } from 'vue';

/**
 * What the Nadelöhr shell reads from the running application: the services
 * it drives (published once the scene and tools exist) and the Autobahn
 * events the layer hands over (published by the layer's onRows/onSelect).
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
  }

  function touchLayers() {
    layerRevision.value += 1;
  }

  return {
    services,
    ready,
    disruptions,
    selected,
    layerRevision,
    connect,
    publishDisruptions,
    publishSelected,
    touchLayers,
  };
});
