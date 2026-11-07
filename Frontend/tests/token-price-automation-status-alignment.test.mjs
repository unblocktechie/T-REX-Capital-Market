import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const page = await readFile(new URL('../src/pages/tokens/TokenDetailsPage.jsx', import.meta.url), 'utf8');
const card = await readFile(new URL('../src/components/token-issuance/PriceUpdatesCard.jsx', import.meta.url), 'utf8');
const styles = await readFile(new URL('../src/assets/styles/token-issuance.css', import.meta.url), 'utf8');

test('opening the price update settings popup does not insert a temporary wallet-check message above Manual Updates', () => {
  assert.doesNotMatch(page, /Checking this token’s on-chain Service Wallet…/);
  assert.doesNotMatch(page, /token-price-automation-modal__network-status/);
  assert.doesNotMatch(styles, /\.token-price-automation-modal__network-status/);
  assert.match(page, /readTokenServiceWallet\(/); // Keep the actual read-only verification.
});

test('real wallet registration mismatches remain actionable within the Service Wallet section', () => {
  assert.match(page, /serviceWalletNetworkMismatch=\{Boolean\(/);
  assert.match(page, /onchainServiceWallet\.toLowerCase\(\) !== registeredServiceWallet\.toLowerCase\(\)/);
  assert.match(card, /serviceWalletNetworkMismatch = false/);
  assert.match(card, /className="price-updates-service-wallet__mismatch" role="alert"/);
  const walletHeading = card.indexOf('price-updates-service-wallet__setup-heading--simple');
  const mismatch = card.indexOf('price-updates-service-wallet__mismatch');
  assert.ok(walletHeading >= 0 && mismatch > walletHeading);
});

test('Service Wallet setup-needed chip aligns to the far-right without depending on screen size', () => {
  assert.match(card, /price-updates-service-wallet__step-label/);
  assert.match(card, /'Setup needed'/);
  assert.match(styles, /\.price-updates-card--asset-settings \.price-updates-service-wallet__step-label \{[^}]*grid-template-columns: minmax\(0, 1fr\) max-content;/s);
  assert.match(styles, /\.price-updates-card--asset-settings \.price-updates-service-wallet__setup-heading--simple \.price-updates-service-wallet__status \{[^}]*justify-self: end;/s);
  assert.match(styles, /\.price-updates-service-wallet__mismatch \{/);
  assert.match(styles, /\.price-updates-card--asset-settings \.price-updates-service-wallet__setup-heading--simple \{[^}]*grid-template-columns: minmax\(0, 1fr\);[^}]*justify-content: stretch;/s);
});
