import * as Cesium from 'cesium';
import { createRiverLevelLayer } from '../../layers/riverLevels/index.js';
import * as picking from '../../data/pickRegistry.js';
import { isPointerFree } from '../../data/inputOwnership.js';
import { applicationPinia } from '../../ui/vueRuntime.js';
import { useNadeloehrStore } from '../../nadeloehr/store.js';

/** Wire Rhine and Elbe water levels into the application catalog. */
export function createApplicationRiverLevels(options) {
  return createRiverLevelLayer({
    screenSpaceEventHandlerFactory: (viewer) =>
      new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas),
    picking,
    pointer: { isPointerFree },
    // The Nadelöhr shell lists the gauges and shows the selection itself.
    onSelect: (row) =>
      useNadeloehrStore(applicationPinia()).publishSelectedGauge(row),
    onRows: (rows) => useNadeloehrStore(applicationPinia()).publishGauges(rows),
    ...options,
  });
}
