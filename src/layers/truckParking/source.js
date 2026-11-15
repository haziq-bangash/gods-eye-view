import { readResponseJsonCapped } from '../../sources/httpBody.js';

/** Request truck rest-area rows through the bounded, same-origin proxy. */
export function createTruckParkingSource({
  fetchImpl = (...args) => globalThis.fetch(...args),
} = {}) {
  /**
   * The rows with how fresh they are: the proxy answers from its last
   * snapshot, marked stale, while the Autobahn API is unreachable.
   * @returns {Promise<{rows: object[], stale: boolean, fetchedAt: number|null}>}
   */
  async function getSnapshotDetail({ signal } = {}) {
    signal?.throwIfAborted();
    const response = await fetchImpl('/api/autobahn/parking', { signal });
    if (!response.ok) throw new Error(`Parking HTTP ${response.status}`);
    const payload = await readResponseJsonCapped(
      response,
      24 * 1024 * 1024,
      signal,
    );
    signal?.throwIfAborted();
    if (!Array.isArray(payload?.rows))
      throw new Error('Malformed parking snapshot');
    return {
      rows: payload.rows,
      stale: payload.stale === true,
      fetchedAt: Number.isFinite(payload.fetchedAt) ? payload.fetchedAt : null,
    };
  }

  return {
    /** The rest-area rows (see getSnapshotDetail for staleness). */
    async getSnapshot(options = {}) {
      return (await getSnapshotDetail(options)).rows;
    },
    getSnapshotDetail,
  };
}
