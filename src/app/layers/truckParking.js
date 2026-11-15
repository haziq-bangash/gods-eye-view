import * as Cesium from 'cesium';
import { createTruckParkingLayer } from '../../layers/truckParking/index.js';
import * as picking from '../../data/pickRegistry.js';
import { isPointerFree } from '../../data/inputOwnership.js';
import { applicationPinia } from '../../ui/vueRuntime.js';
import { useNadeloehrStore } from '../../nadeloehr/store.js';

/** Wire Autobahn truck rest areas into the application catalog. */
export function createApplicationTruckParking(options) {
  return createTruckParkingLayer({
    screenSpaceEventHandlerFactory: (viewer) =>
      new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas),
    picking,
    pointer: { isPointerFree },
    // The Nadelöhr shell shows the selection and marks affected rest areas.
    onSelect: (row) =>
      useNadeloehrStore(applicationPinia()).publishSelectedParking(row),
    onRows: (rows) =>
      useNadeloehrStore(applicationPinia()).publishParking(rows),
    ...options,
  });
}
