import test from 'node:test';
import assert from 'node:assert/strict';
import { createRiverLevelSource } from './source.js';

test('the source reads rows and staleness from the same-origin proxy', async () => {
  const urls = [];
  const source = createRiverLevelSource({
    fetchImpl: async (url) => {
      urls.push(url);
      return Response.json({
        fetchedAt: 5,
        stale: true,
        rows: [{ stableId: 'k' }],
      });
    },
  });
  assert.deepEqual(await source.getSnapshotDetail(), {
    rows: [{ stableId: 'k' }],
    stale: true,
    fetchedAt: 5,
  });
  assert.deepEqual(await source.getSnapshot(), [{ stableId: 'k' }]);
  assert.deepEqual(urls, ['/api/pegel/gauges', '/api/pegel/gauges']);
});

test('HTTP errors and malformed snapshots reject', async () => {
  const failing = createRiverLevelSource({
    fetchImpl: async () => new Response('{}', { status: 502 }),
  });
  await assert.rejects(failing.getSnapshot(), /HTTP 502/);
  const malformed = createRiverLevelSource({
    fetchImpl: async () => Response.json({ rows: 'x' }),
  });
  await assert.rejects(malformed.getSnapshot(), /Malformed/);
});
