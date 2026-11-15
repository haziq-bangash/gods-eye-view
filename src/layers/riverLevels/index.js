import * as Cesium from 'cesium';
import { msg, t, formatNumber } from '../../i18n/index.js';
import { GAUGE_COLORS, KAUB, gaugeColor } from './records.js';
export * from './records.js';
export { createRiverLevelSource } from './source.js';

const PICK_PREFIX = 'river-levels:';
const NEAR_GAUGES = new Cesium.DistanceDisplayCondition(0, 700_000);

/** One marker image per colour: a rounded square, white rim, white wave. */
const _markers = new Map();
export function gaugeMarker(color) {
  if (!_markers.has(color)) {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
      `<rect x="2" y="2" width="28" height="28" rx="9" fill="${color}" stroke="#fff" stroke-width="2.5"/>` +
      '<path d="M8 17c2.7-3 5.3-3 8 0s5.3 3 8 0" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/>' +
      '</svg>';
    _markers.set(color, `data:image/svg+xml,${encodeURIComponent(svg)}`);
  }
  return _markers.get(color);
}

/** Own the Rhine and Elbe gauge markers, their refresh and click selection. */
export function createRiverLevelLayer({
  source,
  screenSpaceEventHandlerFactory = null,
  picking = null,
  pointer = null,
  // A host shell (Nadelöhr) shows the selection and the gauge list itself.
  onSelect = null,
  onRows = null,
} = {}) {
  if (typeof source?.getSnapshot !== 'function')
    throw new TypeError('River level layer requires a snapshot source');
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
  /** @type {Map<string, object>} */
  const _rowById = new Map();

  const rows = () => [..._rowById.values()];
  const publishRows = () => onRows?.(_enabled ? rows() : []);
  const publishSelected = () =>
    onSelect?.(_selectedId ? _rowById.get(_selectedId) || null : null);

  function pickedGaugeId(picked) {
    const pickId = picking.resolvePickId(picked);
    if (typeof pickId !== 'string' || !pickId.startsWith(PICK_PREFIX))
      return null;
    const id = pickId.slice(PICK_PREFIX.length).replace(/:label$/, '');
    return _rowById.has(id) ? id : null;
  }

  function installClickHandler() {
    if (!screenSpaceEventHandlerFactory || !picking || _clickHandler) return;
    if (!_viewer) return;
    _clickHandler = screenSpaceEventHandlerFactory(_viewer);
    _clickHandler.setInputAction((click) => {
      if (pointer && !pointer.isPointerFree()) return;
      const picked = _viewer.scene.pick(click.position);
      const id = picked ? pickedGaugeId(picked) : null;
      if (id) {
        _selectedId = id;
        publishSelected();
        return;
      }
      if (picked) {
        const pickId = picking.resolvePickId(picked);
        if (pickId && picking.isOwnedByOtherLayer(layer.id, pickId)) return;
      }
      if (_selectedId) {
        _selectedId = null;
        publishSelected();
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  }

  function removeClickHandler() {
    _clickHandler?.destroy();
    _clickHandler = null;
  }

  function entityFor(row) {
    const isKaub = row.shortname === KAUB;
    const size = isKaub ? 30 : row.key ? 22 : 16;
    return new Cesium.Entity({
      id: `${PICK_PREFIX}${row.stableId}`,
      position: Cesium.Cartesian3.fromDegrees(row.lon, row.lat),
      // A rounded square with a wave, so gauges never read as the round
      // Autobahn markers that share the map.
      billboard: {
        image: gaugeMarker(gaugeColor(row)),
        width: size,
        height: size,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        // At country scale only Kaub and the key gauges show; the rest
        // appear when zoomed in, so the map stays readable.
        distanceDisplayCondition: isKaub || row.key ? undefined : NEAR_GAUGES,
      },
      // Kaub carries its level on the map; the others show it when picked.
      label: isKaub
        ? {
            text: [
              row.name,
              t('{level} cm', { level: formatNumber(row.levelCm) }),
            ].join(' · '),
            font: '600 13px -apple-system, system-ui, sans-serif',
            fillColor: Cesium.Color.fromCssColorString('#f5f4ed'),
            showBackground: true,
            backgroundColor:
              Cesium.Color.fromCssColorString('#351e1c').withAlpha(0.88),
            backgroundPadding: new Cesium.Cartesian2(8, 5),
            pixelOffset: new Cesium.Cartesian2(0, -30),
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          }
        : undefined,
    });
  }

  const layer = {
    id: 'river-levels',
    name: 'Rhine & Elbe Water Levels',
    icon: '🌊',
    source: 'PEGELONLINE (WSV)',
    updateInterval: 900000,

    init(viewer) {
      if (_viewer) throw new Error('River level layer is already initialized');
      _viewer = viewer;
      _dataSource = new Cesium.CustomDataSource('river-levels');
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
      if (_selectedId) {
        _selectedId = null;
        publishSelected();
      }
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
          for (const row of snapshot.rows) {
            if (!row?.stableId || _rowById.has(row.stableId)) continue;
            if (!Number.isFinite(row.lat) || !Number.isFinite(row.lon))
              continue;
            _dataSource.entities.add(entityFor(row));
            _rowById.set(row.stableId, row);
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
        console.warn('[Data:RiverLevels] Fetch error:', e);
        _lastError = e?.message || msg('Water level source unavailable');
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

    /** Gauge rows as plain JSON-safe records. */
    getAnalystRecords(maxCount = 500) {
      if (!_dataSource || !_dataSource.show) return [];
      const limit = Number.isFinite(maxCount)
        ? Math.max(1, Math.floor(maxCount))
        : 500;
      return rows()
        .slice(0, limit)
        .map(({ stableId, ...facts }) => ({ id: stableId, ...facts }));
    },

    /** Select one gauge by id, as a click on its marker does; null clears. */
    select(id) {
      if (id == null) {
        _selectedId = null;
        publishSelected();
        return true;
      }
      if (!_rowById.has(String(id))) return false;
      _selectedId = String(id);
      publishSelected();
      return true;
    },

    getRowControls() {
      return {
        chips: [],
        legend: [
          {
            label: t('Below mean low water'),
            color: GAUGE_COLORS.low,
            count: rows().filter((row) => row.state === 'low').length,
            blurb: t(
              'Rhine and Elbe gauges from PEGELONLINE (WSV); Kaub, the Middle Rhine bottleneck, is labelled. Reference values, not navigation advice.',
            ),
          },
          {
            label: t('Normal'),
            color: GAUGE_COLORS.normal,
            count: rows().filter((row) => row.state === 'normal').length,
          },
          {
            label: t('Above mean high water'),
            color: GAUGE_COLORS.high,
            count: rows().filter((row) => row.state === 'high').length,
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
