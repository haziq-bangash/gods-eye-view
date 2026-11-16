import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ROLE,
  budgetNotice,
  overCap,
  withoutGrant,
} from '../scripts/vertex-cap/cap.mjs';

const push = (notice) => ({
  message: { data: Buffer.from(JSON.stringify(notice)).toString('base64') },
});

test('reads the budget notification out of the Pub/Sub push', () => {
  assert.deepEqual(
    budgetNotice(
      push({ costAmount: 4.2, budgetAmount: 20, budgetDisplayName: 'x' }),
    ),
    { cost: 4.2, budget: 20, name: 'x' },
  );
  assert.equal(budgetNotice({}), null);
  assert.equal(budgetNotice({ message: { data: 'not json' } }), null);
  assert.equal(budgetNotice(push({ costAmount: 1, budgetAmount: 0 })), null);
});

test('cuts off at 90% of the budget by default', () => {
  assert.equal(overCap({ cost: 17.99, budget: 20 }), false);
  assert.equal(overCap({ cost: 18, budget: 20 }), true);
  assert.equal(overCap({ cost: 10, budget: 20 }, 0.5), true);
});

test('removes only the Vertex grant of that one account', () => {
  const me = 'serviceAccount:vertex@p.iam.gserviceaccount.com';
  const other = 'serviceAccount:other@p.iam.gserviceaccount.com';
  const policy = {
    etag: 'e',
    bindings: [
      { role: ROLE, members: [me, other] },
      { role: 'roles/aiplatform.user', members: [me] },
    ],
  };
  assert.deepEqual(withoutGrant(policy, me), {
    etag: 'e',
    bindings: [
      { role: ROLE, members: [other] },
      { role: 'roles/aiplatform.user', members: [me] },
    ],
  });
  assert.deepEqual(
    withoutGrant({ bindings: [{ role: ROLE, members: [me] }] }, me),
    { bindings: [] },
  );
  assert.equal(withoutGrant({ bindings: [] }, me), null);
});
