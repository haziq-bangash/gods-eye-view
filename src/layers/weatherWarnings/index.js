import * as Cesium from 'cesium';
import { msg, t } from '../../i18n/index.js';
import {
  WARNING_COLORS,
  WARNING_LEVELS,
  WARNING_LEVEL_LABELS,
} from './records.js';
export * from './records.js';
export { createWeatherWarningSource } from './source.js';

const PICK_PREFIX = 'weather-warnings:';

/** Own the DWD warning areas on the map, their refresh and click selection. */
export function createWeatherWarningLayer({
  source,
  screenSpaceEventHandlerFactory = null,
  picking = null,
  pointer = null,
  // A host shell (Nadelöhr) lists the warnings and shows the selection.
  onSelect = null,
  onRows = null,
} = {}) {
  if (typeof source?.getSnapshot !== 'function')
    throw new TypeError('Weather warning layer requires a snapshot source');
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
  /** @type {Map<string, Cesium.Entity[]>} */
  const _entitiesById = new Map();

  const rows = () => [..._rowById.values()];
  const publishRows = () => onRows?.(_enabled ? rows() : []);
  const publishSelected = () =>
    onSelect?.(_selectedId ? _rowById.get(_selectedId) || null : null);

  function styleEntities() {
    for (const [id, entities] of _entitiesById) {
      const row = _rowById.get(id);
      const selected = id === _selectedId;
      const color = Cesium.Color.fromCssColorString(
        WARNING_COLORS[row?.level] || '#8e8e93',
      );
      for (const entity of entities) {
        if (entity.polygon)
          entity.polygon.material = new Cesium.ColorMaterialProperty(
            color.withAlpha(selected ? 0.45 : 0.24),
          );
        if (entity.polyline) entity.polyline.width = selected ? 3 : 1.5;
      }
    }
  }

  function pickedWarningId(picked) {
    const pickId = picking.resolvePickId(picked);
    if (typeof pickId !== 'string' || !pickId.startsWith(PICK_PREFIX))
      return null;
    const id = pickId.slice(PICK_PREFIX.length).replace(/:\d+(:edge)?$/, '');
    return _rowById.has(id) ? id : null;
  }

  function installClickHandler() {
    if (!screenSpaceEventHandlerFactory || !picking || _clickHandler) return;
    if (!_viewer) return;
    _clickHandler = screenSpaceEventHandlerFactory(_viewer);
    _clickHandler.setInputAction((click) => {
      if (pointer && !pointer.isPointerFree()) return;
      const picked = _viewer.scene.pick(click.position);
      const id = picked ? pickedWarningId(picked) : null;
      if (id) {
        _selectedId = id;
        styleEntities();
        publishSelected();
        return;
      }
      // Clicks on other layers' marks are theirs; empty map clears.
      if (picked) return;
      if (_selectedId) {
        _selectedId = null;
        styleEntities();
        publishSelected();
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  }

  function removeClickHandler() {
    _clickHandler?.destroy();
    _clickHandler = null;
  }

  function entitiesFor(row) {
    const color = Cesium.Color.fromCssColorString(
      WARNING_COLORS[row.level] || '#8e8e93',
    );
    const entities = [];
    row.polygons.forEach(([outer, ...holes], index) => {
      const positions = (ring) =>
        ring.map(([lon, lat]) => Cesium.Cartesian3.fromDegrees(lon, lat));
      entities.push(
        new Cesium.Entity({
          id: `${PICK_PREFIX}${row.stableId}:${index}`,
          polygon: {
            hierarchy: new Cesium.PolygonHierarchy(
              positions(outer),
              holes.map((hole) => new Cesium.PolygonHierarchy(positions(hole))),
            ),
            material: new Cesium.ColorMaterialProperty(color.withAlpha(0.24)),
            classificationType: Cesium.ClassificationType.BOTH,
          },
        }),
        new Cesium.Entity({
          id: `${PICK_PREFIX}${row.stableId}:${index}:edge`,
          polyline: {
            positions: positions(outer),
            clampToGround: true,
            width: 1.5,
            material: new Cesium.ColorMaterialProperty(color.withAlpha(0.9)),
          },
        }),
      );
    });
    return entities;
  }

  const layer = {
    id: 'weather-warnings',
    name: 'DWD Weather Warnings',
    icon: '⚠️',
    source: 'Deutscher Wetterdienst',
    updateInterval: 300000,

    init(viewer) {
      if (_viewer)
        throw new Error('Weather warning layer is already initialized');
      _viewer = viewer;
      _dataSource = new Cesium.CustomDataSource('weather-warnings');
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
        const signature = JSON.stringify(
          snapshot.rows.map((row) => [row?.stableId, row?.level, row?.expires]),
        );
        if (signature !== _signature) {
          _dataSource.entities.removeAll();
          _rowById.clear();
          _entitiesById.clear();
          // Least severe first, so the worst areas draw on top.
          const ordered = [...snapshot.rows].sort(
            (a, b) =>
              WARNING_LEVELS.indexOf(a?.level) -
              WARNING_LEVELS.indexOf(b?.level),
          );
          for (const row of ordered) {
            if (!row?.stableId || _rowById.has(row.stableId)) continue;
            if (!Array.isArray(row.polygons) || !row.polygons.length) continue;
            const entities = entitiesFor(row);
            for (const entity of entities) _dataSource.entities.add(entity);
            _rowById.set(row.stableId, row);
            _entitiesById.set(row.stableId, entities);
          }
          _signature = signature;
        }
        if (_selectedId && !_rowById.has(_selectedId)) _selectedId = null;
        styleEntities();
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
        console.warn('[Data:WeatherWarnings] Fetch error:', e);
        _lastError = e?.message || msg('Weather warning source unavailable');
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
      _entitiesById.clear();
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

    /** Warning rows as plain JSON-safe records (areas as bounding boxes). */
    getAnalystRecords(maxCount = 200) {
      if (!_dataSource || !_dataSource.show) return [];
      const limit = Number.isFinite(maxCount)
        ? Math.max(1, Math.floor(maxCount))
        : 200;
      return rows()
        .slice(0, limit)
        .map(({ stableId, polygons, ...facts }) => ({
          id: stableId,
          ...facts,
        }));
    },

    /** Select one warning by id, as a click on its area does; null clears. */
    select(id) {
      if (id == null) {
        _selectedId = null;
      } else if (_rowById.has(String(id))) {
        _selectedId = String(id);
      } else return false;
      styleEntities();
      publishSelected();
      return true;
    },

    getRowControls() {
      return {
        chips: [],
        legend: WARNING_LEVELS.map((level, index) => ({
          label: t(WARNING_LEVEL_LABELS[level]),
          color: WARNING_COLORS[level],
          count: rows().filter((row) => row.level === level).length,
          ...(index === 0
            ? {
                blurb: t(
                  'Official DWD weather warnings by area, coloured by level. Source: Deutscher Wetterdienst.',
                ),
              }
            : {}),
        })),
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
