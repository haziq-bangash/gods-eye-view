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
    destroy() {
      destroyed = true;
      if (!viewer.isDestroyed?.()) viewer.dataSources.remove(source, true);
    },
  };
}
