import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fetchMiddleRhineShips,
  middleRhineUrl,
  summarizeShips,
} from './rhineShips.js';

const NOW = Date.parse('2026-11-15T16:00:00Z');
const row = (speed, minutesAgo = 2) => ({
  speed,
  last_position_UTC: new Date(NOW - minutesAgo * 60_000).toISOString(),
});

test('moving, stopped, unknown speed and stale positions', () => {
  const rows = [row(8.2), row(5), row(0.1), row(0), row(null), row(7, 45)];
  assert.deepEqual(summarizeShips(rows, NOW), {
    total: 4,
    moving: 2,
    stopped: 2,
  });
  assert.equal(summarizeShips(undefined, NOW), null);
  assert.deepEqual(summarizeShips([], NOW), {
    total: 0,
    moving: 0,
    stopped: 0,
  });
});

test('the feed is asked for the Middle Rhine only', () => {
  assert.match(
    middleRhineUrl(),
    /^\/api\/vessels\?bbox=7\.59,49\.95,7\.95,50\.37&maxRows=500$/,
  );
});

test('no key, a failing feed or a stale feed leave the line out', async () => {
  const reply = (status, body) => async () =>
    new Response(JSON.stringify(body), { status });
  assert.equal(
    await fetchMiddleRhineShips({
      fetchImpl: reply(503, { rows: [] }),
      now: NOW,
    }),
    null,
  );
  assert.equal(
    await fetchMiddleRhineShips({
      fetchImpl: reply(200, { status: 'stale', rows: [row(5)] }),
      now: NOW,
    }),
    null,
  );
  assert.equal(
    await fetchMiddleRhineShips({
      fetchImpl: async () => {
        throw new Error('offline');
      },
      now: NOW,
    }),
    null,
  );
  assert.deepEqual(
    await fetchMiddleRhineShips({
      fetchImpl: reply(200, { status: 'live', rows: [row(5), row(0)] }),
      now: NOW,
    }),
    { total: 2, moving: 1, stopped: 1 },
  );
});
