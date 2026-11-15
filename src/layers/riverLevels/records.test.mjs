import test from 'node:test';
import assert from 'node:assert/strict';
import {
  KAUB_LEVELS,
  PEGELONLINE_STATIONS_URL,
  gaugeColor,
  gaugeDisplayName,
  kaubBand,
  kaubHydrologyScore,
  kaubRow,
  levelTrend,
  normalizePegelStations,
  pegelMeasurementsUrl,
  trendDirection,
  forecastSeries,
  levelDuring,
} from './records.js';

const station = (shortname, water, extra = {}) => ({
  uuid: `id-${shortname}`,
  shortname,
  longname: shortname,
  km: 100,
  latitude: 50,
  longitude: 8,
  water: { shortname: water },
  timeseries: [
    {
      shortname: 'W',
      currentMeasurement: {
        timestamp: '2026-11-15T10:30:00+01:00',
        value: 59,
        stateMnwMhw: 'low',
      },
    },
  ],
  ...extra,
});

test('URLs are fixed to PEGELONLINE and ask only for Rhine and Elbe W levels', () => {
  const url = new URL(PEGELONLINE_STATIONS_URL);
  assert.equal(url.hostname, 'www.pegelonline.wsv.de');
  assert.equal(url.searchParams.get('waters'), 'RHEIN,ELBE');
  assert.equal(url.searchParams.get('timeseries'), 'W');
  assert.match(
    pegelMeasurementsUrl('a/b'),
    /stations\/a%2Fb\/W\/measurements\.json\?start=P1D$/,
  );
});

test('stations become rows, Rhine first and downstream, unusable ones skipped', () => {
  const rows = normalizePegelStations([
    station('DRESDEN', 'ELBE', { km: 55.6 }),
    station('KAUB', 'RHEIN', { km: 546.2 }),
    station('MAXAU', 'RHEIN', { km: 362.3 }),
    station('NOWHERE', 'RHEIN', { latitude: null }),
    station('MOSEL', 'MOSEL'),
    station('EMPTY', 'RHEIN', { timeseries: [] }),
    station('KAUB', 'RHEIN'),
  ]);
  assert.deepEqual(
    rows.map((row) => row.shortname),
    ['MAXAU', 'KAUB', 'DRESDEN'],
  );
  const kaub = kaubRow(rows);
  assert.equal(kaub.name, 'Kaub');
  assert.equal(kaub.levelCm, 59);
  assert.equal(kaub.state, 'low');
  assert.equal(kaub.key, true);
  assert.equal(kaub.measuredAt, Date.parse('2026-11-15T09:30:00Z'));
  assert.throws(() => normalizePegelStations({}), /Malformed/);
});

test('out-dated and tidal states read as unknown', () => {
  const [row] = normalizePegelStations([
    station('X', 'ELBE', {
      timeseries: [
        {
          shortname: 'W',
          currentMeasurement: {
            timestamp: '2026-11-15T10:30:00+01:00',
            value: 300,
            stateMnwMhw: 'out-dated',
          },
        },
      ],
    }),
  ]);
  assert.equal(row.state, 'unknown');
  assert.equal(row.outdated, true);
});

test('names are title-cased only when shouted', () => {
  assert.equal(gaugeDisplayName('DUISBURG-RUHRORT'), 'Duisburg-Ruhrort');
  assert.equal(gaugeDisplayName('HAMBURG ST. PAULI'), 'Hamburg St. Pauli');
  assert.equal(gaugeDisplayName('KÖLN'), 'Köln');
  assert.equal(gaugeDisplayName('Basel-Rheinhalle'), 'Basel-Rheinhalle');
});

test('Kaub bands follow the reference levels', () => {
  assert.equal(kaubBand(null), null);
  assert.equal(kaubBand(30), 'very-low');
  assert.equal(kaubBand(KAUB_LEVELS.veryLowWater), 'low');
  assert.equal(kaubBand(99), 'low');
  assert.equal(kaubBand(100), 'reduced');
  assert.equal(kaubBand(150), 'normal');
  assert.equal(kaubBand(459), 'normal');
  assert.equal(kaubBand(460), 'high-water');
  assert.equal(kaubBand(640), 'shipping-stopped');
});

test('the hydrology score is 0 in the normal band and 100 at the extremes', () => {
  assert.equal(kaubHydrologyScore(undefined), null);
  assert.equal(kaubHydrologyScore(300), 0);
  assert.equal(kaubHydrologyScore(150), 0);
  assert.equal(kaubHydrologyScore(95), 50);
  assert.equal(kaubHydrologyScore(40), 100);
  assert.equal(kaubHydrologyScore(10), 100);
  assert.equal(kaubHydrologyScore(460), 60);
  assert.equal(kaubHydrologyScore(700), 100);
});

test('the trend is the change over at least 18 hours', () => {
  const at = (hours, value) => ({
    timestamp: new Date(Date.UTC(2026, 10, 15) + hours * 3600e3).toISOString(),
    value,
  });
  assert.equal(levelTrend([at(0, 71), at(12, 65), at(24, 59)]), -12);
  assert.equal(levelTrend([at(24, 59), at(0, 50)]), 9);
  assert.equal(levelTrend([at(0, 71), at(6, 65)]), null);
  assert.equal(levelTrend([at(0, 71)]), null);
  assert.equal(levelTrend('nope'), null);
  assert.equal(trendDirection(-12), 'falling');
  assert.equal(trendDirection(2), 'steady');
  assert.equal(trendDirection(5), 'rising');
  assert.equal(trendDirection(null), null);
});

test('Kaub is coloured by its band, other gauges by their state', () => {
  assert.equal(gaugeColor({ shortname: 'KAUB', levelCm: 59 }), '#ff3b30');
  assert.equal(gaugeColor({ shortname: 'KAUB', levelCm: 200 }), '#007aff');
  assert.equal(gaugeColor({ shortname: 'MAXAU', state: 'low' }), '#ff9500');
  assert.equal(gaugeColor({ shortname: 'X', state: 'weird' }), '#8e8e93');
});

test('the forecast gives the lowest level in a range; now reads the gauge', () => {
  const at = (h) => Date.UTC(2026, 10, 15, h);
  const row = {
    levelCm: 59,
    forecast: forecastSeries([
      {
        timestamp: new Date(at(18)).toISOString(),
        value: 57,
        type: 'forecast',
      },
      {
        timestamp: new Date(at(22)).toISOString(),
        value: 55,
        type: 'forecast',
      },
      {
        timestamp: new Date(at(30)).toISOString(),
        value: 60,
        type: 'estimate',
      },
    ]),
  };
  assert.equal(row.forecast[2][2], true);
  assert.equal(levelDuring(row, [at(12), at(12)]), 59);
  assert.equal(levelDuring(row, [at(17), at(30)]), 55);
  assert.equal(levelDuring(row, [at(40), at(50)]), null);
});
