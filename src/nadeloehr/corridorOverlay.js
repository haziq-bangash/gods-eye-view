/**
 * Corridor bands on the map for the Nadelöhr shell: one soft, wide line per
 * corridor in its risk colour, the selected one stronger and the others
 * faded. Kept beside the scene (like camera.js) so the shell's views stay
 * free of Cesium; the shell drives it through the store's services.
 */
import * as Cesium from 'cesium';

const LEVEL_COLORS = Object.freeze({
  low: '#34c759',
  elevated: '#ff9500',
  high: '#ff3b30',
});

export function createCorridorOverlay(viewer) {
  const source = new Cesium.CustomDataSource('nadeloehr-corridors');
  viewer.dataSources.add(source);
  const routeSource = new Cesium.CustomDataSource('nadeloehr-route');
  viewer.dataSources.add(routeSource);
  const planSource = new Cesium.CustomDataSource('nadeloehr-route-plan');
  viewer.dataSources.add(planSource);
  let destroyed = false;

  return {
    /**
     * Draw the scored corridors (see src/freight/corridors.js).
     * @param {{corridor: {id: string, path: number[][]}, level: ?string}[]} scored
     * @param {?string} selectedId
     */
    update(scored, selectedId = null) {
      if (destroyed || viewer.isDestroyed?.()) return;
      source.entities.removeAll();
      for (const { corridor, level } of Array.isArray(scored) ? scored : []) {
        const selected = corridor.id === selectedId;
        const alpha = selected ? 0.6 : selectedId ? 0.12 : 0.3;
        source.entities.add({
          id: `nadeloehr-corridor:${corridor.id}`,
          polyline: {
            positions: corridor.path.map(([lon, lat]) =>
              Cesium.Cartesian3.fromDegrees(lon, lat),
            ),
            width: selected ? 14 : 9,
            clampToGround: true,
            material: Cesium.Color.fromCssColorString(
              LEVEL_COLORS[level] || '#8e8e93',
            ).withAlpha(alpha),
          },
        });
      }
      viewer.scene.requestRender?.();
    },
    /** Show or hide the corridor bands (the route stays). */
    setVisible(visible) {
      if (destroyed || viewer.isDestroyed?.()) return;
      source.show = Boolean(visible);
      viewer.scene.requestRender?.();
    },
    /**
     * Draw a checked route like a navigation route: a blue line on a white
     * casing, above the corridor bands. Null clears it. (The card shows its
     * risk colour.)
     */
    setRoute(path) {
      if (destroyed || viewer.isDestroyed?.()) return;
      routeSource.entities.removeAll();
      if (Array.isArray(path) && path.length >= 2) {
        const positions = path.map(([lon, lat]) =>
          Cesium.Cartesian3.fromDegrees(lon, lat),
        );
        // A white casing under the coloured line, like a navigation route.
        routeSource.entities.add({
          id: 'nadeloehr-route:casing',
          polyline: {
            positions,
            width: 12,
            clampToGround: true,
            zIndex: 1,
            material: Cesium.Color.WHITE,
          },
        });
        routeSource.entities.add({
          id: 'nadeloehr-route:line',
          polyline: {
            positions,
            width: 7,
            clampToGround: true,
            zIndex: 2,
            material: Cesium.Color.fromCssColorString('#007aff'),
          },
        });
      }
      viewer.scene.requestRender?.();
    },
    /**
     * The trip plan on the route: the way round a closure as a grey line,
     * and markers ({lon, lat, label, color}) for breaks and closures, each
     * labelled with its time. Null clears it.
     * @param {?{detour?: ?number[][], markers?: object[]}} plan
     */
    setRoutePlan(plan) {
      if (destroyed || viewer.isDestroyed?.()) return;
      planSource.entities.removeAll();
      const detour = plan?.detour;
      if (Array.isArray(detour) && detour.length >= 2)
        planSource.entities.add({
          id: 'nadeloehr-route:detour',
          polyline: {
            positions: detour.map(([lon, lat]) =>
              Cesium.Cartesian3.fromDegrees(lon, lat),
            ),
            width: 5,
            clampToGround: true,
            zIndex: 0,
            material: new Cesium.PolylineDashMaterialProperty({
              color: Cesium.Color.fromCssColorString('#8e8e93'),
              dashLength: 14,
            }),
          },
        });
      (plan?.markers || []).forEach((marker, index) => {
        if (!Number.isFinite(marker?.lon) || !Number.isFinite(marker?.lat))
          return;
        const color = Cesium.Color.fromCssColorString(
          marker.color || '#007aff',
        );
        planSource.entities.add({
          id: `nadeloehr-route:marker:${index}`,
          position: Cesium.Cartesian3.fromDegrees(marker.lon, marker.lat),
          point: {
            pixelSize: 14,
            color,
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 3,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          label: {
            text: marker.label || '',
            font: '600 13px system-ui, sans-serif',
            fillColor: Cesium.Color.fromCssColorString('#1c1c1e'),
            showBackground: true,
            backgroundColor: Cesium.Color.WHITE.withAlpha(0.94),
            backgroundPadding: new Cesium.Cartesian2(8, 5),
            pixelOffset: new Cesium.Cartesian2(0, -22),
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        });
      });
      viewer.scene.requestRender?.();
    },
    destroy() {
      destroyed = true;
      if (!viewer.isDestroyed?.()) viewer.dataSources.remove(planSource, true);
      if (!viewer.isDestroyed?.()) viewer.dataSources.remove(routeSource, true);
      if (!viewer.isDestroyed?.()) viewer.dataSources.remove(source, true);
    },
  };
}
