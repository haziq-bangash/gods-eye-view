import { readResponseJsonCapped } from '../../sources/httpBody.js';

/** Request normalized Autobahn events through the bounded, same-origin proxy. */
export function createAutobahnSource({
  fetchImpl = (...args) => globalThis.fetch(...args),
} = {}) {
  /**
   * The rows with how fresh and complete they are: the proxy answers from its
   * last snapshot, marked stale, while the Autobahn API is unreachable, and
   * lists road/service requests that failed in a partial refresh.
   * @returns {Promise<{rows: object[], stale: boolean, fetchedAt: number|null, failed: string[]}>}
   */
  async function getSnapshotDetail({ signal } = {}) {
    signal?.throwIfAborted();
    const response = await fetchImpl('/api/autobahn/events', { signal });
    if (!response.ok) throw new Error(`Autobahn HTTP ${response.status}`);
    const payload = await readResponseJsonCapped(
      response,
      32 * 1024 * 1024,
      signal,
    );
    signal?.throwIfAborted();
    if (!Array.isArray(payload?.rows))
      throw new Error('Malformed Autobahn snapshot');
    return {
      rows: payload.rows,
      stale: payload.stale === true,
      fetchedAt: Number.isFinite(payload.fetchedAt) ? payload.fetchedAt : null,
      failed: Array.isArray(payload.failed)
        ? payload.failed.filter((entry) => typeof entry === 'string')
        : [],
    };
  }

  return {
    /** The event rows (see getSnapshotDetail for staleness). */
    async getSnapshot(options = {}) {
      return (await getSnapshotDetail(options)).rows;
    },
    getSnapshotDetail,
  };
}
