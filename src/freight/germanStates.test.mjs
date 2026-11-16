import assert from 'node:assert/strict';
import test from 'node:test';
import { stateAt, statesAlong } from './germanStates.js';

test('finds the state a city lies in, and nothing abroad', () => {
  assert.equal(stateAt([10.0, 53.55]), 'HH'); // Hamburg
  assert.equal(stateAt([11.58, 48.14]), 'BY'); // München
  assert.equal(stateAt([9.48, 51.31]), 'HE'); // Kassel
  assert.equal(stateAt([8.8, 53.08]), 'HB'); // Bremen
  assert.equal(stateAt([13.4, 52.52]), 'BE'); // Berlin, inside Brandenburg
  assert.equal(stateAt([13.06, 52.4]), 'BB'); // Potsdam
  assert.equal(stateAt([2.35, 48.86]), null); // Paris
  assert.equal(stateAt([Number.NaN, 50]), null);
});

test('lists the states a route crosses, in order', () => {
  // Roughly the A7 from Hamburg to Ulm.
  const path = [
    [10.0, 53.55],
    [9.73, 52.37],
    [9.48, 51.31],
    [9.93, 49.79],
    [9.99, 48.4],
  ];
  const dense = [];
  for (let i = 1; i < path.length; i += 1)
    for (let k = 0; k < 100; k += 1) {
      const [a, b] = [path[i - 1], path[i]];
      dense.push([
        a[0] + ((b[0] - a[0]) * k) / 100,
        a[1] + ((b[1] - a[1]) * k) / 100,
      ]);
    }
  dense.push(path.at(-1));
  assert.deepEqual(statesAlong(dense), ['HH', 'NI', 'HE', 'BY', 'BW']);
  assert.deepEqual(statesAlong(null), []);
});
