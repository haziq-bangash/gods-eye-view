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
  AUTOBAHN_SEVERITY_COLORS,
  autobahnKindLabel,
  autobahnSeverity,
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
/**
 * Minor events (exit closures and roadworks) are hundreds of low-urgency
 * markers: hidden on the map until asked, though still listed and counted.
 */
const DEFAULT_HIDDEN_KINDS = Object.freeze([
  'roadworks',
  'ramp-closure',
  'short-roadworks',
]);

/** Nearby markers merge into one numbered ring, coloured by the worst. */
const CLUSTER_PIXEL_RANGE = 34;
const _clusterImages = new Map();
function clusterImage(count, color) {
  const key = `${count}|${color}`;
  if (!_clusterImages.has(key)) {
    const label = count > 99 ? '99+' : String(count);
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
      `<circle cx="32" cy="32" r="30" fill="${color}" fill-opacity="0.16"/>` +
      `<circle cx="32" cy="32" r="22" fill="${color}" fill-opacity="0.24"/>` +
      `<circle cx="32" cy="32" r="15" fill="${color}" stroke="#fff" stroke-width="3"/>` +
      `<text x="32" y="37" text-anchor="middle" font-family="-apple-system,system-ui,sans-serif" font-size="${label.length > 2 ? 11 : 14}" font-weight="700" fill="#fff">${label}</text>` +
      '</svg>';
    _clusterImages.set(key, `data:image/svg+xml,${encodeURIComponent(svg)}`);
  }
  return _clusterImages.get(key);
}

/** Own one Autobahn event display, its refresh lifecycle, filters and click selection. */
export function createAutobahnLayer({
  source,
  overlayHost = null,
  screenSpaceEventHandlerFactory = null,
  picking = null,
  pointer = null,
  // A host shell (Nadelöhr) that shows the selection in its own sheet: it
  // hears every selection and every refreshed row list, and can turn the
  // on-map card off.
  onSelect = null,
  onRows = null,
  showCard = true,
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

  // Listed: on a shown road. Drawn: listed, of a shown kind — or selected,
  // so an event picked from a host's list appears even when its kind is off.
  const isListed = (row) => !_hiddenRoads.has(row.road);
  const isVisible = (row) =>
    isListed(row) &&
    (!_hiddenKinds.has(row.kind) || row.stableId === _selectedId);
  const visibleRows = () => [..._rowById.values()].filter(isVisible);
  const canSelect = () =>
    overlayHost && screenSpaceEventHandlerFactory && picking;
  const notifyRowControls = () => _rowControlsListener?.();

  /** Show or hide each event's markers for the filters and selection. */
  function syncShown() {
    for (const [id, entities] of _entitiesById) {
      const row = _rowById.get(id);
      const show = Boolean(row && isVisible(row));
      for (const entity of entities) entity.show = show;
    }
  }

  function publishSelectedCard() {
    syncShown();
    if (!canSelect()) return;
    const row = _selectedId ? _rowById.get(_selectedId) : null;
    if (!row || !isListed(row)) {
      _selectedId = null;
      _selectedCardId = null;
      overlayHost.setEntries(AUTOBAHN_OVERLAY_SOURCE_ID, [], CARD_HOST_OPTIONS);
      onSelect?.(null);
      return;
    }
    onSelect?.(row);
    if (!showCard) {
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
      // A numbered ring: zoom in until its events separate.
      if (Array.isArray(picked?.id)) {
        zoomToCluster(picked.id);
        return;
      }
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

  function zoomToCluster(entities) {
    const points = entities
      .map((entity) =>
        _rowById.get(
          String(entity?.id || '')
            .slice(PICK_PREFIX.length)
            .replace(/:(point|line)$/, ''),
        ),
      )
      .filter(Boolean)
      .map((row) => Cesium.Cartographic.fromDegrees(row.lon, row.lat));
    if (!points.length) return;
    const rect = Cesium.Rectangle.fromCartographicArray(points);
    const pad = Math.max(rect.width, rect.height, 0.004) * 0.6;
    _viewer.camera.flyTo({
      destination: new Cesium.Rectangle(
        rect.west - pad,
        rect.south - pad,
        rect.east + pad,
        rect.north + pad,
      ),
      orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 },
      duration: 1.2,
    });
  }

  function removeClickHandler() {
    if (_clickHandler) {
      _clickHandler.destroy();
      _clickHandler = null;
    }
  }

  function clearSelection() {
    if (_selectedId) onSelect?.(null);
    _selectedId = null;
    _selectedCardId = null;
    if (overlayHost) {
      overlayHost.clearSource(AUTOBAHN_OVERLAY_SOURCE_ID);
      overlayHost.setVisible?.(AUTOBAHN_OVERLAY_SOURCE_ID, false);
    }
  }

  function applyFilters() {
    syncShown();
    if (_selectedId) publishSelectedCard();
    notifyRowControls();
    publishRows();
  }

  /** Tell a host shell every row on a shown road, whatever its kind. */
  function publishRows() {
    onRows?.(_enabled ? [..._rowById.values()].filter(isListed) : []);
  }

  function installClustering() {
    const clustering = _dataSource.clustering;
    clustering.pixelRange = CLUSTER_PIXEL_RANGE;
    clustering.minimumClusterSize = 2;
    clustering.clusterBillboards = false;
    clustering.clusterLabels = false;
    clustering.clusterPoints = true;
    clustering.enabled = true;
    clustering.clusterEvent.addEventListener((entities, cluster) => {
      let worst = 'minor';
      for (const entity of entities) {
        const id = String(entity.id || '')
          .slice(PICK_PREFIX.length)
          .replace(/:(point|line)$/, '');
        const severity = autobahnSeverity(_rowById.get(id)?.kind);
        if (severity === 'critical') {
          worst = severity;
          break;
        }
        if (severity === 'major') worst = severity;
      }
      cluster.label.show = false;
      cluster.point.show = false;
      cluster.billboard.show = true;
      cluster.billboard.id = cluster.label.id;
      cluster.billboard.image = clusterImage(
        entities.length,
        AUTOBAHN_SEVERITY_COLORS[worst],
      );
      const size = Math.min(56, 34 + Math.sqrt(entities.length) * 4);
      cluster.billboard.width = size;
      cluster.billboard.height = size;
      cluster.billboard.verticalOrigin = Cesium.VerticalOrigin.CENTER;
      cluster.billboard.disableDepthTestDistance = Number.POSITIVE_INFINITY;
    });
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
      installClustering();
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
        publishRows();
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

    /**
     * Select one event by id (a host's list), as a click on its marker does;
     * null clears the selection.
     */
    select(id) {
      if (!canSelect()) return false;
      if (id == null) {
        if (_selectedId) {
          _selectedId = null;
          publishSelectedCard();
        }
        return true;
      }
      const row = _rowById.get(String(id));
      if (!row || !isListed(row)) return false;
      _selectedId = row.stableId;
      publishSelectedCard();
      return true;
    },

    /** Whether an event kind is listed and drawn (long-term roadworks start hidden). */
    isKindVisible(kind) {
      return !_hiddenKinds.has(kind);
    },

    /** Show or hide one event kind, as the row chips do. */
    setKindVisible(kind, visible) {
      if (!AUTOBAHN_KINDS.includes(kind)) return false;
      if (visible) _hiddenKinds.delete(kind);
      else _hiddenKinds.add(kind);
      applyFilters();
      return true;
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
