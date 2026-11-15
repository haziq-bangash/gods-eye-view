import * as Cesium from 'cesium';
import { msg, t } from '../../i18n/index.js';
export * from './records.js';
export { createTruckParkingSource } from './source.js';

const PICK_PREFIX = 'truck-parking:';
const COLOR_OK = '#007aff';
const COLOR_AFFECTED = '#ff3b30';
const NEAR_ROAD = new Cesium.DistanceDisplayCondition(0, 600_000);
const NEAR_ANY = new Cesium.DistanceDisplayCondition(0, Number.MAX_VALUE);

/** One rounded "P" sign per colour, as an SVG data URL. */
const _signs = new Map();
export function parkingSign(color) {
  if (!_signs.has(color)) {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
      `<rect x="2" y="2" width="28" height="28" rx="8" fill="${color}" stroke="#fff" stroke-width="2.5"/>` +
      '<text x="16" y="22.5" text-anchor="middle" font-family="-apple-system,system-ui,sans-serif" font-size="17" font-weight="800" fill="#fff">P</text>' +
      '</svg>';
    _signs.set(color, `data:image/svg+xml,${encodeURIComponent(svg)}`);
  }
  return _signs.get(color);
}

/** Marker size from the number of truck spaces. */
const signSize = (spaces) =>
  Math.round(Math.min(26, 12 + Math.sqrt(Math.max(0, spaces)) * 1.2));

