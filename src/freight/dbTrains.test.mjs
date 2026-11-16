import assert from 'node:assert/strict';
import test from 'node:test';
import {
  bearing,
  buildTimetable,
  gtfsSeconds,
  parseCsv,
  runsOn,
  serviceDayStart,
  trainCategory,
  trainColor,
  trainPosition,
  trainsBetween,
  validTrainWindow,
} from './dbTrains.js';

const csv = (rows) => rows.map((row) => row.join(',')).join('\n');

/** Hamburg → Hannover → Frankfurt on weekdays in November 2026, and a night train. */
function feed() {
  return {
    stops: parseCsv(
      csv([
        ['stop_name', 'stop_id', 'stop_lat', 'stop_lon'],
        ['Hamburg Hbf', 'HH', '53.553', '10.006'],
        ['Hannover Hbf', 'H', '52.377', '9.741'],
        ['"Frankfurt (Main) Hbf"', 'F', '50.107', '8.663'],
      ]),
    ),
    routes: parseCsv(
      csv([
        ['route_id', 'route_short_name', 'route_type'],
        ['r1', 'ICE 22', '2'],
        ['r2', 'NJ', '2'],
      ]),
    ),
    trips: parseCsv(
      csv([
        ['route_id', 'service_id', 'trip_id'],
        ['r1', 'wd', 't1'],
        ['r2', 'wd', 'n1'],
      ]),
    ),
    stop_times: parseCsv(
      csv([
        [
          'trip_id',
          'arrival_time',
          'departure_time',
          'stop_id',
          'stop_sequence',
        ],
        ['t1', '10:00:00', '10:00:00', 'HH', '0'],
        ['t1', '11:15:00', '11:18:00', 'H', '1'],
        ['t1', '13:30:00', '13:30:00', 'F', '2'],
        ['n1', '23:30:00', '23:30:00', 'HH', '0'],
        ['n1', '25:00:00', '25:00:00', 'F', '1'],
      ]),
    ),
    calendar: parseCsv(
      csv([
        [
          'monday',
          'tuesday',
          'wednesday',
          'thursday',
          'friday',
          'saturday',
          'sunday',
          'start_date',
          'end_date',
          'service_id',
        ],
        ['1', '1', '1', '1', '1', '0', '0', '20261101', '20261130', 'wd'],
      ]),
    ),
    calendar_dates: parseCsv(
      csv([
        ['service_id', 'exception_type', 'date'],
        ['wd', '2', '20261118'],
      ]),
    ),
  };
}

// Monday 16 November 2026 is in winter time: Berlin is UTC+1.
const at = (day, hh, mm) => Date.UTC(2026, 10, day, hh - 1, mm);

test('reads GTFS CSV with quotes and times past midnight', () => {
  assert.deepEqual(parseCsv('a,b\r\n"x, ""y""",2\n'), [
    { a: 'x, "y"', b: '2' },
  ]);
  assert.equal(gtfsSeconds('25:01:30'), 90_090);
  assert.equal(gtfsSeconds('x'), null);
  assert.equal(trainCategory('ICE 83'), 'ICE');
  assert.equal(trainColor('EC'), trainColor('IC'));
  assert.notEqual(trainColor('NJ'), trainColor('ICE'));
});

test('service days follow the calendar and its exceptions', () => {
  const timetable = buildTimetable(feed());
  const service = timetable.services.get('wd');
  assert.equal(runsOn(service, 20261116, 1), true);
  assert.equal(runsOn(service, 20261118, 3), false);
  assert.equal(runsOn(service, 20261121, 6), false);
  assert.equal(serviceDayStart(2026, 11, 16), at(16, 0, 0));
});

test('places a train between stations, at a station, and nowhere outside its run', () => {
  const timetable = buildTimetable(feed());
  const from = at(16, 10, 0);
  const window = trainsBetween(timetable, from, from + 90 * 60_000);
  assert.equal(validTrainWindow(window), true);
  const train = window.trains.find((row) => row.id === 't1@20261116');
  assert.equal(train.line, 'ICE 22');
  assert.equal(train.headsign, 'Frankfurt (Main) Hbf');
  const halfway = trainPosition(window, train, at(16, 10, 37) + 30_000);
  assert.equal(halfway.stop, null);
  assert.equal(halfway.previous.name, 'Hamburg Hbf');
  assert.equal(halfway.next.name, 'Hannover Hbf');
  assert.equal(halfway.next.arrives, at(16, 11, 15));
  assert.ok(Math.abs(halfway.lat - (53.553 + 52.377) / 2) < 1e-9);
  assert.ok(halfway.heading > 180 && halfway.heading < 200);
  const standing = trainPosition(window, train, at(16, 11, 16));
  assert.equal(standing.stop.name, 'Hannover Hbf');
  assert.equal(standing.stop.departs, at(16, 11, 18));
  assert.equal(trainPosition(window, train, at(16, 9, 59)), null);
  assert.equal(trainPosition(window, train, at(16, 13, 31)), null);
});

test('a night train from the day before is still on the rails after midnight', () => {
  const timetable = buildTimetable(feed());
  const from = at(17, 0, 30);
  const window = trainsBetween(timetable, from, from + 60 * 60_000);
  const night = window.trains.find((row) => row.id === 'n1@20261116');
  assert.ok(night, 'Monday night train is running early on Tuesday');
  assert.equal(night.category, 'NJ');
  assert.ok(trainPosition(window, night, from));
  // No trains on the Wednesday the exception removes.
  const wednesday = trainsBetween(timetable, at(18, 10, 0), at(18, 11, 0));
  assert.equal(wednesday.trains.length, 0);
});

test('bearing points the arrow along the track', () => {
  assert.ok(Math.abs(bearing({ lat: 50, lon: 8 }, { lat: 51, lon: 8 })) < 1e-9);
  assert.ok(
    Math.abs(bearing({ lat: 50, lon: 8 }, { lat: 50, lon: 9 }) - 90) < 1,
  );
});

test('rejects windows that point at missing stations', () => {
  assert.equal(
    validTrainWindow({
      from: 0,
      until: 1,
      stations: [],
      trains: [{ id: 'x', stops: [[0, 0, 0]] }],
    }),
    false,
  );
  assert.equal(validTrainWindow(null), false);
});
