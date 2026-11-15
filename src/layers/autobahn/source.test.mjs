import test from 'node:test';
import assert from 'node:assert/strict';
import { createAutobahnSource } from './source.js';

test('the source reads rows, staleness and failed feeds from the same-origin proxy', async () => {
  const urls = [];
  const source = createAutobahnSource({
    fetchImpl: async (url) => {
      urls.push(url);
      return Response.json({
        fetchedAt: 99,
        stale: true,
        failed: ['A7/warning', 3],
        rows: [{ stableId: 'x' }],
      });
    },
  });
  assert.deepEqual(await source.getSnapshotDetail(), {
    rows: [{ stableId: 'x' }],
    stale: true,
    fetchedAt: 99,
    failed: ['A7/warning'],
  });
  assert.deepEqual(await source.getSnapshot(), [{ stableId: 'x' }]);
  assert.deepEqual(urls, ['/api/autobahn/events', '/api/autobahn/events']);
});

test('HTTP errors and malformed snapshots reject', async () => {
  const failing = createAutobahnSource({
    fetchImpl: async () => new Response('{}', { status: 502 }),
  });
  await assert.rejects(failing.getSnapshot(), /Autobahn HTTP 502/);
  const malformed = createAutobahnSource({
    fetchImpl: async () => Response.json({ rows: 'no' }),
  });
  await assert.rejects(malformed.getSnapshot(), /Malformed Autobahn snapshot/);
});

test('an aborted signal stops before fetching', async () => {
  let called = false;
  const source = createAutobahnSource({
    fetchImpl: async () => {
      called = true;
      return Response.json({ rows: [] });
    },
  });
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(source.getSnapshot({ signal: controller.signal }));
  assert.equal(called, false);
});
