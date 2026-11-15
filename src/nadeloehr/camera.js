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
