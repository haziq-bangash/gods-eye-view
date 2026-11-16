import assert from 'node:assert/strict';
import test from 'node:test';
import {
  readSavedRoutes,
  routeId,
  SAVED_ROUTES_MAX,
  useSavedRoutes,
} from './savedRoutes.js';

test('a route is the same however it was typed', () => {
  assert.equal(routeId(' Hamburg ', 'München'), routeId('hamburg', 'münchen'));
  assert.notEqual(routeId('Hamburg', 'München'), routeId('München', 'Hamburg'));
});

test('stored routes are cleaned, deduplicated and capped', () => {
  assert.deepEqual(readSavedRoutes('not json'), []);
  assert.deepEqual(readSavedRoutes('{"from":"a"}'), []);
  const many = Array.from({ length: 9 }, (_, i) => ({
    from: `A${i}`,
    to: 'B',
  }));
  const read = readSavedRoutes(
    JSON.stringify([{ from: 'Hamburg', to: '' }, ...many, many[8]]),
  );
  assert.equal(read.length, SAVED_ROUTES_MAX);
  assert.equal(read.at(-1).from, 'A8');
});

test('save, recognise and remove a route', () => {
  const routes = useSavedRoutes();
  routes.save('Hamburg', 'München');
  routes.save('hamburg', 'münchen');
  assert.equal(routes.saved.value.length, 1);
  assert.equal(routes.isSaved('HAMBURG', 'München'), true);
  routes.remove(routes.saved.value[0].id);
  assert.equal(routes.isSaved('Hamburg', 'München'), false);
});
