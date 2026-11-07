import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../src/layouts/components/Breadcrumbs.jsx', import.meta.url), 'utf8');

test('breadcrumbs declares pathname parts exactly once while retaining the token return link', () => {
  const declarations = source.match(/\bconst\s+parts\s*=\s*location\.pathname\.split\('\/'\)\.filter\(Boolean\);/g) || [];
  assert.equal(declarations.length, 1, 'Duplicate const parts declaration prevents Vite from compiling Breadcrumbs.jsx');
  assert.match(source, /requestedTokenUid\.toLowerCase\(\) === currentTokenUid\.toLowerCase\(\)/);
  assert.match(source, /<Link to=\{ROUTES\.tokenDetails\(currentTokenUid\)\}>Token Management<\/Link>/);
});
