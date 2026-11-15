import test from 'node:test';
import assert from 'node:assert/strict';
import { flyToAustin } from '../camera.js';

test('teardown before the initial camera delay prevents a late flight', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let flights = 0;
  let cancelled = 0;
  const stop = flyToAustin({
    isDestroyed: () => false,
    camera: {
      setView() {},
      flyTo() {
        flights++;
      },
      cancelFlight() {
        cancelled++;
      },
    },
  });
  stop();
  t.mock.timers.tick(1000);
  assert.equal(flights, 0);
  assert.equal(cancelled, 1);
});

test('the start view opens over Germany and descends to a flat, north-up overview', async (t) => {
  const { flyToStartView } = await import('../camera.js');
  const { FREIGHT_START_VIEW } = await import('../freightProfile.js');
  const Cesium = await import('cesium');
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const views = [];
  const flights = [];
  const stop = flyToStartView(
    {
      isDestroyed: () => false,
      camera: {
        setView: (view) => views.push(view),
        flyTo: (flight) => flights.push(flight),
        cancelFlight() {},
      },
    },
    FREIGHT_START_VIEW,
  );
  const degrees = (cartesian) => {
    const c = Cesium.Cartographic.fromCartesian(cartesian);
    return [
      Cesium.Math.toDegrees(c.longitude),
      Cesium.Math.toDegrees(c.latitude),
    ];
  };
  const [lon, lat] = degrees(views[0].destination);
  assert.ok(Math.abs(lon - 10.45) < 1e-6 && Math.abs(lat - 51.1) < 1e-6);
  t.mock.timers.tick(500);
  assert.equal(flights.length, 1);
  const [, flightLat] = degrees(flights[0].destination);
  // Straight down, so the camera sits right over Germany's centre.
  assert.ok(Math.abs(flightLat - 51.1) < 1e-6, String(flightLat));
  assert.equal(
    Cesium.Math.toDegrees(flights[0].orientation.pitch).toFixed(0),
    '-90',
  );
  stop();
});
