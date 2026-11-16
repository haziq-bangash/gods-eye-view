import * as Cesium from 'cesium';
import { msg, t } from '../../i18n/index.js';
import {
  TRAIN_COLORS,
  trainColor,
  trainPosition,
  trainStops,
} from '../../freight/dbTrains.js';
export { createDbTrainsSource } from './source.js';
export { TRAIN_COLORS, trainColor };

const PICK_PREFIX = 'db-trains:';
/** Positions move once a second: a train covers under 100 m in that time. */
const TICK_MS = 1000;
const LABEL_NEAR = new Cesium.DistanceDisplayCondition(0, 250_000);
/** The server reads each hub's changes every two minutes; ask every minute. */
const DELAY_POLL_MS = 60_000;
/** Moving the pointer this far with the button down is a pan: stop following. */
const DRAG_PX = 6;

/**
 * A rounded square with an arrow pointing north, per colour, as an SVG:
 * square, so trains never read as the round Autobahn and river marks.
 */
const _signs = new Map();
export function trainSign(color) {
  if (!_signs.has(color)) {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
      `<rect x="3" y="3" width="26" height="26" rx="8" fill="${color}" stroke="#fff" stroke-width="2.5"/>` +
      '<path d="M16 7.5 L22.5 21 L16 17.5 L9.5 21 Z" fill="#fff"/>' +
      '</svg>';
    _signs.set(color, `data:image/svg+xml,${encodeURIComponent(svg)}`);
  }
  return _signs.get(color);
}

/**
 * Own the long-distance trains on the map: the timetable window, the
 * once-a-second move and click selection. Positions are estimates from the
 * timetable; the layer and the card say so.
 */
