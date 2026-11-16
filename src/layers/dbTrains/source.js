import { readResponseJsonCapped } from '../../sources/httpBody.js';
import { validTrainWindow } from '../../freight/dbTrains.js';

/** Request the long-distance trains of the next 90 minutes through the proxy. */
export function createDbTrainsSource({
  fetchImpl = (...args) => globalThis.fetch(...args),
} = {}) {
  /** @returns {Promise<ReturnType<typeof import('../../freight/dbTrains.js').trainsBetween>>} */
  async function getSnapshot({ signal } = {}) {
    signal?.throwIfAborted();
    const response = await fetchImpl('/api/db-trains/now', { signal });
    if (!response.ok) throw new Error(`Trains HTTP ${response.status}`);
    const payload = await readResponseJsonCapped(
      response,
      8 * 1024 * 1024,
      signal,
    );
    signal?.throwIfAborted();
    if (!validTrainWindow(payload)) throw new Error('Malformed train window');
    return payload;
  }
  /**
   * Real delays where Deutsche Bahn reports them, by train id:
   * `{configured, updatedAt, trains: {id: {number, delay, cancelled}}}`.
   * Without DB keys on the server `configured` is false and the map keeps
   * timetable positions.
   */
  async function getDelays({ signal } = {}) {
    signal?.throwIfAborted();
    const response = await fetchImpl('/api/db-trains/delays', { signal });
    if (!response.ok) throw new Error(`Train delays HTTP ${response.status}`);
    const payload = await readResponseJsonCapped(
      response,
      2 * 1024 * 1024,
      signal,
    );
    signal?.throwIfAborted();
    const trains = {};
    if (payload?.trains && typeof payload.trains === 'object')
      for (const [id, row] of Object.entries(payload.trains)) {
        if (!Number.isFinite(row?.delay)) continue;
        trains[id] = {
          number: typeof row.number === 'string' ? row.number : '',
          delay: row.delay,
          cancelled: row.cancelled === true,
        };
      }
    return {
      configured: payload?.configured === true,
      updatedAt: Number.isFinite(payload?.updatedAt) ? payload.updatedAt : null,
      trains,
    };
  }
  return { getSnapshot, getDelays };
}
