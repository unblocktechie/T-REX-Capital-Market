import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const css = await readFile(new URL('../src/assets/styles/organization.css', import.meta.url), 'utf8');
const component = await readFile(new URL('../src/components/issuer/IssuerApiKeysCard.jsx', import.meta.url), 'utf8');

test('API key list reserves a stable third column when a row has no actions', () => {
  assert.match(css, /\.issuer-api-key-row\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) minmax\(215px, 290px\) 244px/);
  assert.match(css, /Reserve the action column even for disabled keys/);
  assert.match(component, /issuer-api-key-row__meta/);
  assert.match(component, /issuer-api-key-row__actions/);
  assert.match(component, /!item\.revoked \? \(/);
});

test('API key row layout responds to available panel width and keeps metadata readable', () => {
  assert.match(css, /container: issuer-api-key-list \/ inline-size/);
  assert.match(css, /@container issuer-api-key-list \(max-width: 850px\)/);
  assert.match(css, /grid-column: 1 \/ -1;/);
  assert.match(css, /@container issuer-api-key-list \(max-width: 590px\)/);
  assert.match(css, /\.issuer-api-key-row__meta\s*\{\s*grid-template-columns: minmax\(0, 1fr\)/);
});

test('key creation, rotation and revocation actions remain available', () => {
  assert.match(component, /Create API key/);
  assert.match(component, /Replace key/);
  assert.match(component, /Disable key/);
  assert.match(component, /formatDateTime\(item\.expiresAt, 'No expiry'\)/);
  assert.match(component, /formatDateTime\(item\.lastUsedAt\)/);
});
