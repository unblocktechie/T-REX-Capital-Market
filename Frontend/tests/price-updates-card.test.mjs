import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const pageSource = await readFile(
  new URL('../src/pages/tokens/TokenInformationPage.jsx', import.meta.url),
  'utf8',
);
const cardSource = await readFile(
  new URL('../src/components/token-issuance/PriceUpdatesCard.jsx', import.meta.url),
  'utf8',
);
const styles = await readFile(
  new URL('../src/assets/styles/token-issuance.css', import.meta.url),
  'utf8',
);

test('price updates UI is placed between starting price and approved organization account', () => {
  const priceIndex = pageSource.indexOf('id="initial-token-price"');
  const cardIndex = pageSource.indexOf('A Service Wallet is registered separately');
  const accountIndex = pageSource.indexOf('label="Approved organization account"');

  assert.ok(priceIndex >= 0);
  assert.ok(cardIndex > priceIndex);
  assert.ok(accountIndex > cardIndex);
});

test('price updates card is interactive but isolated from the token submission payload', () => {
  assert.match(cardSource, /Enable Service Wallet/);
  assert.match(cardSource, /serviceWalletEnabled/);
  assert.match(cardSource, /service-wallet-address/);
  assert.match(cardSource, /EVM_ADDRESS_PATTERN/);
  assert.doesNotMatch(pageSource, /formData\.append\(['"]serviceWallet/);
});

test('price updates card includes responsive and reduced-motion handling', () => {
  assert.match(styles, /\.price-updates-card/);
  assert.match(styles, /@media \(max-width: 900px\)/);
  assert.match(styles, /@media \(max-width: 560px\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
});

test('service wallet details are removed from layout while the option is off', () => {
  assert.match(cardSource, /\{serviceWalletEnabled \? \(/);
  assert.match(cardSource, /price-updates-service-wallet is-enabled/);
  assert.doesNotMatch(cardSource, /aria-hidden=\{!serviceWalletEnabled\}/);
});

test('price updates supporting copy matches the surrounding form readability', () => {
  assert.match(
    styles,
    /\.price-updates-card__header p,[\s\S]*?\.price-update-option__summary p \{[\s\S]*?font-size: 12px;/,
  );
  assert.match(
    styles,
    /\.price-update-option__features li,[\s\S]*?\.price-updates-security-note \{[\s\S]*?font-size: 11\.5px;/,
  );
  assert.match(
    styles,
    /\.price-update-option__controls \.issuance-toggle-row small \{[\s\S]*?font-size: 11px;/,
  );
});

test('off state explains that Service Wallet can be enabled later without changing form data', () => {
  assert.match(cardSource, /Not ready to automate yet\?/);
  assert.match(cardSource, /You can enable Service Wallet at any time after token creation\./);
  assert.match(cardSource, /!serviceWalletEnabled \? \(/);
  assert.match(styles, /\.price-updates-deferred-note \{/);
  assert.doesNotMatch(pageSource, /formData\.append\(['"]serviceWallet/);
});
