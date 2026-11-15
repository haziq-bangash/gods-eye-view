import * as Cesium from 'cesium';
import { createAutobahnLayer } from '../../layers/autobahn/index.js';
import * as picking from '../../data/pickRegistry.js';
import * as overlays from '../../overlays/worldOverlay.js';
import { isPointerFree } from '../../data/inputOwnership.js';
import { applicationPinia } from '../../ui/vueRuntime.js';
import { useNadeloehrStore } from '../../nadeloehr/store.js';

/** Wire Autobahn closures and roadworks into the application catalog. */
export function createApplicationAutobahn(options) {
  return createAutobahnLayer({
    overlayHost: {
      setEntries: overlays.setOverlayEntries,
      setVisible: overlays.setOverlaySourceVisible,
      clearSource: overlays.clearOverlaySource,
      hitTest: overlays.hitTestWorldOverlay,
    },
    screenSpaceEventHandlerFactory: (viewer) =>
      new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas),
    picking,
    pointer: { isPointerFree },
    // The Nadelöhr shell shows the selection in its own sheet.
    onSelect: (row) =>
      useNadeloehrStore(applicationPinia()).publishSelected(row),
    onRows: (rows) =>
      useNadeloehrStore(applicationPinia()).publishDisruptions(rows),
    showCard: false,
    ...options,
  });
}
