import assert from 'node:assert/strict';
import test from 'node:test';
import {
  detourAround,
  detourVias,
  durationText,
  routeVerdict,
} from './routeVerdict.js';

const MAIN = [
  [9.5, 51.0],
  [9.5, 51.5],
];
const closure = {
  stableId: 'c1',
  kind: 'closure',
  road: 'A7',
  section: 'Kassel-Nord – Lutterberg',
  direction: 'Hamburg',
  lat: 51.3,
  lon: 9.5,
  details: ['18.11.26 von 22:00 bis 05:00 Uhr'],
};
const route = {
  durationS: 3600,
  path: MAIN,
  alternatives: [
    // Passes the closure: no use.
    { durationS: 3700, summary: 'A 7', geometry: MAIN },
    // Keeps 20 km west of it.
    {
      durationS: 5700,
      summary: 'A 44, A 49',
      geometry: [
        [9.2, 51.0],
        [9.2, 51.5],
      ],
    },
  ],
};

test('a detour is the quickest alternative that keeps clear of every closure', () => {
  const detour = detourAround(route, [closure]);
  assert.equal(detour.summary, 'A 44, A 49');
  assert.equal(detour.extraS, 2100);
  assert.equal(detourAround(route, []), null);
  assert.equal(
    detourAround({ ...route, alternatives: [route.alternatives[0]] }, [
      closure,
    ]),
    null,
  );
});

test('durations read as hours and minutes', () => {
  assert.equal(durationText(35 * 60), '35 min');
  assert.equal(durationText(65 * 60), '1 h 5 min');
});

test('a closure and a ban make a blocked verdict with the way round', () => {
  const verdict = routeVerdict({
    route,
    scored: { events: [closure], warnings: [] },
    bans: {
      active: [{ label: 'Sunday', body: 'No lorries over 7.5 t…' }],
      next: null,
    },
    horizon: 'tonight',
    now: Date.UTC(2026, 10, 18, 12),
  });
  assert.equal(verdict.tone, 'blocked');
  assert.equal(verdict.problems, 2);
  assert.equal(verdict.headline, 'Tonight: 2 problems on the way');
  assert.deepEqual(
    verdict.lines.map((line) => line.kind),
    ['closure', 'detour', 'ban'],
  );
  assert.equal(verdict.lines[0].title, 'A7 closed');
  assert.match(verdict.lines[0].detail, /Kassel-Nord/);
  // The window starts another day, so it names the day.
  assert.match(verdict.lines[0].detail, /Wed 10:00 PM–05:00 AM$/);
  assert.equal(verdict.lines[1].title, 'Way round via A 44, A 49: +35 min');
});

test('a clear run still names the next ban; weather below strong is no problem', () => {
  const verdict = routeVerdict({
    route: { durationS: 3600 },
    scored: {
      events: [{ kind: 'roadworks', road: 'A3', lat: 50, lon: 9 }],
      warnings: [{ level: 'minor', group: 'FROST' }],
    },
    bans: { active: [], next: { when: 'Sun 22 Nov, 00:00–22:00', body: 'x' } },
  });
  assert.equal(verdict.tone, 'clear');
  assert.equal(verdict.headline, 'Right now: clear run');
  assert.deepEqual(
    verdict.lines.map((line) => line.kind),
    ['next-ban'],
  );
});

test('strong weather and traffic warnings now are problems, not a block', () => {
  const verdict = routeVerdict({
    route: { durationS: 3600 },
    scored: {
      events: [
        { kind: 'warning', road: 'A1', section: 'Bremen', lat: 53, lon: 9 },
      ],
      warnings: [
        { level: 'moderate', group: 'WIND', headline: 'Sturmböen' },
        { level: 'moderate', group: 'WIND', headline: 'Sturmböen' },
      ],
    },
  });
  assert.equal(verdict.tone, 'caution');
  assert.equal(verdict.problems, 2);
  assert.equal(verdict.headline, 'Right now: 2 problems on the way');
});

test('a forced way round passes 20 km either side of the closure', () => {
  // A route heading north; the closure sits on it.
  const vias = detourVias(MAIN, closure);
  assert.equal(vias.length, 2);
  const kx = 111 * Math.cos((51.3 * Math.PI) / 180);
  for (const [lon, lat] of vias) {
    assert.ok(Math.abs(lat - 51.3) < 0.01, 'level with the closure');
    assert.ok(
      Math.abs(Math.abs(lon - 9.5) * kx - 20) < 0.5,
      `20 km off: ${lon}`,
    );
  }
  assert.ok(vias[0][0] < 9.5 !== vias[1][0] < 9.5, 'one each side');
  assert.equal(detourVias(MAIN, { lon: 12, lat: 51.3 }), null, 'off the route');
  assert.equal(detourVias([], closure), null);
});

test('while a way round is routed, the verdict says so', () => {
  const verdict = routeVerdict({
    route: { durationS: 3600, alternatives: [] },
    scored: { events: [closure], warnings: [] },
    detourPending: true,
  });
  assert.equal(verdict.lines[1].title, 'Looking for a way round…');
});

test('a closure you pass before it starts is no problem, and needs no way round', () => {
  const at = Date.UTC(2026, 10, 18, 20, 40); // 21:40 in Berlin
  const verdict = routeVerdict({
    route,
    scored: { events: [closure], warnings: [] },
    timing: new Map([
      [
        'c1',
        {
          state: 'before',
          at,
          from: Date.UTC(2026, 10, 18, 21),
          to: Date.UTC(2026, 10, 19, 4),
        },
      ],
    ]),
    horizon: 'tonight',
  });
  assert.equal(verdict.tone, 'clear');
  assert.equal(verdict.headline, 'Tonight: clear run');
  assert.deepEqual(
    verdict.lines.map((line) => line.kind),
    ['closure-open'],
  );
  assert.equal(verdict.lines[0].title, 'A7: open when you pass');
  assert.match(
    verdict.lines[0].detail,
    /You reach it about 09:40 PM, before it closes at 10:00 PM$/,
  );
});
