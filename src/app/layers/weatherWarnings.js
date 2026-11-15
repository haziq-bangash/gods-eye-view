import * as Cesium from 'cesium';
import { createWeatherWarningLayer } from '../../layers/weatherWarnings/index.js';
import * as picking from '../../data/pickRegistry.js';
import { isPointerFree } from '../../data/inputOwnership.js';
import { applicationPinia } from '../../ui/vueRuntime.js';
import { useNadeloehrStore } from '../../nadeloehr/store.js';

/** Wire DWD weather warnings into the application catalog. */
export function createApplicationWeatherWarnings(options) {
  return createWeatherWarningLayer({
    screenSpaceEventHandlerFactory: (viewer) =>
      new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas),
    picking,
    pointer: { isPointerFree },
    // The Nadelöhr shell lists the warnings and shows the selection itself.
    onSelect: (row) =>
      useNadeloehrStore(applicationPinia()).publishSelectedWarning(row),
    onRows: (rows) =>
      useNadeloehrStore(applicationPinia()).publishWarnings(rows),
    ...options,
  });
}
