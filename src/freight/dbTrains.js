/**
 * Long-distance trains (ICE, IC, EC and night trains) placed on the map from
 * the timetable. Deutsche Bahn publishes no live train positions, so a train
 * is put where the timetable says it is: moving in a straight line between
 * consecutive stops, or standing at a station between arrival and departure.
 * Delays are not included. Portable: no Node, Vue or Cesium.
 *
 * The timetable is gtfs.de's long-distance feed (GTFS, CC BY 4.0, data from
 * DELFI e.V.); see server/providers/dbTrains.js.
 */
import { berlinParts, berlinTime } from './horizon.js';

const HOUR_MS = 3_600_000;

/**
 * Rows of a CSV text as objects keyed by the header, with quoted fields
 * ("a, b" and doubled quotes) read as GTFS writes them.
 * @param {string} text
 * @returns {Array<Record<string, string>>}
 */
export function parseCsv(text) {
  const rows = [];
  let field = '';
  let row = [];
  let quoted = false;
  const source = String(text).replace(/^﻿/, '');
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[i + 1] === '\n') i += 1;
      row.push(field);
      field = '';
      if (row.some((value) => value !== '')) rows.push(row);
      row = [];
    } else field += char;
  }
  row.push(field);
  if (row.some((value) => value !== '')) rows.push(row);
  const [header = [], ...body] = rows;
  return body.map((values) =>
    Object.fromEntries(header.map((key, i) => [key.trim(), values[i] ?? ''])),
  );
}

