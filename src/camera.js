import * as Cesium from 'cesium';

/**
 * Set camera to Austin on load with a cinematic fly-in.
 * @returns {Function} Cancels the pending or active startup flight.
 */
export function flyToAustin(viewer) {
  // Start from a high altitude, then fly down
  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(-97.7431, 30.2672, 25000),
    orientation: {
      heading: Cesium.Math.toRadians(0),
      pitch: Cesium.Math.toRadians(-90),
      roll: 0.0,
    },
  });

  // Cinematic fly-in after a brief pause
  const timer = setTimeout(() => {
    if (viewer.isDestroyed()) return;
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(-97.7431, 30.2672, 600),
      orientation: {
        heading: Cesium.Math.toRadians(15),
        pitch: Cesium.Math.toRadians(-30),
        roll: 0.0,
      },
      duration: 4.0,
      easingFunction: Cesium.EasingFunction.CUBIC_IN_OUT,
    });
  }, 500);
  return () => {
    clearTimeout(timer);
    if (!viewer.isDestroyed()) viewer.camera.cancelFlight();
  };
}

/**
 * Open on a product start view (Nadelöhr: Germany, see
 * src/freightProfile.js): straight down from high above, then a short descent
 * to a slightly tilted overview.
 * @param {object} viewer Cesium viewer.
 * @param {{lon: number, lat: number, overviewAltitudeM: number,
 *   altitudeM: number, headingDeg: number, pitchDeg: number}} view
 * @returns {Function} Cancels the pending or active startup flight.
 */
export function flyToStartView(viewer, view) {
  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(
      view.lon,
      view.lat,
      view.overviewAltitudeM,
    ),
    orientation: {
      heading: Cesium.Math.toRadians(view.headingDeg),
      pitch: Cesium.Math.toRadians(-90),
      roll: 0.0,
    },
  });
  // Tilting the camera puts the view centre north of the camera's foot, so
  // the descent aims south of the target to keep Germany in the middle.
  const tilt = Cesium.Math.toRadians(90 + view.pitchDeg);
  const southM = view.altitudeM * Math.tan(tilt);
  const lat = view.lat - southM / 111_320;
  const timer = setTimeout(() => {
    if (viewer.isDestroyed()) return;
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(view.lon, lat, view.altitudeM),
      orientation: {
        heading: Cesium.Math.toRadians(view.headingDeg),
        pitch: Cesium.Math.toRadians(view.pitchDeg),
        roll: 0.0,
      },
      duration: 3.0,
      easingFunction: Cesium.EasingFunction.CUBIC_IN_OUT,
    });
  }, 500);
  return () => {
    clearTimeout(timer);
    if (!viewer.isDestroyed()) viewer.camera.cancelFlight();
  };
}
