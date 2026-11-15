import test from 'node:test';
import assert from 'node:assert/strict';
import {
  berlinDay,
  createDailyLimit,
  createSiteDailyLimit,
  isNewQuestion,
  resolveDailyAllowance,
  secondsUntilBerlinMidnight,
} from '../server/providers/common/dailyLimit.js';

// 2026-11-15 10:00 in Berlin (UTC+1 in November).
const MORNING = Date.UTC(2026, 10, 15, 9, 0, 0);

test('ten questions a day per visitor, then a refusal until midnight', () => {
  let clock = MORNING;
  const daily = createDailyLimit({
    questions: 10,
    requests: 100,
    now: () => clock,
  });
  for (let i = 0; i < 10; i++)
    assert.equal(daily.take('cf:a', { question: true }), null);
  const over = daily.take('cf:a', { question: true });
  assert.equal(over.code, 'DAILY_LIMIT');
  assert.equal(over.allowance, 10);
  assert.equal(over.retryAfter, 14 * 3600, 'until midnight in Berlin');
  // Another visitor is unaffected.
  assert.equal(daily.take('cf:b', { question: true }), null);
  // The next Berlin day starts fresh.
  clock = Date.UTC(2026, 10, 15, 23, 1, 0);
  assert.equal(berlinDay(clock), '2026-11-16');
  assert.equal(daily.take('cf:a', { question: true }), null);
});

test('follow-up rounds do not use questions but have their own ceiling', () => {
  const daily = createDailyLimit({
    questions: 2,
    requests: 5,
    now: () => MORNING,
  });
  assert.equal(daily.take('v', { question: true }), null);
  for (let i = 0; i < 4; i++)
    assert.equal(daily.take('v', { question: false }), null);
  assert.equal(daily.take('v', { question: false })?.code, 'DAILY_LIMIT');
});

test('a new question is typed text, not the results of map actions', () => {
  const text = { role: 'user', parts: [{ text: 'Is the A7 closed?' }] };
  const results = {
    role: 'user',
    parts: [{ functionResponse: { name: 'fly_to', response: {} } }],
  };
  const model = {
    role: 'model',
    parts: [{ functionCall: { name: 'fly_to' } }],
  };
  assert.equal(isNewQuestion({ contents: [text] }), true);
  assert.equal(isNewQuestion({ contents: [text, model, results] }), false);
  assert.equal(
    isNewQuestion({ contents: [text, model, results, model, text] }),
    true,
  );
  assert.equal(isNewQuestion({}), true, 'unknown shapes count as questions');
});

test('allowances come from the environment, 0 turns them off', () => {
  assert.equal(resolveDailyAllowance(undefined, 10), 10);
  assert.equal(resolveDailyAllowance('', 10), 10);
  assert.equal(resolveDailyAllowance('25', 10), 25);
  assert.equal(resolveDailyAllowance('0', 10), 0);
  assert.equal(resolveDailyAllowance('ten', 10), 10);
  assert.equal(resolveDailyAllowance('-3', 10), 10);
  const off = createDailyLimit({
    questions: 0,
    requests: 0,
    now: () => MORNING,
  });
  for (let i = 0; i < 50; i++)
    assert.equal(off.take('v', { question: true }), null);
});

test('midnight is found across the summer-time change', () => {
  // 2026-03-29 is the spring change in Berlin; 22:30 local is 20:30 UTC.
  assert.equal(secondsUntilBerlinMidnight(Date.UTC(2026, 2, 29, 20, 30)), 5400);
});

test('the site-wide cap counts every request across visitors', async () => {
  const site = createSiteDailyLimit({ limit: 3, now: () => MORNING });
  for (let i = 0; i < 3; i++) assert.equal(await site.take(), null);
  const full = await site.take();
  assert.equal(full.code, 'SITE_DAILY_LIMIT');
  assert.equal(full.retryAfter, 14 * 3600);
  assert.equal(
    await createSiteDailyLimit({ limit: 0 }).take(),
    null,
    '0 = off',
  );
});

test('the site-wide cap counts in Upstash, and in memory if Upstash fails', async () => {
  const sent = [];
  let count = 0;
  const upstash = async (url, options) => {
    sent.push([url, JSON.parse(options.body)]);
    count += 1;
    return Response.json([{ result: count }, { result: 1 }]);
  };
  const shared = createSiteDailyLimit({
    limit: 2,
    url: 'https://x.upstash.io',
    token: 't',
    fetchImpl: upstash,
    now: () => MORNING,
  });
  assert.equal(await shared.take(), null);
  assert.equal(await shared.take(), null);
  assert.equal((await shared.take()).code, 'SITE_DAILY_LIMIT');
  assert.equal(sent[0][0], 'https://x.upstash.io/pipeline');
  assert.deepEqual(sent[0][1][0], ['INCR', 'nd:assistant:2026-11-15']);
  const broken = createSiteDailyLimit({
    limit: 1,
    url: 'https://x.upstash.io',
    token: 't',
    fetchImpl: async () => {
      throw new Error('down');
    },
    now: () => MORNING,
  });
  assert.equal(await broken.take(), null);
  assert.equal((await broken.take()).code, 'SITE_DAILY_LIMIT', 'still capped');
});
