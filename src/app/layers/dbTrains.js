import * as Cesium from 'cesium';
import { createDbTrainsLayer } from '../../layers/dbTrains/index.js';
import * as picking from '../../data/pickRegistry.js';
import { isPointerFree } from '../../data/inputOwnership.js';
import { applicationPinia } from '../../ui/vueRuntime.js';
import { useNadeloehrStore } from '../../nadeloehr/store.js';

/** Wire the timetable's long-distance trains into the application catalog. */
export function createApplicationDbTrains(options) {
  return createDbTrainsLayer({
    screenSpaceEventHandlerFactory: (viewer) =>
      new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas),
    picking,
    pointer: { isPointerFree },
    // The Nadelöhr shell shows the picked train.
    onSelect: (row) =>
      useNadeloehrStore(applicationPinia()).publishSelectedTrain(row),
    ...options,
  });
}
