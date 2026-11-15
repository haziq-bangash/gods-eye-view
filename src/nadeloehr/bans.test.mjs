import test from 'node:test';
import assert from 'node:assert/strict';
import { banNotice } from './bans.js';
import { berlinTime } from '../freight/drivingBans.js';
import { horizonRange } from '../freight/horizon.js';

test('a Sunday ban is in force now, across Germany', () => {
  const now = berlinTime('2026-11-15', 17);
  const notice = banNotice({ horizon: 'now', range: [now, now], now });
  assert.equal(notice.active.length, 1);
  assert.equal(notice.active[0].name, 'Sunday');
  assert.match(notice.active[0].body, /across Germany/);
  assert.ok(notice.active[0].until);
  assert.equal(notice.next, null);
});

test('after the ban, the next one is shown with its states when regional', () => {
  const now = berlinTime('2026-11-16', 9);
  const notice = banNotice({ horizon: 'now', range: [now, now], now });
  assert.equal(notice.active.length, 0);
  assert.equal(notice.next.date, '2026-11-18');
  assert.equal(notice.next.label, 'Day of Repentance, SN');
});

test("a corridor's states filter out other states' holidays", () => {
  const now = berlinTime('2026-11-16', 9);
  const notice = banNotice({
    horizon: 'now',
    range: [now, now],
    now,
    states: ['HH', 'NI', 'NW'],
  });
  assert.equal(notice.next.date, '2026-11-22', 'the Sunday, not Saxony');
  assert.equal(notice.next.label, 'Sunday');
});

test('tomorrow looks at the 06–22 h window of the next day', () => {
  const now = berlinTime('2026-06-03', 12);
  const range = horizonRange('tomorrow', now);
  const hit = banNotice({
    horizon: 'tomorrow',
    range,
    now,
    states: ['HE', 'BY'],
  });
  assert.equal(hit.active[0].name, 'Corpus Christi');
  assert.match(hit.active[0].body, /in HE, BY|in BY, HE/);
  const miss = banNotice({
    horizon: 'tomorrow',
    range,
    now,
    states: ['HH', 'NI'],
  });
  assert.equal(miss.active.length, 0);
});
