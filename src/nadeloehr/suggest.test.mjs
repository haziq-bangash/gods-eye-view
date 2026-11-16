import assert from 'node:assert/strict';
import test from 'node:test';
import { cityMatches, mergeSuggestions, moveActive } from './suggest.js';

const names = (results) => results.map((result) => result.place.name);

test('German cities show from the first letters, biggest first', () => {
  const ham = names(cityMatches('ham'));
  assert.equal(ham[0], 'Hamburg');
  assert.deepEqual(names(cityMatches('mün')), ['München', 'Münster']);
  assert.deepEqual(names(cityMatches('munich')), ['München'], 'English name');
  assert.deepEqual(names(cityMatches('koln')), ['Köln'], 'without the umlaut');
  assert.ok(names(cityMatches('main')).includes('Frankfurt am Main'));
  assert.deepEqual(cityMatches(''), []);
  assert.ok(cityMatches('b').length <= 6);
});

test('a city appears once, whichever list found it', () => {
  const instant = cityMatches('Kassel');
  const found = [
    { type: 'place', place: { name: 'Kassel', lat: 51.3155, lng: 9.498 } },
    {
      type: 'place',
      place: {
        name: 'Kassel',
        lat: 50.2,
        lng: 9.3,
        label: 'Kassel, Biebergemünd',
      },
    },
  ];
  const merged = mergeSuggestions(instant, found);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].instant, true);
  assert.equal(merged[1].place.label, 'Kassel, Biebergemünd');
});

test('arrow keys move through the list and wrap', () => {
  assert.equal(moveActive(-1, 3, 1), 0);
  assert.equal(moveActive(-1, 3, -1), 2);
  assert.equal(moveActive(2, 3, 1), 0);
  assert.equal(moveActive(0, 3, -1), 2);
  assert.equal(moveActive(0, 0, 1), -1);
});
