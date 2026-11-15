import test from 'node:test';
import assert from 'node:assert/strict';
import { colorRole, themeText } from '../scripts/nadeloehr-theme.mjs';

test('upstream colours map to appearance roles; status colours stay', () => {
  assert.deepEqual(colorRole(0, 212, 255), { variable: '--accent-rgb' });
  assert.deepEqual(colorRole(10, 10, 15), { variable: '--surface-rgb' });
  assert.deepEqual(colorRole(255, 255, 255), { variable: '--ink-rgb' });
  assert.deepEqual(colorRole(105, 203, 209), {
    variable: '--ink-rgb',
    alpha: 0.62,
  });
  // Shadows, errors, warnings, live greens and mid greys keep their values.
  for (const rgb of [
    [0, 0, 0],
    [196, 84, 84],
    [255, 196, 107],
    [0, 255, 80],
    [128, 128, 128],
  ])
    assert.equal(colorRole(...rgb), null, rgb.join());
});

test('rewriting keeps alpha, themes blurs, skips data URIs, and is stable', () => {
  const css = [
    'a { color: rgba(0, 212, 255, 0.4); border-color: #00D4FF; }',
    'b { background: rgb(10 10 15 / 28%); outline: #c45454; }',
    'c { color: rgba(105, 203, 209, 0.5); }',
    'd { backdrop-filter: blur(24px) saturate(1.4); }',
    "e { background: url('data:image/svg+xml,fill=%2300d4ff') #fff; }",
  ].join('\n');
  const once = themeText(css);
  assert.equal(
    once.text,
    [
      'a { color: rgb(var(--accent-rgb) / 0.4); border-color: rgb(var(--accent-rgb)); }',
      'b { background: rgb(var(--surface-rgb) / 28%); outline: #c45454; }',
      'c { color: rgb(var(--ink-rgb) / 0.31); }',
      'd { backdrop-filter: var(--glass-filter); }',
      "e { background: url('data:image/svg+xml,fill=%2300d4ff') #fff; }",
    ].join('\n'),
  );
  assert.equal(once.changes, 5);
  assert.deepEqual(themeText(once.text), { text: once.text, changes: 0 });
});
