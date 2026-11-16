import { berlinParts } from '../../src/freight/horizon.js';
import { trainsBetween } from '../../src/freight/dbTrains.js';
import {
  DELAY_HUBS,
  hubKeys,
  stationKey,
  matchStation,
  parseStationEva,
  parseTimetableXml,
  pickDelays,
} from '../../src/freight/dbTimetables.js';
import { providerUserAgent } from './common/userAgent.js';

// Deutsche Bahn Timetables API (DB API Marketplace, free plan: 60 calls a
// minute; data CC BY 4.0). Keys: DB_CLIENT_ID and DB_API_KEY. Without them
// the train layer keeps its timetable positions and reports no delays.
export const DB_TIMETABLES_URL =
  'https://apis.deutschebahn.com/db-api-marketplace/apis/timetables/v1';

/** One call every 3 s: 20 a minute, a third of the free plan. */
export const CALL_EVERY_MS = 3000;
/** A hub's changes are read again after two minutes. */
const CHANGES_TTL_MS = 2 * 60 * 1000;
/** Polling stops when nobody asked for delays for ten minutes. */
const IDLE_MS = 10 * 60 * 1000;
/** A failed station search is retried after an hour. */
const STATION_RETRY_MS = 60 * 60 * 1000;
/** After the keys are refused, calls stop for five minutes. */
const AUTH_PAUSE_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_XML_BYTES = 4 * 1024 * 1024;

const pad = (n) => String(n).padStart(2, '0');

/** The `/plan` path parts (YYMMDD, HH) of the Berlin hour containing `ms`. */
export function planSlot(ms) {
  const p = berlinParts(ms);
  return {
    date: `${pad(p.year % 100)}${pad(p.month)}${pad(p.day)}`,
    hour: pad(p.hour),
  };
}

export function resolveDbTimetablesCredentials(env = process.env) {
  const clientId = String(env.DB_CLIENT_ID || '').trim();
  const apiKey = String(env.DB_API_KEY || '').trim();
  return clientId && apiKey ? { clientId, apiKey } : null;
}

/**
 * Keeps the hubs' plans and changes fresh while the layer is in use, one
 * call at a time, and turns them into a delay per train.
 */