/** Own the truck rest areas on the map, their refresh and click selection. */
export function createTruckParkingLayer({
  source,
  screenSpaceEventHandlerFactory = null,
  picking = null,
  pointer = null,
  // A host shell (Nadelöhr) shows the selection and feeds the affected ids.
  onSelect = null,
  onRows = null,
} = {}) {
  if (typeof source?.getSnapshot !== 'function')
    throw new TypeError('Truck parking layer requires a snapshot source');
  let _viewer = null;
  let _request = null;
  let _signature = null;
  let _dataSource = null;
  let _lastUpdate = null;
  let _lastError = null;
  let _stale = false;
  let _enabled = false;
  let _clickHandler = null;
  let _selectedId = null;
  let _affected = new Set();
  /** @type {Map<string, object>} */
  const _rowById = new Map();
  /** @type {Map<string, Cesium.Entity>} */
  const _entityById = new Map();

  const rows = () => [..._rowById.values()];
  const publishRows = () => onRows?.(_enabled ? rows() : []);
  const publishSelected = () =>
    onSelect?.(_selectedId ? _rowById.get(_selectedId) || null : null);

  function styleEntity(id) {
    const entity = _entityById.get(id);
    const row = _rowById.get(id);
    if (!entity || !row) return;
    const size = signSize(row.lorrySpaces) + (id === _selectedId ? 6 : 0);
    entity.billboard.image = parkingSign(
      _affected.has(id) ? COLOR_AFFECTED : COLOR_OK,
    );
    entity.billboard.width = size;
    entity.billboard.height = size;
    // Hundreds of rest areas: at country scale only the ones near a closure
    // (and the picked one) show; zoom in to see them all.
    entity.billboard.distanceDisplayCondition =
      _affected.has(id) || id === _selectedId ? NEAR_ANY : NEAR_ROAD;
  }

  function pickedParkingId(picked) {
    const pickId = picking.resolvePickId(picked);
    if (typeof pickId !== 'string' || !pickId.startsWith(PICK_PREFIX))
      return null;
    const id = pickId.slice(PICK_PREFIX.length);
    return _rowById.has(id) ? id : null;
  }

  function setSelected(id) {
    const previous = _selectedId;
    _selectedId = id;
    if (previous) styleEntity(previous);
    if (id) styleEntity(id);
    publishSelected();
  }

  function installClickHandler() {
    if (!screenSpaceEventHandlerFactory || !picking || _clickHandler) return;
    if (!_viewer) return;
    _clickHandler = screenSpaceEventHandlerFactory(_viewer);
    _clickHandler.setInputAction((click) => {
      if (pointer && !pointer.isPointerFree()) return;
      const picked = _viewer.scene.pick(click.position);
      const id = picked ? pickedParkingId(picked) : null;
      if (id) return setSelected(id);
      if (picked) return;
      if (_selectedId) setSelected(null);
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  }

  function removeClickHandler() {
    _clickHandler?.destroy();
    _clickHandler = null;
  }

  const layer = {
    id: 'truck-parking',
    name: 'Truck Parking',
    icon: '🅿️',
    source: 'Autobahn GmbH',
    updateInterval: 3_600_000,

    init(viewer) {
      if (_viewer)
        throw new Error('Truck parking layer is already initialized');
      _viewer = viewer;
      _dataSource = new Cesium.CustomDataSource('truck-parking');
      _dataSource.show = false;
      viewer.dataSources.add(_dataSource);
      _lastUpdate = null;
      _lastError = null;
      _stale = false;
      _enabled = false;
    },

    enable() {
      _enabled = true;
      if (_dataSource) _dataSource.show = true;
      installClickHandler();
      publishRows();
    },

    disable() {
      _request?.abort();
      _request = null;
      _enabled = false;
      if (_dataSource) _dataSource.show = false;
      removeClickHandler();
      if (_selectedId) setSelected(null);
      publishRows();
    },

    async update() {
      if (!_enabled || !_dataSource) return false;
      _request?.abort();
      const request = new AbortController();
      _request = request;
      try {
        const snapshot =
          typeof source.getSnapshotDetail === 'function'
            ? await source.getSnapshotDetail({ signal: request.signal })
            : { rows: await source.getSnapshot({ signal: request.signal }) };
        if (request.signal.aborted || _request !== request || !_enabled)
          return false;
        _stale = snapshot.stale === true;
        const signature = JSON.stringify(snapshot.rows);
        if (signature !== _signature) {
          _dataSource.entities.removeAll();
          _rowById.clear();
          _entityById.clear();
          for (const row of snapshot.rows) {
            if (!row?.stableId || _rowById.has(row.stableId)) continue;
            if (!Number.isFinite(row.lat) || !Number.isFinite(row.lon))
              continue;
            if (!(row.lorrySpaces > 0)) continue;
            const entity = new Cesium.Entity({
              id: `${PICK_PREFIX}${row.stableId}`,
              position: Cesium.Cartesian3.fromDegrees(row.lon, row.lat),
              billboard: {
                image: parkingSign(COLOR_OK),
                width: 16,
                height: 16,
                heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
              },
            });
            _dataSource.entities.add(entity);
            _rowById.set(row.stableId, row);
            _entityById.set(row.stableId, entity);
            styleEntity(row.stableId);
          }
          _signature = signature;
        }
        if (_selectedId && !_rowById.has(_selectedId)) _selectedId = null;
        publishSelected();
        publishRows();
        _lastUpdate =
          _stale && Number.isFinite(snapshot.fetchedAt)
            ? snapshot.fetchedAt
            : Date.now();
        _lastError = null;
        return true;
      } catch (e) {
        if (request.signal.aborted || _request !== request || !_enabled)
          return false;
        console.warn('[Data:TruckParking] Fetch error:', e);
        _lastError = e?.message || msg('Truck parking source unavailable');
        _stale = false;
        return false;
      } finally {
        if (_request === request) _request = null;
      }
    },

    destroy(viewer = _viewer) {
      _request?.abort();
      _request = null;
      removeClickHandler();
      _selectedId = null;
      _rowById.clear();
      _entityById.clear();
      _signature = null;
      _viewer = null;
      _enabled = false;
      if (_dataSource) {
        viewer.dataSources.remove(_dataSource, true);
        _dataSource = null;
      }
      _lastUpdate = null;
      _lastError = null;
      _stale = false;
    },

    /**
     * Mark rest areas near active closures (ids from affectedParkingIds);
     * a host recomputes them whenever the Autobahn events change.
     */
    setAffected(ids) {
      _affected = new Set(ids || []);
      for (const id of _entityById.keys()) styleEntity(id);
    },

    getAnalystRecords(maxCount = 1000) {
      if (!_dataSource || !_dataSource.show) return [];
      const limit = Number.isFinite(maxCount)
        ? Math.max(1, Math.floor(maxCount))
        : 1000;
      return rows()
        .slice(0, limit)
        .map(({ stableId, ...facts }) => ({
          id: stableId,
          affected: _affected.has(stableId),
          ...facts,
        }));
    },

    select(id) {
      if (id == null) {
        setSelected(null);
        return true;
      }
      if (!_rowById.has(String(id))) return false;
      setSelected(String(id));
      return true;
    },

    getRowControls() {
      const all = rows();
      return {
        chips: [],
        legend: [
          {
            label: t('Truck rest area'),
            color: COLOR_OK,
            count: all.length - _affected.size,
            blurb: t(
              'Truck spaces at Autobahn rest areas from Autobahn GmbH. Red: blocked or next to an active closure. Live occupancy is not published.',
            ),
          },
          {
            label: t('Near a closure'),
            color: COLOR_AFFECTED,
            count: all.filter((row) => _affected.has(row.stableId)).length,
          },
        ],
      };
    },

    getStats() {
      return {
        count: _rowById.size,
        lastUpdate: _lastUpdate,
        error: _lastError,
        stale: _stale,
      };
    },
  };
  return layer;
}
