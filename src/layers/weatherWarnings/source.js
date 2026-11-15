import { readResponseJsonCapped } from '../../sources/httpBody.js';

/** Request DWD warning rows through the bounded, same-origin proxy. */
export function createWeatherWarningSource({
  fetchImpl = (...args) => globalThis.fetch(...args),
} = {}) {
  /**
   * The rows with how fresh they are: the proxy answers from its last
   * snapshot, marked stale, while the DWD server is unreachable.
   * @returns {Promise<{rows: object[], stale: boolean, fetchedAt: number|null}>}
   */
  async function getSnapshotDetail({ signal } = {}) {
    signal?.throwIfAborted();
    const response = await fetchImpl('/api/dwd/warnings', { signal });
    if (!response.ok) throw new Error(`DWD HTTP ${response.status}`);
    const payload = await readResponseJsonCapped(
      response,
      24 * 1024 * 1024,
      signal,
    );
    signal?.throwIfAborted();
    if (!Array.isArray(payload?.rows))
      throw new Error('Malformed warning snapshot');
    return {
      rows: payload.rows,
      stale: payload.stale === true,
      fetchedAt: Number.isFinite(payload.fetchedAt) ? payload.fetchedAt : null,
    };
  }

  return {
    /** The warning rows (see getSnapshotDetail for staleness). */
    async getSnapshot(options = {}) {
      return (await getSnapshotDetail(options)).rows;
    },
    getSnapshotDetail,
  };
}
