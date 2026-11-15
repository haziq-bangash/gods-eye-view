import test from 'node:test';
import assert from 'node:assert/strict';
import { renderAllowedHosts } from '../../scripts/render-start.mjs';

test('Render’s public name joins the operator’s Host allowlist once', () => {
  assert.equal(
    renderAllowedHosts({ RENDER_EXTERNAL_HOSTNAME: 'nadeloehr.onrender.com' }),
    'nadeloehr.onrender.com',
  );
  assert.equal(
    renderAllowedHosts({
      GEV_ALLOWED_HOSTS: 'nadeloehr.de, nadeloehr.onrender.com',
      RENDER_EXTERNAL_HOSTNAME: 'nadeloehr.onrender.com',
    }),
    'nadeloehr.de,nadeloehr.onrender.com',
  );
  assert.equal(renderAllowedHosts({}), '');
});
