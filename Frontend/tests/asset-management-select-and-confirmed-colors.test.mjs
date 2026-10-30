import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('investment selector gives its dropdown the full flexible second column', async () => {
  const css = await source('../src/assets/styles/investor.css');
  assert.match(css, /\.asset-management-token-selector\s*\{[^}]*grid-template-columns:\s*minmax\(150px, 190px\) minmax\(0, 1fr\)/);
  assert.match(css, /\.asset-management-token-dropdown\s*\{[^}]*width:\s*100%/);
  assert.match(css, /@media \(max-width: 760px\)\s*\{[\s\S]*?\.asset-management-token-selector\s*\{\s*grid-template-columns:\s*1fr;/);
});

test('confirmed investment and transfer history pills use the same green treatment', async () => {
  const css = await source('../src/assets/styles/investor.css');
  assert.match(css, /\.investor-token-purchase-history__badge\.is-confirmed,\s*\.investor-token-purchase-history__badge\.is-success\s*\{[^}]*--success-500[^}]*--success-500[^}]*--success-700/);
  const purchase = await source('../src/pages/investor-portal/PurchaseTokenPage.jsx');
  const send = await source('../src/pages/investor-portal/SendTokenPage.jsx');
  assert.match(purchase, /case 'CONFIRMED':\s*return \{ label: 'Confirmed', tone: 'confirmed'/);
  assert.match(send, /normalizeStatus\(status\) === 'CONFIRMED'\) return \{ label: 'Confirmed', tone: 'success' \}/);
  assert.match(purchase, /className=\{`investor-token-purchase-history__badge is-\$\{rowStatus\.tone\}`\}/);
  assert.match(send, /className=\{`investor-token-purchase-history__badge is-\$\{rowStatus\.tone\}`\}/);
});
