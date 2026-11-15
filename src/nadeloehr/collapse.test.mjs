import test from 'node:test';
import assert from 'node:assert/strict';
import { useCollapsed } from './collapse.js';

test('a card is open unless the reader minimised it', () => {
  const card = useCollapsed('test-plain');
  assert.equal(card.isCollapsed(), false);
  card.toggle();
  assert.equal(card.isCollapsed(), true);
  card.toggle();
  assert.equal(card.isCollapsed(), false);
});

test('a card minimised by default stays open once the reader opens it', () => {
  let phone = true;
  const strip = useCollapsed('test-default', { byDefault: () => phone });
  assert.equal(strip.isCollapsed(), true);
  strip.toggle();
  assert.equal(strip.isCollapsed(), false, 'their choice wins');
  strip.toggle();
  assert.equal(strip.isCollapsed(), true);
  phone = false;
  assert.equal(
    strip.isCollapsed(),
    true,
    'an explicit minimise holds anywhere',
  );
});
