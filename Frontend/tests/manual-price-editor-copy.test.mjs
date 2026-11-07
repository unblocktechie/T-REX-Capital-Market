import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const details = readFileSync(new URL('../src/pages/tokens/TokenDetailsPage.jsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/assets/styles/token-issuance.css', import.meta.url), 'utf8');

test('price editor explains the next action and confirms that displayed prices do not change early', () => {
  assert.match(details, /title="Update Price"/);
  assert.match(details, /Click <strong>Update Price<\/strong> to open MetaMask/);
  assert.match(details, /choose to confirm or reject it/);
  assert.match(details, /new price will be visible to investors only after you confirm the transaction in MetaMask/);
  assert.match(details, /Your initial price will remain unchanged/);
  assert.match(details, /<span>Initial Price<\/span>/);
});

test('prepared state gives clear and safe wallet instructions', () => {
  assert.match(details, /An earlier price request is still pending/);
  assert.match(details, /No new transaction will be sent automatically/);
  assert.match(details, /Before you continue/);
  assert.match(details, /role="status" aria-live="polite"/);
});

test('guidance is visually contained without changing the wallet transaction lifecycle', () => {
  assert.match(styles, /\.token-price-editor__guidance \{/);
  assert.match(styles, /overflow-wrap: anywhere/);
  assert.match(details, /await tokenApi\.prepareManualPrice\(submittedPrice, tokenChainUid\)/);
  assert.match(details, /await submitPreparedWithWallet\(pending\)/);
  assert.match(details, /runPriceVerification\(broadcast\)/);
});
