/**
 * Alert subscriptions in Upstash Redis, over its REST API (no client
 * library). One JSON record per browser under nd:sub:<id>, where the id is a
 * hash of the push endpoint, plus the set nd:subs of all ids. Used by the
 * /api/alerts routes and by scripts/send-alerts.mjs.
 *
 * Configured by UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.
 */
import { createHash } from 'node:crypto';

const SET = 'nd:subs';
const key = (id) => `nd:sub:${id}`;
/** A ceiling on stored browsers, so the free database cannot be filled. */
export const MAX_SUBSCRIPTIONS = 5000;

/** The stable id of a push endpoint. */
export const subscriptionId = (endpoint) =>
  createHash('sha256').update(String(endpoint)).digest('hex').slice(0, 32);

export function alertStoreConfigured(env = process.env) {
  return Boolean(env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN);
}

export function createAlertStore({
  url = process.env.UPSTASH_REDIS_REST_URL,
  token = process.env.UPSTASH_REDIS_REST_TOKEN,
  fetchImpl = (...args) => globalThis.fetch(...args),
} = {}) {
  if (!url || !token) throw new Error('alert store not configured');
  const base = String(url).replace(/\/+$/, '');
  if (!/^https:\/\//.test(base)) throw new Error('alert store needs https');

  async function call(path, body) {
    const response = await fetchImpl(`${base}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`alert store ${response.status}`);
    return response.json();
  }
  const command = async (...args) => {
    const data = await call('/', args);
    if (data?.error) throw new Error(`alert store: ${data.error}`);
    return data?.result;
  };
  const pipeline = async (commands) => {
    const data = await call('/pipeline', commands);
    const failed = (Array.isArray(data) ? data : []).find((row) => row?.error);
    if (failed) throw new Error(`alert store: ${failed.error}`);
    return (Array.isArray(data) ? data : []).map((row) => row?.result);
  };

  return {
    async get(id) {
      const raw = await command('GET', key(id));
      try {
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    },
    async count() {
      return Number(await command('SCARD', SET)) || 0;
    },
    async save(record) {
      await pipeline([
        ['SET', key(record.id), JSON.stringify(record)],
        ['SADD', SET, record.id],
      ]);
    },
    async remove(id) {
      await pipeline([
        ['DEL', key(id)],
        ['SREM', SET, id],
      ]);
    },
    /** Every stored record (ids whose record is gone are dropped from the set). */
    async all() {
      const ids = (await command('SMEMBERS', SET)) || [];
      const out = [];
      for (let i = 0; i < ids.length; i += 100) {
        const chunk = ids.slice(i, i + 100);
        const values = (await command('MGET', ...chunk.map(key))) || [];
        const missing = [];
        chunk.forEach((id, index) => {
          try {
            const record = values[index] ? JSON.parse(values[index]) : null;
            if (record) out.push(record);
            else missing.push(id);
          } catch {
            missing.push(id);
          }
        });
        if (missing.length) await command('SREM', SET, ...missing);
      }
      return out;
    },
  };
}
