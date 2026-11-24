import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  APP_PATH,
  LANDING_DOCUMENT,
  isLandingRequest,
  landingRoutePlugin,
} from '../../build/landing.js';

test('the bare site root is the landing page', () => {
  assert.equal(isLandingRequest('/'), true);
  assert.equal(isLandingRequest('/', 'HEAD'), true);
  // The folder URL the first release linked to still shows the page.
  assert.equal(isLandingRequest('/landing/'), true);
  assert.equal(isLandingRequest('/landing'), true);
});

test('the app, its links and every other path are left alone', () => {
  // A query keeps every existing app link working.
  assert.equal(isLandingRequest('/?embed=1'), false);
  assert.equal(isLandingRequest('/?lang=de'), false);
  assert.equal(isLandingRequest('/?welcome=0'), false);
  assert.equal(isLandingRequest('/map'), false);
  assert.equal(isLandingRequest('/map/'), false);
  assert.equal(isLandingRequest('/share/AQc'), false);
  assert.equal(isLandingRequest('/api/health'), false);
  assert.equal(isLandingRequest('/index.html'), false);
  assert.equal(isLandingRequest('/', 'POST'), false);
});

test('the plugin rewrites only the bare root, on dev and preview servers', () => {
  const plugin = landingRoutePlugin();
  assert.equal(typeof plugin.configureServer, 'function');
  assert.equal(typeof plugin.configurePreviewServer, 'function');
  let middleware;
  plugin.configureServer({
    middlewares: { use: (handler) => (middleware = handler) },
  });
  const run = (url, method = 'GET') => {
    const req = { url, method };
    let called = 0;
    middleware(req, {}, () => (called += 1));
    assert.equal(called, 1, 'always passes the request on');
    return req.url;
  };
  assert.equal(run('/'), LANDING_DOCUMENT);
  assert.equal(run('/?embed=1'), '/?embed=1');
  assert.equal(run('/map'), '/map');
});

test('the landing page ships and sends visitors to the app at /map', () => {
  assert.equal(APP_PATH, '/map');
  const html = readFileSync(
    new URL('../../public/landing/index.html', import.meta.url),
    'utf8',
  );
  assert.match(html, /href="\/map"/, 'a call to action opens the app');
  assert.doesNotMatch(
    html,
    /class="btn[^"]*"[^>]*href="\/"/,
    'no button sends visitors back to the landing page',
  );
  const script = readFileSync(
    new URL('../../public/landing/landing.js', import.meta.url),
    'utf8',
  );
  assert.match(script, /location\.replace\('\/map'/, 'old hash links forward');
});
