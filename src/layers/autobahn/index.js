import * as Cesium from 'cesium';
import { msg, t, tn } from '../../i18n/index.js';
import {
  AUTOBAHN_OVERLAY_SOURCE_ID,
  autobahnAccent,
  buildAutobahnCard,
} from './cards.js';
import {
  AUTOBAHN_KINDS,
  AUTOBAHN_ROADS,
  autobahnKindLabel,
} from './records.js';
export {
  AUTOBAHN_ROADS,
  AUTOBAHN_KINDS,
  normalizeAutobahnServicePayload,
  mergeAutobahnRows,
} from './records.js';
export { createAutobahnSource } from './source.js';
export * from './cards.js';

const PICK_PREFIX = 'autobahn:';
const CARD_HOST_OPTIONS = Object.freeze({
  cohortLimit: 1,
  collisionCapacity: 1,
  moving: false,
});

/** Kinds drawn as a line along the affected stretch as well as a marker. */
const LINE_KINDS = new Set([
  'closure',
  'ramp-closure',
  'warning',
  'short-roadworks',
]);
const POINT_SIZE = Object.freeze({
  closure: 11,
  'ramp-closure': 9,
  warning: 10,
  'short-roadworks': 8,
  roadworks: 6,
});
/** Long-term roadworks are hundreds of low-urgency markers: hidden until asked. */
const DEFAULT_HIDDEN_KINDS = Object.freeze(['roadworks']);

