import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const page = await readFile(new URL('../src/pages/tokens/TokenDetailsPage.jsx', import.meta.url), 'utf8');
const card = await readFile(new URL('../src/components/token-issuance/PriceUpdatesCard.jsx', import.meta.url), 'utf8');
const css = await readFile(new URL('../src/assets/styles/token-issuance.css', import.meta.url), 'utf8');

test('asset summary copy matches optional automatic updates instructions', () => {
  assert.match(page, /<strong>Automatic Price Updates<\/strong>/);
  assert.match(page, /registeredServiceWallet \? 'Configured' : 'Optional'/);
  assert.match(page, /Configure a Service Wallet to automatically update asset prices\. You can also update prices manually at any time\./);
  assert.match(page, /You can still update prices manually\. Add an authorized Service Wallet to enable automatic price updates\./);
});

test('configured wallet modal explains two setup steps and benefits', () => {
  assert.match(card, /Allow your prices to update automatically using an authorized Service Wallet\./);
  assert.match(card, /You can still update prices manually at any time\./);
  assert.match(card, /This wallet is registered to approve automatic price updates for this token\./);
  assert.match(card, /1\. Service Wallet/);
  assert.match(card, /Register a wallet to approve automatic price updates for this token\./);
  assert.match(card, /2\. Bot Configuration/);
  assert.match(card, /Set up API keys and approved IP addresses to run your bots\./);
  assert.match(card, /Check setup/);
  assert.match(card, /Configure Bot/);
  for (const copy of ['Update prices automatically', 'Continue updating prices manually', 'No wallet signature needed for each automatic update']) {
    assert.ok(card.includes(copy));
  }
  assert.match(card, /<strong>Benefits<\/strong>/);
});

test('remove wallet access and change wallet retain existing callbacks', () => {
  assert.match(card, /Remove Wallet Access/);
  assert.match(card, /onClick=\{onServiceWalletRevoke\}/);
  assert.match(card, /Change Service Wallet/);
  assert.match(card, /onClick=\{beginServiceWalletChange\}/);
  assert.match(card, /onClick=\{handleServiceWalletSubmit\}/);
});

test('existing responsive CSS and benefits layout remain available', () => {
  assert.match(css, /\.price-updates-benefits \{/);
  assert.match(css, /\.price-updates-benefits > strong \{/);
  assert.match(css, /@media \(max-width: 520px\)/);
  assert.match(css, /\.token-price-automation-modal > footer/);
});