/** Seconds after the service day's start of "HH:MM:SS" (24:00 and later too). */
export function gtfsSeconds(value) {
  const match = /^(\d{1,3}):(\d{2}):(\d{2})$/.exec(String(value).trim());
  if (!match) return null;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

const ymd = (value) => {
  const match = /^(\d{4})(\d{2})(\d{2})$/.exec(String(value).trim());
  return match ? Number(match[1] + match[2] + match[3]) : null;
};

/**
 * ICE indigo, IC and EC teal, night and other trains grey: colours the
 * Autobahn, river and weather marks do not use, so trains stand apart.
 */
export const TRAIN_COLORS = Object.freeze({
  ICE: '#5856d6',
  IC: '#30b0c7',
  other: '#8e8e93',
});
export const trainColor = (category) =>
  category === 'ICE'
    ? TRAIN_COLORS.ICE
    : category === 'IC' || category === 'EC' || category === 'ECE'
      ? TRAIN_COLORS.IC
      : TRAIN_COLORS.other;

/** Train category from a route's short name: "ICE 83" → "ICE". */
export function trainCategory(name) {
  return (
    String(name || '')
      .trim()
      .split(/\s+/)[0]
      ?.toUpperCase() || ''
  );
}

const WEEKDAY_COLUMNS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

/**
 * A compact timetable from the feed's tables (the parsed rows of stops,
 * routes, trips, stop_times, calendar and calendar_dates).
 */
export function buildTimetable({
  stops = [],
  routes = [],
  trips = [],
  stop_times: stopTimes = [],
  calendar = [],
  calendar_dates: calendarDates = [],
}) {
  const stations = new Map();
  for (const stop of stops) {
    const lat = Number(stop.stop_lat);
    const lon = Number(stop.stop_lon);
    if (!stop.stop_id || !Number.isFinite(lat) || !Number.isFinite(lon))
      continue;
    stations.set(stop.stop_id, {
      name: String(stop.stop_name || '').trim(),
      lat,
      lon,
    });
  }
  const lines = new Map(
    routes.map((route) => [
      route.route_id,
      String(route.route_short_name || route.route_long_name || '').trim(),
    ]),
  );
  const services = new Map();
  for (const row of calendar) {
    services.set(row.service_id, {
      days: WEEKDAY_COLUMNS.map((day) => row[day] === '1'),
      start: ymd(row.start_date),
      end: ymd(row.end_date),
      added: new Set(),
      removed: new Set(),
    });
  }
  for (const row of calendarDates) {
    const date = ymd(row.date);
    if (date === null) continue;
    let service = services.get(row.service_id);
    if (!service) {
      service = {
        days: WEEKDAY_COLUMNS.map(() => false),
        start: null,
        end: null,
        added: new Set(),
        removed: new Set(),
      };
      services.set(row.service_id, service);
    }
    (row.exception_type === '1' ? service.added : service.removed).add(date);
  }
  const timesByTrip = new Map();
  for (const row of stopTimes) {
    const station = stations.get(row.stop_id);
    const arrival = gtfsSeconds(row.arrival_time || row.departure_time);
    const departure = gtfsSeconds(row.departure_time || row.arrival_time);
    if (!station || arrival === null || departure === null) continue;
    let list = timesByTrip.get(row.trip_id);
    if (!list) timesByTrip.set(row.trip_id, (list = []));
    list.push({
      sequence: Number(row.stop_sequence),
      stopId: row.stop_id,
      arrival,
      departure: Math.max(arrival, departure),
      headsign: String(row.stop_headsign || '').trim(),
    });
  }
  const runs = [];
  for (const trip of trips) {
    const times = timesByTrip.get(trip.trip_id);
    if (!times || times.length < 2 || !services.has(trip.service_id)) continue;
    times.sort((a, b) => a.sequence - b.sequence);
    const line = lines.get(trip.route_id) || '';
    runs.push({
      id: String(trip.trip_id),
      line,
      category: trainCategory(line),
      service: trip.service_id,
      headsign:
        String(trip.trip_headsign || '').trim() ||
        times[0].headsign ||
        stations.get(times.at(-1).stopId).name,
      stops: times.map(({ stopId, arrival, departure }) => [
        stopId,
        arrival,
        departure,
      ]),
    });
  }
  return { stations, services, runs };
}

/** Whether a service runs on a date (yyyymmdd as a number). */
export function runsOn(service, date, weekday) {
  if (!service) return false;
  if (service.removed.has(date)) return false;
  if (service.added.has(date)) return true;
  if (service.start === null || service.end === null) return false;
  return date >= service.start && date <= service.end && service.days[weekday];
}

/**
 * The instant a service day starts, as GTFS counts it: noon minus twelve
 * hours, Berlin time (an hour off midnight on the two days the clocks
 * change, as the spec intends).
 */
export function serviceDayStart(year, month, day) {
  return berlinTime(year, month, day, 12) - 12 * HOUR_MS;
}

/**
 * The trains on the rails at some moment in [since, to] (`since` defaults
 * to `from`; earlier keeps trains that may be running late), with their
 * stops as station indexes and times as seconds after `from`: what the map
 * needs for that window, about 100 kB for an hour and a half.
 * @returns {{from: number, until: number,
 *   stations: Array<[string, number, number]>,
 *   trains: Array<{id: string, line: string, category: string,
 *     headsign: string, stops: Array<[number, number, number]>}>}}
 */
export function trainsBetween(timetable, from, to, { since = from } = {}) {
  const index = new Map();
  const stations = [];
  const stationIndex = (stopId) => {
    if (!index.has(stopId)) {
      const { name, lat, lon } = timetable.stations.get(stopId);
      index.set(stopId, stations.length);
      stations.push([
        name,
        Math.round(lat * 1e5) / 1e5,
        Math.round(lon * 1e5) / 1e5,
      ]);
    }
    return index.get(stopId);
  };
  const trains = [];
  const seen = new Set();
  // A run that started yesterday (night trains, times past 24:00) can still
  // be on the rails: look at the service days from two days back.
  const today = berlinParts(from);
  for (let back = 2; back >= 0; back -= 1) {
    const noon = Date.UTC(today.year, today.month - 1, today.day - back, 12);
    const civil = new Date(noon);
    const year = civil.getUTCFullYear();
    const month = civil.getUTCMonth() + 1;
    const day = civil.getUTCDate();
    const date = year * 10000 + month * 100 + day;
    const weekday = civil.getUTCDay();
    const start = serviceDayStart(year, month, day);
    if (start > to) continue;
    for (const run of timetable.runs) {
      if (!runsOn(timetable.services.get(run.service), date, weekday)) continue;
      const first = start + run.stops[0][2] * 1000;
      const last = start + run.stops.at(-1)[1] * 1000;
      if (first > to || last < since) continue;
      const key = `${run.id}@${date}`;
      if (seen.has(key)) continue;
      seen.add(key);
      trains.push({
        id: key,
        line: run.line,
        category: run.category,
        headsign: run.headsign,
        stops: run.stops.map(([stopId, arrival, departure]) => [
          stationIndex(stopId),
          Math.round((start + arrival * 1000 - from) / 1000),
          Math.round((start + departure * 1000 - from) / 1000),
        ]),
      });
    }
  }
  return { from, until: to, stations, trains };
}

const toRad = (deg) => (deg * Math.PI) / 180;

/** Compass bearing from one point to another, degrees clockwise from north. */
export function bearing(a, b) {
  const φ1 = toRad(a.lat);
  const φ2 = toRad(b.lat);
  const Δλ = toRad(b.lon - a.lon);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/**
 * Where a train of a `trainsBetween` window is at `ms`, or null before its
 * first departure and after its last arrival. Between stations it moves at
 * an even pace in a straight line; `stop` is the station it stands at, else
 * null; `next` is the station it heads for, with its arrival. A `delay` in
 * seconds runs the train that much behind the timetable, and its times with it.
 */
export function trainPosition(window, train, ms, delay = 0) {
  const shift = (Number.isFinite(delay) ? delay : 0) * 1000;
  const t = (ms - shift - window.from) / 1000;
  const stops = train.stops;
  if (!stops?.length || t < stops[0][2] || t > stops.at(-1)[1]) return null;
  const station = (i) => {
    const [name, lat, lon] = window.stations[stops[i][0]];
    return { name, lat, lon };
  };
  const at = (seconds) => window.from + seconds * 1000 + shift;
  for (let i = 0; i < stops.length; i += 1) {
    const [, arrival, departure] = stops[i];
    if (t >= arrival && t <= departure) {
      const here = station(i);
      const next = i + 1 < stops.length ? station(i + 1) : null;
      const previous = i > 0 ? station(i - 1) : null;
      return {
        lat: here.lat,
        lon: here.lon,
        heading: next
          ? bearing(here, next)
          : previous
            ? bearing(previous, here)
            : 0,
        stop: { ...here, departs: at(departure) },
        next: next ? { ...next, arrives: at(stops[i + 1][1]) } : null,
        from: station(0).name,
        progress: i / (stops.length - 1),
      };
    }
    if (i + 1 < stops.length && t > departure && t < stops[i + 1][1]) {
      const a = station(i);
      const b = station(i + 1);
      const f = (t - departure) / (stops[i + 1][1] - departure);
      return {
        lat: a.lat + (b.lat - a.lat) * f,
        lon: a.lon + (b.lon - a.lon) * f,
        heading: bearing(a, b),
        stop: null,
        previous: { ...a, departed: at(departure) },
        next: { ...b, arrives: at(stops[i + 1][1]) },
        from: station(0).name,
        progress: (i + f) / (stops.length - 1),
      };
    }
  }
  return null;
}

/** Whether a `trainsBetween` payload has the expected shape. */
export function validTrainWindow(value) {
  return (
    Number.isFinite(value?.from) &&
    Number.isFinite(value?.until) &&
    Array.isArray(value.stations) &&
    Array.isArray(value.trains) &&
    value.trains.every(
      (train) =>
        typeof train?.id === 'string' &&
        Array.isArray(train.stops) &&
        train.stops.every(
          (stop) =>
            Array.isArray(stop) &&
            stop.length === 3 &&
            Number.isInteger(stop[0]) &&
            stop[0] >= 0 &&
            stop[0] < value.stations.length &&
            stop.every(Number.isFinite),
        ),
    )
  );
}
