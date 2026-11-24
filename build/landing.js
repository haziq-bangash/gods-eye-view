/**
 * The landing page lives at "/"; the app lives at "/map".
 *
 * The page itself is a static document, "public/landing/index.html", which Vite
 * copies into the build as "landing/index.html". This plugin answers a request
 * for the site root with that document on the dev and preview servers.
 *
 * Only the bare root is routed. A root request that carries a query string,
 * such as "/?embed=1", "/?lang=de" or "/?welcome=0", still opens the app, so
 * every existing link and tool keeps working. A hash ("/#v=2&lat=...") is not
 * sent to the server, so the landing page's own script forwards it to "/map".
 * "/landing/" is an alias of the root page. "/share/<code>" and "/map" fall
 * through to the app's usual single-page fallback.
 */

/** The document a bare "/" request is answered with. */
export const LANDING_DOCUMENT = '/landing/index.html';

/** The path the app is served at. */
export const APP_PATH = '/map';

/**
 * Whether a request is for the site root with nothing after it, so that it
 * should be answered with the landing page. "method" is the HTTP method.
 */
export function isLandingRequest(url, method = 'GET') {
  if (method !== 'GET' && method !== 'HEAD') return false;
  let parsed;
  try {
    parsed = new URL(url || '/', 'http://localhost');
  } catch {
    return false;
  }
  if (parsed.pathname === '/') return parsed.search === '';
  // The page's own folder, which the first release linked to.
  return parsed.pathname === '/landing' || parsed.pathname === '/landing/';
}

/** Vite plugin routing the bare site root to the landing page. */
export function landingRoutePlugin() {
  const install = (server) => {
    server.middlewares.use((req, _res, next) => {
      if (isLandingRequest(req.url, req.method)) req.url = LANDING_DOCUMENT;
      next();
    });
  };
  return {
    name: 'landing-route',
    configureServer: install,
    configurePreviewServer: install,
  };
}
