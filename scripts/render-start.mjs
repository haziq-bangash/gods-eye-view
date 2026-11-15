#!/usr/bin/env node
/**
 * Render launcher (see render.yaml): serve the built app with Vite's preview
 * server, which also runs every provider route (/api/...) the dev server
 * does, on Render's port and public hostname.
 *
 * Render sets PORT and RENDER_EXTERNAL_HOSTNAME (the *.onrender.com name).
 * That name, plus any custom domain listed in GEV_ALLOWED_HOSTS, is added to
 * the Host allowlist, so the server answers on its own public address and
 * still refuses others (build/allowedHosts.js).
 */
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';

/** The Host allowlist for this launch: the operator's list plus Render's name. */
export function renderAllowedHosts(env = process.env) {
  const names = String(env.GEV_ALLOWED_HOSTS || '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
  const external = String(env.RENDER_EXTERNAL_HOSTNAME || '').trim();
  if (external && !names.includes(external)) names.push(external);
  return names.join(',');
}

async function main() {
  process.env.GEV_ALLOWED_HOSTS = renderAllowedHosts();
  const port = Number.parseInt(process.env.PORT, 10) || 10000;
  const server = await preview({
    preview: { host: '0.0.0.0', port, strictPort: true },
  });
  server.printUrls();
  const stop = () => server.httpServer.close(() => process.exit(0));
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

// Run only when started directly, not when a test imports the helper.
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await main();