export function createDbTrainsLayer({
  source,
  screenSpaceEventHandlerFactory = null,
  picking = null,
  pointer = null,
  // A host shell (Nadelöhr) shows the picked train.
  onSelect = null,
  now = () => Date.now(),
} = {}) {
  if (typeof source?.getSnapshot !== 'function')
    throw new TypeError('Train layer requires a snapshot source');
  let _viewer = null;
  let _dataSource = null;
  let _window = null;
  let _request = null;
  let _timer = null;
  let _enabled = false;
  let _clickHandler = null;
  let _selectedId = null;
  let _lastUpdate = null;
  let _lastError = null;
  let _delayTimer = null;
  let _delayRequest = null;
  let _following = false;
  let _flyingUntil = 0;
  let _dragFrom = null;
  /** Real delays by train id, when the server has DB keys. */
  let _delays = { configured: false, updatedAt: null, trains: {} };
  /** @type {Map<string, string>} the label text each entity shows */
  const _labelById = new Map();
  /** @type {Map<string, object>} */
  const _trainById = new Map();
  /** @type {Map<string, Cesium.Entity>} */
  const _entityById = new Map();
  /** @type {Map<string, object>} */
  const _positionById = new Map();

  /** The picked train with where it is now, for the card. */
  function selectedRow() {
    const train = _selectedId ? _trainById.get(_selectedId) : null;
    const position = train ? _positionById.get(_selectedId) : null;
    if (!train || !position) return null;
    const { stops: _stops, ...facts } = train;
    const live = _delays.trains[_selectedId];
    return {
      ...facts,
      ...position,
      stops: trainStops(_window, train, now(), live?.delay || 0),
      number: live?.number || '',
      // Seconds behind the timetable; null where DB has not reported it.
      delay: live ? live.delay : null,
      delaysOn: _delays.configured,
      following: _following,
    };
  }
  const publishSelected = () => onSelect?.(selectedRow());

  function styleEntity(id) {
    const entity = _entityById.get(id);
    const train = _trainById.get(id);
    if (!entity || !train) return;
    const size = id === _selectedId ? 26 : 16;
    entity.billboard.width = size;
    entity.billboard.height = size;
    entity.label.show = id === _selectedId || train.category === 'ICE';
  }

  /** Keep the camera straight above the followed train, at its height. */
  function followCamera(position) {
    const camera = _viewer?.camera;
    if (!camera || now() < _flyingUntil) return;
    const ellipsoid = _viewer.scene.globe.ellipsoid;
    const height = ellipsoid.cartesianToCartographic(camera.position)?.height;
    camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(
        position.lon,
        position.lat,
        Number.isFinite(height) ? height : 60_000,
      ),
      orientation: {
        heading: camera.heading,
        pitch: -Cesium.Math.PI_OVER_TWO,
        roll: 0,
      },
    });
  }

  /**
   * Move every train to where the timetable has it now, behind it by its
   * reported delay; cancelled trains leave the map.
   */
  function tick() {
    if (!_enabled || !_window || !_dataSource) return;
    const ms = now();
    for (const [id, train] of _trainById) {
      const entity = _entityById.get(id);
      const live = _delays.trains[id];
      const position = live?.cancelled
        ? null
        : trainPosition(_window, train, ms, live?.delay || 0);
      // The real number when DB reports one, with the delay from 2 minutes.
      const late = live ? Math.round(live.delay / 60) : 0;
      const label =
        (live?.number || train.line || train.category) +
        (late >= 2 ? ` +${late}` : '');
      if (_labelById.get(id) !== label) {
        _labelById.set(id, label);
        entity.label.text = label;
      }
      if (!position) {
        entity.show = false;
        _positionById.delete(id);
        continue;
      }
      _positionById.set(id, position);
      entity.show = true;
      entity.position = Cesium.Cartesian3.fromDegrees(
        position.lon,
        position.lat,
      );
      entity.billboard.rotation = -Cesium.Math.toRadians(position.heading);
    }
    if (_selectedId && !_positionById.has(_selectedId)) {
      _selectedId = null;
      _following = false;
    }
    if (_following && _selectedId) followCamera(_positionById.get(_selectedId));
    publishSelected();
  }

  async function refreshDelays() {
    if (!_enabled || typeof source.getDelays !== 'function') return;
    _delayRequest?.abort();
    const request = new AbortController();
    _delayRequest = request;
    try {
      const delays = await source.getDelays({ signal: request.signal });
      if (request.signal.aborted || !_enabled) return;
      _delays = delays;
      tick();
    } catch (e) {
      if (!request.signal.aborted)
        console.warn('[Data:DbTrains] Delay fetch error:', e);
    } finally {
      if (_delayRequest === request) _delayRequest = null;
    }
  }

  function startTicking() {
    if (_timer) return;
    _timer = setInterval(tick, TICK_MS);
    _timer?.unref?.();
    _delayTimer = setInterval(refreshDelays, DELAY_POLL_MS);
    _delayTimer?.unref?.();
    refreshDelays();
  }
  function stopTicking() {
    clearInterval(_timer);
    _timer = null;
    clearInterval(_delayTimer);
    _delayTimer = null;
    _delayRequest?.abort();
    _delayRequest = null;
  }

  function setWindow(window) {
    _window = window;
    _dataSource.entities.removeAll();
    _trainById.clear();
    _entityById.clear();
    _positionById.clear();
    _labelById.clear();
    for (const train of window.trains) {
      if (_trainById.has(train.id)) continue;
      const color = trainColor(train.category);
      const entity = new Cesium.Entity({
        id: `${PICK_PREFIX}${train.id}`,
        show: false,
        position: Cesium.Cartesian3.fromDegrees(0, 0),
        billboard: {
          image: trainSign(color),
          width: 16,
          height: 16,
          alignedAxis: Cesium.Cartesian3.UNIT_Z,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
          text: train.line || train.category,
          // A white pill with coloured text: outlined text blurs on the map.
          font: '700 11px -apple-system, system-ui, sans-serif',
          fillColor: Cesium.Color.fromCssColorString(color),
          showBackground: true,
          backgroundColor: Cesium.Color.WHITE.withAlpha(0.95),
          backgroundPadding: new Cesium.Cartesian2(6, 3),
          style: Cesium.LabelStyle.FILL,
          pixelOffset: new Cesium.Cartesian2(0, -18),
          distanceDisplayCondition: LABEL_NEAR,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
      _dataSource.entities.add(entity);
      _trainById.set(train.id, train);
      _entityById.set(train.id, entity);
      styleEntity(train.id);
    }
    if (_selectedId && !_trainById.has(_selectedId)) _selectedId = null;
    tick();
  }

  function pickedTrainId(picked) {
    const pickId = picking.resolvePickId(picked);
    if (typeof pickId !== 'string' || !pickId.startsWith(PICK_PREFIX))
      return null;
    const id = pickId.slice(PICK_PREFIX.length);
    return _trainById.has(id) ? id : null;
  }

  function setSelected(id) {
    const previous = _selectedId;
    if (id !== previous) _following = false;
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
      const id = picked ? pickedTrainId(picked) : null;
      if (id) return setSelected(id);
      if (picked) return;
      if (_selectedId) setSelected(null);
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    // Panning the map hands the camera back to the user.
    _clickHandler.setInputAction((down) => {
      _dragFrom = down.position;
    }, Cesium.ScreenSpaceEventType.LEFT_DOWN);
    _clickHandler.setInputAction((move) => {
      if (!_dragFrom || !_following) return;
      const dx = move.endPosition.x - _dragFrom.x;
      const dy = move.endPosition.y - _dragFrom.y;
      if (Math.hypot(dx, dy) > DRAG_PX) {
        _following = false;
        publishSelected();
      }
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
    _clickHandler.setInputAction(() => {
      _dragFrom = null;
    }, Cesium.ScreenSpaceEventType.LEFT_UP);
    _clickHandler.setInputAction(() => {
      if (!_following) return;
      _following = false;
      publishSelected();
    }, Cesium.ScreenSpaceEventType.PINCH_START);
  }

  function removeClickHandler() {
    _clickHandler?.destroy();
    _clickHandler = null;
  }

  const counts = () => {
    const out = { ICE: 0, IC: 0, other: 0 };
    for (const id of _positionById.keys()) {
      const color = trainColor(_trainById.get(id)?.category);
      if (color === TRAIN_COLORS.ICE) out.ICE += 1;
      else if (color === TRAIN_COLORS.IC) out.IC += 1;
      else out.other += 1;
    }
    return out;
  };

  return {
    id: 'db-trains',
    name: 'Long-distance Trains',
    icon: '🚄',
    source: 'gtfs.de (DELFI)',
    // The window covers 90 minutes; asking every 20 keeps well ahead.
    updateInterval: 20 * 60 * 1000,

    init(viewer) {
      if (_viewer) throw new Error('Train layer is already initialized');
      _viewer = viewer;
      _dataSource = new Cesium.CustomDataSource('db-trains');
      _dataSource.show = false;
      viewer.dataSources.add(_dataSource);
    },

    enable() {
      _enabled = true;
      if (_dataSource) _dataSource.show = true;
      installClickHandler();
      startTicking();
      tick();
    },

    disable() {
      _request?.abort();
      _request = null;
      _enabled = false;
      stopTicking();
      if (_dataSource) _dataSource.show = false;
      removeClickHandler();
      _following = false;
      if (_selectedId) setSelected(null);
    },

    async update() {
      if (!_enabled || !_dataSource) return false;
      _request?.abort();
      const request = new AbortController();
      _request = request;
      try {
        const window = await source.getSnapshot({ signal: request.signal });
        if (request.signal.aborted || _request !== request || !_enabled)
          return false;
        setWindow(window);
        _lastUpdate = now();
        _lastError = null;
        return true;
      } catch (e) {
        if (request.signal.aborted || _request !== request || !_enabled)
          return false;
        console.warn('[Data:DbTrains] Fetch error:', e);
        _lastError = e?.message || msg('Train timetable unavailable');
        return false;
      } finally {
        if (_request === request) _request = null;
      }
    },

    destroy(viewer = _viewer) {
      _request?.abort();
      _request = null;
      stopTicking();
      removeClickHandler();
      _selectedId = null;
      _trainById.clear();
      _entityById.clear();
      _positionById.clear();
      _window = null;
      _viewer = null;
      _enabled = false;
      if (_dataSource) {
        viewer.dataSources.remove(_dataSource, true);
        _dataSource = null;
      }
      _lastUpdate = null;
      _lastError = null;
    },

    getDelays() {
      return _delays;
    },

    getAnalystRecords(maxCount = 500) {
      if (!_dataSource?.show) return [];
      const limit = Number.isFinite(maxCount)
        ? Math.max(1, Math.floor(maxCount))
        : 500;
      return [..._positionById].slice(0, limit).map(([id, position]) => {
        const { line, category, headsign } = _trainById.get(id);
        return {
          id,
          line,
          category,
          headsign,
          lat: position.lat,
          lon: position.lon,
          atStation: position.stop?.name || null,
          nextStop: position.next?.name || null,
          estimatedFromTimetable: true,
        };
      });
    },

    /**
     * Keep the camera on the picked train as it moves (true), or let go
     * (false). Panning the map lets go too; zooming keeps following.
     */
    follow(on = true) {
      const position = _selectedId ? _positionById.get(_selectedId) : null;
      _following = Boolean(on && position);
      if (_following) {
        const camera = _viewer.camera;
        const height = _viewer.scene.globe.ellipsoid.cartesianToCartographic(
          camera.position,
        )?.height;
        camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(
            position.lon,
            position.lat,
            Math.min(Number.isFinite(height) ? height : 60_000, 60_000),
          ),
          orientation: {
            heading: camera.heading,
            pitch: -Cesium.Math.PI_OVER_TWO,
            roll: 0,
          },
          duration: 1,
        });
        _flyingUntil = now() + 1100;
      }
      publishSelected();
      return _following;
    },

    select(id) {
      if (id == null) {
        setSelected(null);
        return true;
      }
      if (!_positionById.has(String(id))) return false;
      setSelected(String(id));
      return true;
    },

    getRowControls() {
      const count = counts();
      return {
        chips: [],
        legend: [
          {
            label: t('ICE'),
            color: TRAIN_COLORS.ICE,
            count: count.ICE,
            blurb: t(
              'Long-distance trains placed by the timetable from gtfs.de (DELFI). Deutsche Bahn publishes no live positions, so delays are not shown.',
            ),
          },
          { label: t('IC / EC'), color: TRAIN_COLORS.IC, count: count.IC },
          {
            label: t('Night and other trains'),
            color: TRAIN_COLORS.other,
            count: count.other,
          },
        ],
      };
    },

    getStats() {
      return {
        count: _positionById.size,
        lastUpdate: _lastUpdate,
        error: _lastError,
        stale: false,
      };
    },
  };
}
