import test from 'node:test';
import assert from 'node:assert/strict';
import { hostedChatClient } from '../server/providers/gemini/request.js';

const SITE = 'https://nadeloehr.dropboard.de';
const req = (headers) => ({
  headers: {
    host: 'nadeloehr.dropboard.de',
    origin: SITE,
    'sec-fetch-site': 'same-origin',
    'cf-connecting-ip': '203.0.113.7',
    'x-forwarded-for': '203.0.113.7',
    ...headers,
  },
});

test('a hosted chat request from the site itself is keyed by visitor', () => {
  assert.equal(hostedChatClient(req({}), SITE), 'cf:203.0.113.7');
  assert.equal(
    hostedChatClient(req({ 'cf-connecting-ip': '2001:db8::1' }), SITE),
    'cf:2001:db8::1',
  );
  assert.equal(
    hostedChatClient(req({ 'sec-fetch-site': undefined }), SITE),
    'cf:203.0.113.7',
  );
});

test('without a configured public origin nothing is admitted', () => {
  assert.equal(hostedChatClient(req({}), ''), null);
  assert.equal(hostedChatClient(req({}), undefined), null);
});

test('the configured origin must be an exact https origin', () => {
  assert.equal(
    hostedChatClient(req({}), 'http://nadeloehr.dropboard.de'),
    null,
  );
  assert.equal(hostedChatClient(req({}), `${SITE}/`), null);
  assert.equal(hostedChatClient(req({}), 'not a url'), null);
});

test('other origins, hosts and cross-site calls are refused', () => {
  assert.equal(
    hostedChatClient(req({ origin: 'https://evil.example' }), SITE),
    null,
  );
  assert.equal(hostedChatClient(req({ origin: undefined }), SITE), null);
  assert.equal(hostedChatClient(req({ origin: 'null' }), SITE), null);
  assert.equal(
    hostedChatClient(
      req({ origin: 'https://nadeloehr.dropboard.de.evil.example' }),
      SITE,
    ),
    null,
  );
  assert.equal(
    hostedChatClient(req({ host: 'nadeloehr.onrender.com' }), SITE),
    null,
  );
  assert.equal(
    hostedChatClient(req({ 'sec-fetch-site': 'cross-site' }), SITE),
    null,
  );
  assert.equal(
    hostedChatClient(req({ 'sec-fetch-site': 'same-site' }), SITE),
    null,
  );
});

test('a request without a usable visitor address is refused', () => {
  assert.equal(
    hostedChatClient(req({ 'cf-connecting-ip': undefined }), SITE),
    null,
  );
  assert.equal(
    hostedChatClient(req({ 'cf-connecting-ip': 'a b; c' }), SITE),
    null,
  );
});
