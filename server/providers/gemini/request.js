import { readRequestBody } from '../common/request.js';
import { admitSameSiteRequest } from '../../../src/localRequestGate.mjs';
import {
  isAllowedHost,
  resolveAllowedHosts,
} from '../../../build/allowedHosts.js';

/** Use the app's Host and request policies, with a required browser Origin. */
export function isGeminiRequestOriginAllowed(
  req,
  configuredHost = '',
  configuredAllowedHosts,
) {
  const host = req.headers?.host;
  const origin = req.headers?.origin;
  if (
    typeof host !== 'string' ||
    typeof origin !== 'string' ||
    !host ||
    !origin ||
    /[\s/?#@\\]/.test(host)
  )
    return false;
  const protocol = req.socket?.encrypted ? 'https:' : 'http:';
  if (
    !admitSameSiteRequest({
      hostHeader: host,
      protocol,
      origin,
      secFetchSite: req.headers?.['sec-fetch-site'],
      proxyHeaders: req.headers || {},
    }).ok
  )
    return false;
  // The shared gate compares a present Origin exactly with this authority;
  // this route also requires the Origin and an allowed Host.
  const boundHost = String(configuredHost || '')
    .trim()
    .toLowerCase();
  return isAllowedHost(host, resolveAllowedHosts(configuredAllowedHosts), [
    boundHost,
  ]);
}

/** Admit only the existing input gesture; callers cannot supply model/setup. */
export async function readGeminiTokenRequest(req, signal, maxBytes = 1024) {
  const declared = Number(req.headers?.['content-length']);
  const fail = (code) =>
    Object.assign(new Error('Invalid token request'), { code });
  const body = await readRequestBody(
    req,
    maxBytes,
    Number.isFinite(declared) && declared > maxBytes
      ? AbortSignal.abort(fail('BODY_TOO_LARGE'))
      : signal,
  );
  if (!body.trim()) return 'open-mic';
  if (
    !/^application\/json(?:\s*;|$)/i.test(req.headers?.['content-type'] || '')
  )
    throw fail('BAD_CONTENT_TYPE');
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw fail('BAD_BODY');
  }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object')
    throw fail('BAD_BODY');
  const keys = Object.keys(parsed);
  if (!keys.length) return 'open-mic';
  if (
    keys.length === 1 &&
    keys[0] === 'inputMode' &&
    parsed.inputMode === 'push-to-talk'
  )
    return 'push-to-talk';
  throw fail('BAD_BODY');
}

const CLIENT_IP = /^[0-9a-f:.]{3,45}$/i;

/**
 * The typed assistant on a public deployment. The local gate above refuses
 * anything that came through a proxy, which on a hosted site (Render behind
 * Cloudflare) is every request. When `publicOrigin` is set (for example
 * `GEV_PUBLIC_ASSISTANT_ORIGIN=https://nadeloehr.dropboard.de`), a proxied
 * chat request is admitted only if its Origin and Host are exactly that
 * site's and the browser does not call it cross-site.
 *
 * Returns the visitor's rate-limit key (Cloudflare's `cf-connecting-ip`,
 * which Cloudflare sets and visitors cannot forge through it), or null when
 * the request is not such a hosted request. Behind the proxy every socket
 * peer is the proxy itself, so the socket address cannot tell visitors apart.
 */
export function hostedChatClient(req, publicOrigin = '') {
  const configured = String(publicOrigin || '').trim();
  if (!configured) return null;
  let site;
  try {
    site = new URL(configured);
  } catch {
    return null;
  }
  if (site.protocol !== 'https:' || site.origin !== configured) return null;
  const headers = req.headers || {};
  if (headers.origin !== site.origin) return null;
  if (String(headers.host || '').toLowerCase() !== site.host) return null;
  const fetchSite = String(headers['sec-fetch-site'] || '')
    .trim()
    .toLowerCase();
  if (fetchSite && fetchSite !== 'same-origin') return null;
  const ip = String(headers['cf-connecting-ip'] || '').trim();
  return CLIENT_IP.test(ip) ? `cf:${ip}` : null;
}
