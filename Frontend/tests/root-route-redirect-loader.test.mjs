import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const routerSource = await readFile(
  new URL('../src/routes/router.jsx', import.meta.url),
  'utf8',
);

const homeRedirect =
  routerSource.match(/function HomeRedirect\(\) \{([\s\S]*?)\n\}/)?.[1] ?? '';

test('root route keeps the existing role-aware destinations', () => {
  assert.match(homeRedirect, /destination = ROUTES\.login/);
  assert.match(homeRedirect, /ROUTES\.investors/);
  assert.match(homeRedirect, /resolveAuthenticatedLandingRoute\(user\?\.role\)/);
});

test('root route renders the responsive route loader while redirecting', () => {
  assert.match(homeRedirect, /<TrexLoader/);
  assert.match(homeRedirect, /variant="route"/);
  assert.match(homeRedirect, /<Navigate to=\{destination\} replace \/>/);
});
