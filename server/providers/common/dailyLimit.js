/**
 * A per-visitor daily allowance for the public assistant: a number of
 * questions (requests that end in a new typed message) and a larger ceiling
 * on all requests, since one question can take a few follow-up rounds while
 * the assistant acts on the map. Days follow Berlin time. Counts live in
 * memory, so a restart starts a fresh day; the provider key's own quota is
 * the hard cap behind it.
 */
const DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Berlin',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const MAX_VISITORS = 50_000;

/** "2026-11-15" for a moment, in Berlin. */
export const berlinDay = (ms) => DAY.format(new Date(ms));

/** Seconds from `ms` until the next Berlin midnight (at least 60). */
export function secondsUntilBerlinMidnight(ms) {
  const today = berlinDay(ms);
  let step = 3_600_000;
  let probe = ms;
  while (berlinDay(probe + step) === today) probe += step;
  // Narrow the last hour down to the minute.
  step = 60_000;
  while (berlinDay(probe + step) === today) probe += step;
  return Math.max(60, Math.ceil((probe + step - ms) / 1000));
}

/** A positive whole number from the environment, else the fallback; "0" turns the limit off. */
export function resolveDailyAllowance(value, fallback) {
  const text = String(value ?? '').trim();
  if (text === '') return fallback;
  if (!/^\d{1,6}$/.test(text)) return fallback;
  return Number(text);
}

export function createDailyLimit({
  questions = 10,
  requests = 100,
  now = Date.now,
} = {}) {
  let day = null;
  let counts = new Map();
  return {
    /**
     * Records one request for a visitor. Returns null when it is allowed,
     * else { code: 'DAILY_LIMIT', retryAfter } in seconds.
     */
    take(visitor, { question }) {
      const at = now();
      const today = berlinDay(at);
      if (today !== day) {
        day = today;
        counts = new Map();
      }
      const entry = counts.get(visitor) || { questions: 0, requests: 0 };
      const over =
        (questions > 0 && question && entry.questions >= questions) ||
        (requests > 0 && entry.requests >= requests);
      if (over)
        return {
          code: 'DAILY_LIMIT',
          retryAfter: secondsUntilBerlinMidnight(at),
          allowance: questions,
        };
      if (!counts.has(visitor) && counts.size >= MAX_VISITORS)
        return {
          code: 'DAILY_LIMIT',
          retryAfter: secondsUntilBerlinMidnight(at),
          allowance: questions,
        };
      entry.requests += 1;
      if (question) entry.questions += 1;
      counts.set(visitor, entry);
      return null;
    },
  };
}

/**
 * Whether a chat request asks a new question: its last message is the
 * reader's typed text, not the results of the assistant's own map actions.
 */
export function isNewQuestion(input) {
  const last = Array.isArray(input?.contents) ? input.contents.at(-1) : null;
  if (!last || last.role !== 'user' || !Array.isArray(last.parts)) return true;
  const answersTools = last.parts.some(
    (part) => part && (part.functionResponse || part.toolResult),
  );
  return !answersTools;
}
