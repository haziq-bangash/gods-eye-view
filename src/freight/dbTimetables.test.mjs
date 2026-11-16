import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DELAY_HUBS,
  hubKeys,
  matchStation,
  parseStationEva,
  parseTimetableXml,
  pickDelays,
  stationKey,
  timetableTime,
} from './dbTimetables.js';

// Monday 16 November 2026, winter time (UTC+1).
const at = (hh, mm) => Date.UTC(2026, 10, 16, hh - 1, mm);

const PLAN = `<?xml version='1.0' encoding='UTF-8'?>
<timetable station="Hannover Hbf">
  <s id="-111-2611161037-3">
    <tl f="F" t="p" o="80" c="ICE" n="587"/>
    <ar pt="2611161037" pp="4" l="22"/>
    <dp pt="2611161040" pp="4" l="22"/>
  </s>
  <s id="-222-2611161105-1">
    <tl f="F" t="p" o="80" c="IC" n="2035"/>
    <dp pt="2611161105" pp="9"/>
  </s>
  <s id="-333-2611161050-5">
    <tl f="N" t="p" o="800" c="RE" n="4410"/>
    <dp pt="2611161050" pp="1"/>
  </s>
</timetable>`;

const CHANGES = `<timetable station="Hannover Hbf" eva="8000152">
  <s id="-111-2611161037-3" eva="8000152">
    <ar ct="2611161049"><m id="r1" t="d" c="34" ts="2611161020"/></ar>
    <dp ct="2611161052"/>
  </s>
  <s id="-222-2611161105-1" eva="8000152">
    <dp cs="c" clt="2611160930"/>
  </s>
</timetable>`;

test('reads Berlin timestamps and the stops of plan and change answers', () => {
  assert.equal(timetableTime('2611161037'), at(10, 37));
  assert.equal(timetableTime('nope'), null);
  const plan = parseTimetableXml(PLAN);
  assert.equal(plan.size, 3);
  assert.deepEqual(plan.get('-111-2611161037-3'), {
    category: 'ICE',
    number: '587',
    ar: { pt: at(10, 37), ct: null, cs: null },
    dp: { pt: at(10, 40), ct: null, cs: null },
  });
  const changes = parseTimetableXml(CHANGES);
  assert.equal(changes.get('-111-2611161037-3').dp.ct, at(10, 52));
  assert.equal(changes.get('-222-2611161105-1').dp.cs, 'c');
  assert.equal(parseTimetableXml('').size, 0);
});

test('finds the station number of a hub in a station search', () => {
  const xml = `<stations>
    <station name="Hannover Hbf (tief)" eva="8099999" ds100="FH"/>
    <station name="Hannover Hbf" eva="8000152" ds100="HH"/>
  </stations>`;
  assert.equal(parseStationEva(xml, 'Hannover Hbf'), '8000152');
  assert.equal(parseStationEva(xml, 'Elsewhere'), '8099999');
  assert.equal(parseStationEva('<stations/>', 'Hannover Hbf'), null);
});

test('matches DB stops to our trains by station time and category', () => {
  const calls = [
    {
      id: 'ice@1',
      category: 'ICE',
      arrival: at(10, 37),
      departure: at(10, 40),
    },
    { id: 'ic@1', category: 'IC', arrival: at(11, 5), departure: at(11, 5) },
    {
      id: 'other@1',
      category: 'ICE',
      arrival: at(12, 0),
      departure: at(12, 0),
    },
  ];
  const rows = matchStation(
    calls,
    parseTimetableXml(PLAN),
    parseTimetableXml(CHANGES),
  );
  assert.deepEqual(
    rows.map(({ id, number, delay, cancelled }) => [
      id,
      number,
      delay,
      cancelled,
    ]),
    [
      ['ice@1', 'ICE 587', 12 * 60, false],
      ['ic@1', 'IC 2035', 0, true],
    ],
  );
});

test('keeps per train the report closest to now', () => {
  const delays = pickDelays(
    [
      { id: 'a', number: 'ICE 1', delay: 60, cancelled: false, at: at(9, 0) },
      {
        id: 'a',
        number: 'ICE 1',
        delay: 600,
        cancelled: false,
        at: at(10, 20),
      },
      { id: 'b', number: 'IC 2', delay: 0, cancelled: true, at: at(10, 0) },
    ],
    at(10, 30),
  );
  assert.deepEqual(delays, {
    a: { number: 'ICE 1', delay: 600, cancelled: false },
    b: { number: 'IC 2', delay: 0, cancelled: true },
  });
});

test('hub names and their timetable aliases compare loosely', () => {
  assert.equal(
    stationKey('Frankfurt (Main) Hbf'),
    stationKey('Frankfurt(Main)Hbf'),
  );
  assert.ok(hubKeys('Erfurt Hbf').includes(stationKey('Erfurt, Hauptbahnhof')));
  assert.equal(new Set(DELAY_HUBS).size, DELAY_HUBS.length);
});
