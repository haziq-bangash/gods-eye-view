import test from 'node:test';
import assert from 'node:assert/strict';
import {
  inVesselBbox,
  parseVesselBbox,
} from '../server/providers/vessels/ais-live.js';

test('a bbox is west,south,east,north in degrees', () => {
  assert.deepEqual(
    parseVesselBbox('7.59,49.95,7.95,50.37'),
    [7.59, 49.95, 7.95, 50.37],
  );
  for (const bad of [
    null,
    '',
    '1,2,3',
    'a,b,c,d',
    '8,49,7,50',
    '7,50,8,49',
    '-200,0,0,1',
    '0,0,1,95',
  ])
    assert.equal(parseVesselBbox(bad), null, String(bad));
});

test('rows inside and outside the box', () => {
  const box = [7.59, 49.95, 7.95, 50.37];
  assert.equal(inVesselBbox({ lat: 50.1, lon: 7.75 }, box), true);
  assert.equal(inVesselBbox({ lat: 53.5, lon: 9.9 }, box), false, 'Hamburg');
  assert.equal(inVesselBbox({ lat: null, lon: 7.75 }, box), false);
});
