import test from 'node:test';
import assert from 'node:assert/strict';
import { composeCatalog } from '../catalog.js';
import { getCorridorRisk } from './freight.js';

const source = (rows) => ({ getSnapshot: async () => rows });
const failing = {
  getSnapshot: async () => {
    throw new Error('down');
  },
};

function catalog(overrides = {}) {
  return composeCatalog({
    tools: [getCorridorRisk],
    services: {
      app: { baseUrl: 'https://nadeloehr.example/' },
      autobahn: source([
        {
          kind: 'closure',
          road: 'A7',
          lat: 52.37,
          lon: 9.73,
          section: 'Hannover',
          direction: 'Süd',
        },
      ]),
      riverLevels: source([{ shortname: 'KAUB', levelCm: 59 }]),
      weatherWarnings: source([]),
      truckParking: source([
        { stableId: 'p', road: 'A7', lat: 52.4, lon: 9.73, lorrySpaces: 100 },
      ]),
      ...overrides,
    },
  });
}

test('all corridors, riskiest first, each part with a reason and a map link', async () => {
  const result = await catalog().call('get_corridor_risk', {});
  assert.match(result.summary, /^Corridor risk, riskiest first: /);
  assert.match(result.summary, /Kaub reads 59 cm\./);
  const { rows, view, formula } = result.data;
  assert.equal(rows.length, 3);
  assert.equal(formula, 'R = 0.35·C + 0.20·P + 0.25·H + 0.20·W');
  assert.ok(rows[0].score >= rows[1].score && rows[1].score >= rows[2].score);
  const a7 = rows.find((row) => row.id === 'north-south-a7');
  assert.deepEqual(a7.closed_roads, [
    { road: 'A7', section: 'Hannover', direction: 'Süd' },
  ]);
  assert.deepEqual(
    a7.parts.map(({ key }) => key),
    ['C', 'P', 'W'],
  );
  assert.match(a7.parts[0].reason, /1 closed/);
  assert.match(a7.parts[1].reason, /truck spaces usable/);
  assert.match(a7.parts[2].reason, /no DWD warnings/);
  assert.ok(view.url.startsWith('https://nadeloehr.example/'));
  assert.deepEqual(view.layers, [
    'autobahn-traffic',
    'river-levels',
    'truck-parking',
    'weather-warnings',
  ]);
});

test('one corridor frames the view on it; a failed source leaves its part out', async () => {
  const result = await catalog({ weatherWarnings: failing }).call(
    'get_corridor_risk',
    { corridor: 'rhine-axis' },
  );
  const [row] = result.data.rows;
  assert.equal(row.id, 'rhine-axis');
  assert.equal(row.river, 'Rhine');
  const w = row.parts.find((part) => part.key === 'W');
  assert.equal(w.value, null);
  assert.equal(w.reason, 'no data right now');
  assert.match(result.summary, /^Corridor risk: Duisburg → Karlsruhe/);
});

test('without the Autobahn feed no corridor is scored', async () => {
  await assert.rejects(
    catalog({ autobahn: failing }).call('get_corridor_risk', {}),
    (error) => error.code === 'unavailable',
  );
  await assert.rejects(
    catalog().call('get_corridor_risk', { corridor: 'nope' }),
    (error) => error.code === 'invalid_arguments',
  );
});
