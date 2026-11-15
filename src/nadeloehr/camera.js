/**
 * The two camera moves the Nadelöhr shell needs, kept beside the scene so the
 * shell's views stay free of Cesium: a flat, north-up flight onto a point, and
 * the ground point under the middle of the screen.
 */
import * as Cesium from 'cesium';

/** Fly straight down onto a point, north up, like Apple Maps does. */
export function flyFlat(viewer, lat, lon, altitudeM) {
  if (!viewer?.camera || viewer.isDestroyed?.()) return;
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(lon, lat, altitudeM),
    orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 },
    duration: 1.6,
  });
}

/** The ground point under the middle of the screen, else under the camera. */
export function viewCenter(viewer) {
  const canvas = viewer?.scene?.canvas;
  const hit =
    canvas &&
    viewer.camera.pickEllipsoid(
      new Cesium.Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2),
    );
  const point = hit
    ? Cesium.Cartographic.fromCartesian(hit)
    : viewer?.camera?.positionCartographic;
  if (!point) return null;
  return {
    lat: Cesium.Math.toDegrees(point.latitude),
    lon: Cesium.Math.toDegrees(point.longitude),
  };
}

/** Fit the view to a set of [lon, lat] points, north up, with some margin. */
export function flyToPoints(viewer, points, { padding = 0.35 } = {}) {
  if (!viewer?.camera || viewer.isDestroyed?.()) return;
  const valid = (Array.isArray(points) ? points : []).filter(
    ([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat),
  );
  if (!valid.length) return;
  const rect = Cesium.Rectangle.fromCartographicArray(
    valid.map(([lon, lat]) => Cesium.Cartographic.fromDegrees(lon, lat)),
  );
  // A single point (or a tight group) still gets a city-sized view.
  const pad = Math.max(rect.width, rect.height, 0.02) * padding;
  viewer.camera.flyTo({
    destination: new Cesium.Rectangle(
      rect.west - pad,
      rect.south - pad,
      rect.east + pad,
      rect.north + pad,
    ),
    orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 },
    duration: 1.4,
  });
}