export function createDelayTracker({
  fetchImpl = (...args) => globalThis.fetch(...args),
  now = () => Date.now(),
  credentials = () => resolveDbTimetablesCredentials(),
  timetable,
  hubs = DELAY_HUBS,
  callEveryMs = CALL_EVERY_MS,
  setTimer = (fn, ms) => {
    const timer = setInterval(fn, ms);
    timer?.unref?.();
    return timer;
  },
  clearTimer = (timer) => clearInterval(timer),
} = {}) {
  /** @type {Map<string, {eva: string|null, failedAt?: number}>} */
  const stations = new Map();
  /** @type {Map<string, Map<string, object>>} plans by `${eva}/${date}/${hour}` */
  const plans = new Map();
  /** @type {Map<string, {at: number, stops: Map<string, object>}>} */
  const changes = new Map();
  let timer = null;
  let lastAsked = 0;
  let busy = false;
  let pausedUntil = 0;
  let lastError = null;
  let cached = null;

  async function call(path) {
    const keys = credentials();
    if (!keys) throw new Error('not_configured');
    const response = await fetchImpl(`${DB_TIMETABLES_URL}${path}`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      redirect: 'error',
      headers: {
        Accept: 'application/xml',
        'DB-Client-Id': keys.clientId,
        'DB-Api-Key': keys.apiKey,
        'User-Agent': providerUserAgent('db-timetables'),
      },
    });
    // No plan for an hour (a quiet station at night) is an empty answer.
    if (response.status === 404) {
      await response.body?.cancel();
      return '';
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`timetables_${response.status}`);
    }
    const text = await response.text();
    if (text.length > MAX_XML_BYTES) throw new Error('timetables_too_large');
    return text;
  }

  /** The next call worth making: a station number, a plan, then changes. */
  function nextTask() {
    const t = now();
    for (const hub of hubs) {
      const known = stations.get(hub);
      if (!known || (!known.eva && t - known.failedAt > STATION_RETRY_MS))
        return { kind: 'station', hub };
    }
    // This hour's plans, then the changes, then next hour's plans: the
    // first delays show after one round instead of after every plan.
    const planDue = ({ date, hour }) => {
      for (const hub of hubs) {
        const eva = stations.get(hub)?.eva;
        const key = eva && `${eva}/${date}/${hour}`;
        if (key && !plans.has(key)) return { kind: 'plan', eva, key };
      }
      return null;
    };
    const thisHour = planDue(planSlot(t));
    if (thisHour) return thisHour;
    let oldest = null;
    for (const hub of hubs) {
      const eva = stations.get(hub)?.eva;
      if (!eva) continue;
      const at = changes.get(eva)?.at ?? 0;
      if (t - at >= CHANGES_TTL_MS && (!oldest || at < oldest.at))
        oldest = { kind: 'changes', eva, at };
    }
    return oldest || planDue(planSlot(t + 60 * 60 * 1000));
  }

  /** Make one call; plans older than the previous hour are dropped. */
  async function step() {
    if (busy) return;
    if (now() - lastAsked > IDLE_MS || !credentials()) return stop();
    if (now() < pausedUntil) return;
    const task = nextTask();
    if (!task) return;
    busy = true;
    try {
      if (task.kind === 'station') {
        const xml = await call(`/station/${encodeURIComponent(task.hub)}`);
        const eva = parseStationEva(xml, task.hub);
        stations.set(task.hub, eva ? { eva } : { eva: null, failedAt: now() });
      } else if (task.kind === 'plan') {
        plans.set(task.key, parseTimetableXml(await call(`/plan/${task.key}`)));
        const keep = new Set(
          [-1, 0, 1].map((h) => {
            const { date, hour } = planSlot(now() + h * 60 * 60 * 1000);
            return `${date}/${hour}`;
          }),
        );
        for (const key of plans.keys())
          if (!keep.has(key.split('/').slice(1).join('/'))) plans.delete(key);
      } else {
        changes.set(task.eva, {
          at: now(),
          stops: parseTimetableXml(await call(`/fchg/${task.eva}`)),
        });
      }
      lastError = null;
    } catch (error) {
      lastError = String(error?.message || error);
      // Keys refused (wrong, or no Timetables subscription): wait, then try
      // everything again, so fixed keys work without a restart.
      if (/^timetables_40[13]$/.test(lastError)) {
        pausedUntil = now() + AUTH_PAUSE_MS;
        for (const [hub, known] of stations)
          if (!known.eva) stations.delete(hub);
        return;
      }
      if (task.kind === 'station')
        stations.set(task.hub, { eva: null, failedAt: now() });
      // A failed plan or change is tried again on a later turn.
      if (task.kind === 'changes')
        changes.set(task.eva, {
          at: now() - CHANGES_TTL_MS / 2,
          stops: changes.get(task.eva)?.stops || new Map(),
        });
    } finally {
      busy = false;
      cached = null;
    }
  }

  function start() {
    if (!timer) timer = setTimer(step, callEveryMs);
  }
  function stop() {
    if (timer) clearTimer(timer);
    timer = null;
  }

  /** Our trains' scheduled stops at each hub, keyed by station name key. */
  function callsByHub(value, t) {
    const window = trainsBetween(
      value,
      t - 3 * 60 * 60 * 1000,
      t + 2 * 60 * 60 * 1000,
    );
    const hubOf = new Map();
    for (const hub of hubs) for (const key of hubKeys(hub)) hubOf.set(key, hub);
    const byHub = new Map();
    for (const train of window.trains)
      for (const [station, arrival, departure] of train.stops) {
        const hub = hubOf.get(stationKey(window.stations[station][0]));
        if (!hub) continue;
        if (!byHub.has(hub)) byHub.set(hub, []);
        byHub.get(hub).push({
          id: train.id,
          category: train.category,
          arrival: window.from + arrival * 1000,
          departure: window.from + departure * 1000,
        });
      }
    return byHub;
  }

  /**
   * The delays now: `{configured, updatedAt, trains: {id: {number, delay,
   * cancelled}}}`. Asking keeps the polling going.
   */
  async function delays() {
    lastAsked = now();
    if (!credentials())
      return { configured: false, updatedAt: null, trains: {} };
    start();
    if (cached && now() - cached.at < 30_000) return cached.value;
    const t = now();
    const byHub = callsByHub(await timetable(), t);
    const observations = [];
    let updatedAt = null;
    for (const hub of hubs) {
      const eva = stations.get(hub)?.eva;
      const calls = byHub.get(hub);
      if (!eva || !calls) continue;
      const planned = new Map();
      for (const [key, stops] of plans)
        if (key.startsWith(`${eva}/`))
          for (const [id, s] of stops) planned.set(id, s);
      const change = changes.get(eva);
      if (change) updatedAt = Math.max(updatedAt ?? 0, change.at);
      observations.push(
        ...matchStation(calls, planned, change?.stops || new Map()),
      );
    }
    const value = {
      configured: true,
      updatedAt,
      error: lastError,
      trains: pickDelays(observations, t),
    };
    cached = { at: now(), value };
    return value;
  }

  return { delays, step, stop, nextTask };
}
