import assert from 'node:assert/strict';
import test from 'node:test';
import { readTripQuery, tripQuery, withoutTrip } from './tripLink.js';

test('a trip makes a link and the link reads back the same trip', () => {
  const query = tripQuery({
    from: ' Hamburg ',
    to: 'München',
    leave: '18:00',
    when: 'tonight',
  });
  assert.equal(
    query,
    '?from=Hamburg&to=M%C3%BCnchen&leave=18%3A00&when=tonight',
  );
  assert.deepEqual(readTripQuery(query), {
    from: 'Hamburg',
    to: 'München',
    leave: '18:00',
    when: 'tonight',
  });
});

test('now and no departure time stay out of the link', () => {
  assert.equal(tripQuery({ from: 'A', to: 'B' }), '?from=A&to=B');
  assert.equal(tripQuery({ from: 'A', to: '' }), '');
});

test('a link with bad parts falls back, and one without places is no trip', () => {
  assert.deepEqual(readTripQuery('?from=A&to=B&leave=25:00&when=someday'), {
    from: 'A',
    to: 'B',
    leave: '',
    when: 'now',
  });
  assert.equal(readTripQuery('?from=A'), null);
  assert.equal(readTripQuery(''), null);
});

test('the page URL drops the trip and keeps the rest', () => {
  assert.equal(
    withoutTrip('https://x.de/?from=A&to=B&leave=10%3A00&map=dark#v'),
    'https://x.de/?map=dark#v',
  );
});
