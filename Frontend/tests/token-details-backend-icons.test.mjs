import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const page = await readFile(new URL('../src/pages/tokens/TokenDetailsPage.jsx', import.meta.url), 'utf8');
const css = await readFile(new URL('../src/assets/styles/token-issuance.css', import.meta.url), 'utf8');

test('issuer asset details resolve the saved payment token from the chain catalogue', () => {
  assert.match(page, /usePaymentTokenMetadata\s*\(\s*\{/);
  assert.match(page, /paymentTokenAddress,/);
  assert.match(page, /chainUid:\s*tokenChainUid/);
  assert.match(page, /paymentTokenMetadata\.symbol\s*\|\|\s*paymentTokenSymbol/);
  assert.match(page, /imageUrl=\{paymentTokenMetadata\.imageUrl\}/);
});

test('issuer asset details render backend network artwork instead of a generic network glyph', () => {
  assert.match(page, /useChainConfig\s*\(\s*tokenChainUid/);
  assert.match(page, /const tokenChainPresentation = tokenChainConfig\.data \|\| tokenChainRecord/);
  assert.match(page, /<NetworkIcon[\s\S]*?chain=\{tokenChainPresentation \|\| undefined\}[\s\S]*?size="xs"/);
  assert.doesNotMatch(page, /<Network\s+size=\{16\}\s*\/>\s*Network:/);
});

test('issuer asset artwork remains readable and responsive', () => {
  assert.match(css, /\.token-dashboard-header__network\s*>\s*\.network-icon\s*\{[\s\S]*?width:\s*18px;[\s\S]*?height:\s*18px;/);
  assert.match(css, /\.token-dashboard-header__price-value\s*>\s*\.token-icon\s*\{[\s\S]*?width:\s*16px;[\s\S]*?height:\s*16px;/);
  assert.match(css, /@media\s*\(max-width:\s*480px\)[\s\S]*?\.token-dashboard-header__network\s*\{[\s\S]*?flex-basis:\s*100%;/);
});