/** Own one Autobahn event display, its refresh lifecycle, filters and click selection. */
export function createAutobahnLayer({
  source,
  overlayHost = null,
  screenSpaceEventHandlerFactory = null,
  picking = null,
  pointer = null,
} = {}) {
  if (typeof source?.getSnapshot !== 'function')
    throw new TypeError('Autobahn layer requires a snapshot source');
  let _viewer = null;
  let _request = null;
  let _signature = null;
  let _dataSource = null;
  let _lastUpdate = null;
  let _lastError = null;
  let _stale = false;
  let _failed = [];
  let _enabled = false;
  let _clickHandler = null;
  let _selectedId = null;
  let _selectedCardId = null;
  let _rowControlsListener = null;
  const _hiddenRoads = new Set();
  const _hiddenKinds = new Set(DEFAULT_HIDDEN_KINDS);
  /** @type {Map<string, object>} */
  const _rowById = new Map();
  /** @type {Map<string, Cesium.Entity[]>} */
  const _entitiesById = new Map();

  const isVisible = (row) =>
    !_hiddenRoads.has(row.road) && !_hiddenKinds.has(row.kind);
  const visibleRows = () => [..._rowById.values()].filter(isVisible);
  const canSelect = () =>
    overlayHost && screenSpaceEventHandlerFactory && picking;
  const notifyRowControls = () => _rowControlsListener?.();

  function publishSelectedCard() {
    if (!canSelect()) return;
    const row = _selectedId ? _rowById.get(_selectedId) : null;
    if (!row || !isVisible(row)) {
      _selectedId = null;
      _selectedCardId = null;
      overlayHost.setEntries(AUTOBAHN_OVERLAY_SOURCE_ID, [], CARD_HOST_OPTIONS);
      return;
    }
    const card = {
      ...buildAutobahnCard(row),
      position: Cesium.Cartesian3.fromDegrees(row.lon, row.lat),
    };
    _selectedCardId = card.id;
    overlayHost.setEntries(
      AUTOBAHN_OVERLAY_SOURCE_ID,
      [card],
      CARD_HOST_OPTIONS,
    );
  }

  function pickedEventId(picked) {
    const pickId = picking.resolvePickId(picked);
    if (typeof pickId !== 'string' || !pickId.startsWith(PICK_PREFIX))
      return null;
    const id = pickId.slice(PICK_PREFIX.length).replace(/:(point|line)$/, '');
    return _rowById.has(id) ? id : null;
  }

  function installClickHandler() {
    if (!canSelect() || _clickHandler || !_viewer) return;
    // Not registered in the pick-ownership registry, like the other
    // reference layers: unowned picks read as empty space to siblings.
    _clickHandler = screenSpaceEventHandlerFactory(_viewer);
    _clickHandler.setInputAction((click) => {
      if (pointer && !pointer.isPointerFree()) return;
      const cardHit = overlayHost.hitTest?.(
        click.position?.x,
        click.position?.y,
        { sourceId: AUTOBAHN_OVERLAY_SOURCE_ID },
      );
      if (cardHit && cardHit.entryId === _selectedCardId) return;
      const picked = _viewer.scene.pick(click.position);
      const id = picked ? pickedEventId(picked) : null;
      if (id) {
        _selectedId = id;
        publishSelectedCard();
        return;
      }
      if (picked) {
        const pickId = picking.resolvePickId(picked);
        if (pickId && picking.isOwnedByOtherLayer(layer.id, pickId)) return;
      }
      if (_selectedId) {
        _selectedId = null;
        publishSelectedCard();
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  }

  function removeClickHandler() {
    if (_clickHandler) {
      _clickHandler.destroy();
      _clickHandler = null;
    }
  }

  function clearSelection() {
    _selectedId = null;
    _selectedCardId = null;
    if (overlayHost) {
      overlayHost.clearSource(AUTOBAHN_OVERLAY_SOURCE_ID);
      overlayHost.setVisible?.(AUTOBAHN_OVERLAY_SOURCE_ID, false);
    }
  }

  function applyFilters() {
    for (const [id, entities] of _entitiesById) {
      const row = _rowById.get(id);
      const show = Boolean(row && isVisible(row));
      for (const entity of entities) entity.show = show;
    }
    if (_selectedId) publishSelectedCard();
    notifyRowControls();
  }

  function entitiesFor(row) {
    const color = Cesium.Color.fromCssColorString(autobahnAccent(row.kind));
    const entities = [
      new Cesium.Entity({
        id: `${PICK_PREFIX}${row.stableId}:point`,
        position: Cesium.Cartesian3.fromDegrees(row.lon, row.lat),
        point: {
          pixelSize: POINT_SIZE[row.kind] || 7,
          color,
          outlineColor: Cesium.Color.BLACK.withAlpha(0.8),
          outlineWidth: 1.5,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      }),
    ];
    if (LINE_KINDS.has(row.kind) && row.line?.length >= 2) {
      entities.push(
        new Cesium.Entity({
          id: `${PICK_PREFIX}${row.stableId}:line`,
          polyline: {
            positions: row.line.map(([lon, lat]) =>
              Cesium.Cartesian3.fromDegrees(lon, lat),
            ),
            clampToGround: true,
            width: row.kind === 'closure' ? 5 : 3,
            material: new Cesium.ColorMaterialProperty(color.withAlpha(0.85)),
          },
        }),
      );
    }
    return entities;
  }

  const layer = {
    id: 'autobahn-traffic',
    name: 'Autobahn Closures & Roadworks',
    icon: '🚧',
    source: 'Autobahn GmbH',
    updateInterval: 300000,

    init(viewer) {
      if (_viewer) throw new Error('Autobahn layer is already initialized');
      _viewer = viewer;
      _dataSource = new Cesium.CustomDataSource('autobahn-traffic');
      _dataSource.show = false;
      viewer.dataSources.add(_dataSource);
      _lastUpdate = null;
      _lastError = null;
      _stale = false;
      _failed = [];
      _enabled = false;
      console.log('[Data:Autobahn] Initialized');
    },

    enable() {
      _enabled = true;
      if (_dataSource) _dataSource.show = true;
      overlayHost?.setVisible?.(AUTOBAHN_OVERLAY_SOURCE_ID, true);
      installClickHandler();
    },

    disable() {
      _request?.abort();
      _request = null;
      _enabled = false;
      if (_dataSource) _dataSource.show = false;
      removeClickHandler();
      clearSelection();
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
        const { rows } = snapshot;
        _stale = snapshot.stale === true;
        _failed = Array.isArray(snapshot.failed) ? snapshot.failed : [];
        const updatedAt =
          _stale && Number.isFinite(snapshot.fetchedAt)
            ? snapshot.fetchedAt
            : Date.now();

        const signature = JSON.stringify(rows);
        if (signature !== _signature) {
          _dataSource.entities.removeAll();
          _rowById.clear();
          _entitiesById.clear();
          for (const row of rows) {
            if (!row?.stableId || _rowById.has(row.stableId)) continue;
            const entities = entitiesFor(row);
            const show = isVisible(row);
            for (const entity of entities) {
              entity.show = show;
              _dataSource.entities.add(entity);
            }
            _rowById.set(row.stableId, row);
            _entitiesById.set(row.stableId, entities);
          }
          _signature = signature;
          console.log(`[Data:Autobahn] Updated: ${_rowById.size} events`);
        }
        if (_selectedId) publishSelectedCard();
        _lastUpdate = updatedAt;
        _lastError = null;
        notifyRowControls();
        return true;
      } catch (e) {
        if (request.signal.aborted || _request !== request || !_enabled)
          return false;
        console.warn('[Data:Autobahn] Fetch error:', e);
        _lastError = e?.message || msg('Autobahn traffic source unavailable');
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
      clearSelection();
      _rowById.clear();
      _entitiesById.clear();
      _signature = null;
      _viewer = null;
      _enabled = false;
      _rowControlsListener = null;
      if (_dataSource) {
        viewer.dataSources.remove(_dataSource, true);
        _dataSource = null;
      }
      _lastUpdate = null;
      _lastError = null;
      _stale = false;
      _failed = [];
    },

    /** Visible event rows as plain JSON-safe records (no line geometry). */
    getAnalystRecords(maxCount = 2000) {
      if (!_dataSource || !_dataSource.show) return [];
      const limit = Number.isFinite(maxCount)
        ? Math.max(1, Math.floor(maxCount))
        : 2000;
      return visibleRows()
        .slice(0, limit)
        .map(({ stableId, line, details, ...facts }) => ({
          id: stableId,
          ...facts,
        }));
    },

    setRowControlsListener(listener) {
      _rowControlsListener = typeof listener === 'function' ? listener : null;
    },

    getRowControls() {
      const chips = AUTOBAHN_ROADS.map((road) => ({
        id: `road-${road}`,
        label: road,
        active: !_hiddenRoads.has(road),
        state: _hiddenRoads.has(road) ? 'idle' : 'active',
        title: _hiddenRoads.has(road)
          ? t('Show events on the {road}', { road })
          : t('Hide events on the {road}', { road }),
        onClick: () => {
          if (_hiddenRoads.has(road)) _hiddenRoads.delete(road);
          else _hiddenRoads.add(road);
          applyFilters();
        },
      }));
      const roadworksHidden = _hiddenKinds.has('roadworks');
      chips.push({
        id: 'long-roadworks',
        label: t('LONG-TERM ROADWORKS'),
        active: !roadworksHidden,
        state: roadworksHidden ? 'idle' : 'active',
        title: roadworksHidden
          ? t('Show long-term roadworks')
          : t('Hide long-term roadworks'),
        onClick: () => {
          if (roadworksHidden) _hiddenKinds.delete('roadworks');
          else _hiddenKinds.add('roadworks');
          applyFilters();
        },
      });
      const rows = [..._rowById.values()].filter(
        (row) => !_hiddenRoads.has(row.road),
      );
      const legend = AUTOBAHN_KINDS.map((kind) => ({
        label: t(autobahnKindLabel(kind)),
        color: autobahnAccent(kind),
        count: rows.filter((row) => row.kind === kind).length,
      }));
      legend[0].blurb = _failed.length
        ? tn(
            _failed.length,
            'Partial update: {count} road feed did not answer. Informational only — follow official signs and notices.',
            'Partial update: {count} road feeds did not answer. Informational only — follow official signs and notices.',
          )
        : t(
            'Current closures, warnings and roadworks on the A1, A2, A3, A5, A7, A40 and A61 from Autobahn GmbH. Informational only — follow official signs and notices.',
          );
      return { chips, legend };
    },

    getStats() {
      return {
        count: visibleRows().length,
        lastUpdate: _lastUpdate,
        error: _lastError,
        stale: _stale,
      };
    },
  };
  return layer;
}
