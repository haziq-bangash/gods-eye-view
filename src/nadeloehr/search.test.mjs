import test from 'node:test';
import assert from 'node:assert/strict';
import {
  autobahnQuery,
  localResults,
  placeSearchUrl,
  searchPlacesDE,
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
