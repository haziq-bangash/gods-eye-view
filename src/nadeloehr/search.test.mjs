import test from 'node:test';
import assert from 'node:assert/strict';
import {
  autobahnQuery,
  localResults,
  placeSearchUrl,
  routeQuery,
  searchPlacesDE,
  coordinateResult,
} from './search.js';

test('Autobahn numbers are read however they are typed', () => {
  for (const text of ['A7', 'a7', 'a 7', 'A-7', ' A07 '])
    assert.equal(autobahnQuery(text), 'A7');
  assert.equal(autobahnQuery('A100'), 'A100');
  assert.equal(autobahnQuery('Aachen'), null);
  assert.equal(autobahnQuery('A7 Hamburg'), null);
});

test('roads, gauges and the Rhine corridor are found without the network', () => {
  const events = [{ road: 'A7' }, { road: 'A7' }, { road: 'A1' }];
  const gauges = [
    { stableId: 'k', name: 'Kaub' },
    { stableId: 'kö', name: 'Köln' },
  ];
  assert.deepEqual(localResults('a7', { events }), [
    { type: 'road', id: 'road:A7', road: 'A7', count: 2 },
  ]);
  assert.deepEqual(
    localResults('koln', { gauges }).map((r) => r.id),
    ['gauge:kö'],
  );
  assert.deepEqual(
    localResults('Rhein', {}).map((r) => r.id),
    ['corridor:rhine-axis'],
  );
  assert.deepEqual(
    localResults('Duisburg', {}).map((r) => r.id),
    ['corridor:rhine-axis'],
  );
});

test('place search is biased on Germany in the reader language', () => {
  const url = new URL(placeSearchUrl('Köln', 'de-DE'));
  assert.equal(url.hostname, 'photon.komoot.io');
  assert.equal(url.searchParams.get('lang'), 'de');
  assert.equal(url.searchParams.get('lat'), '51.1');
  assert.equal(
    new URL(placeSearchUrl('x', 'ja')).searchParams.get('lang'),
    'en',
  );
});

test('German places come first and duplicates are dropped', async () => {
  const feature = (name, countrycode, lon = 7, lat = 50) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [lon, lat] },
    properties: {
      name,
      countrycode,
      country: countrycode,
      osm_key: 'place',
      osm_value: 'city',
    },
  });
  const fetchImpl = async () =>
    Response.json({
      features: [
        feature('Kolno', 'PL'),
        feature('Köln', 'DE'),
        feature('Köln', 'DE'),
      ],
    });
  const places = await searchPlacesDE('Köln', { fetchImpl });
  assert.deepEqual(
    places.map((r) => r.place.name),
    ['Köln', 'Kolno'],
  );
  assert.deepEqual(await searchPlacesDE('A7', { fetchImpl }), []);
});

test('a city outranks hamlets of the same name', async () => {
  const feature = (name, value, lon) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [lon, 50] },
    properties: { name, countrycode: 'DE', osm_key: 'place', osm_value: value },
  });
  const fetchImpl = async () =>
    Response.json({
      features: [
        feature('München', 'hamlet', 11.25),
        feature('Munich', 'city', 11.57),
        feature('Münchenbernsdorf', 'village', 11.93),
      ],
    });
  const places = await searchPlacesDE('München', { fetchImpl });
  assert.equal(places[0].place.name, 'Munich');
});

test('a trip typed in search becomes a route check', () => {
  for (const text of [
    'Hamburg → München',
    'Hamburg -> München',
    'Hamburg nach München',
    'hamburg to munich',
    'Hamburg – München',
    'Hamburg - München',
  ])
    assert.equal(localResults(text, {})[0]?.type, 'route', text);
  assert.deepEqual(routeQuery('Hamburg nach München'), ['Hamburg', 'München']);
  assert.equal(routeQuery('Duisburg-Ruhrort'), null);
  assert.equal(routeQuery('Bad Hersfeld'), null);
});

test('coordinates, grid references and plus codes become a place at once', async () => {
  for (const text of [
    '51.3155, 9.4979',
    `51°18'56"N 9°29'52"E`,
    '32U 534869 5687178',
    '9F3F8F8X+65',
  ]) {
    const [result] = localResults(text);
    assert.equal(result?.type, 'place', text);
    assert.ok(
      Math.abs(result.place.lat - 51.3) < 0.1,
      `${text}: ${result.place.lat}`,
    );
    assert.ok(
      Math.abs(result.place.lng - 9.5) < 0.1,
      `${text}: ${result.place.lng}`,
    );
    assert.match(result.place.name, /° N, .*° E$/);
  }
  assert.equal(coordinateResult('Kassel'), null);
  // A route between two coordinate pairs is still a route.
  assert.equal(localResults('51.3, 9.5 → 48.1, 11.6')[0].type, 'route');
  // Coordinates never go to the place search.
  let called = false;
  await searchPlacesDE('51.3155, 9.4979', {
    fetchImpl: async () => {
      called = true;
      return Response.json({ features: [] });
    },
  });
  assert.equal(called, false);
});
