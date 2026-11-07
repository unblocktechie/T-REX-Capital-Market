import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const card = await readFile(
  new URL('../src/components/token-issuance/PriceUpdatesCard.jsx', import.meta.url),
  'utf8',
);
const page = await readFile(
  new URL('../src/pages/tokens/TokenDetailsPage.jsx', import.meta.url),
  'utf8',
);

test('empty Service Wallet input stays neutral after a successful revoke', () => {
  assert.match(card, /serviceWalletTouched\s*&&\s*trimmedAddress\s*&&\s*!EVM_ADDRESS_PATTERN\.test\(trimmedAddress\)/);
  assert.doesNotMatch(card, /serviceWalletTouched\s*&&\s*\(!trimmedAddress\s*\|\|/);
  assert.match(page, /setServiceWalletAddress\(''\);\s*setOnchainServiceWallet\(''\)/);
  assert.match(page, /setServiceWalletError\(''\);\s*setServiceWalletSuccess\(''\)/);
});

test('registration changes clear stale touched state while malformed entered addresses still validate', () => {
  assert.match(card, /setEditingServiceWallet\(false\);\s*setServiceWalletTouched\(false\);\s*}, \[currentServiceWalletAddress\]\);/);
  assert.match(card, /if \(!String\(value \|\| ''\)\.trim\(\)\) setServiceWalletTouched\(false\);/);
  assert.match(card, /onBlur=\{\(\) => setServiceWalletTouched\(true\)\}/);
  assert.match(card, /!EVM_ADDRESS_PATTERN\.test\(trimmedAddress\)/);
  assert.match(card, /disabled=\{[\s\S]*?!EVM_ADDRESS_PATTERN\.test\(trimmedAddress\)/);
});
