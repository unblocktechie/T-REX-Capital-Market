import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const details = read('../src/pages/tokens/TokenDetailsPage.jsx');
const confirmation = read('../src/components/token-issuance/CancelUnsignedPriceRequestModal.jsx');
const sharedModal = read('../src/components/ui/Modal.jsx');

test('wallet rejection opens the confirmation dialog without a persistent cancel button', () => {
  assert.doesNotMatch(details, /window\.confirm\(/);
  assert.match(details, /walletRejectedAt: new Date\(\)\.toISOString\(\)/);
  assert.match(details, /setCancelUnsignedPriceOpen\(true\);/);
  assert.doesNotMatch(details, /Cancel price update<\/button>/);
  assert.doesNotMatch(details, /const mayCancel/);
  assert.match(details, /const closePriceEditor = \(\) => \{[\s\S]*?setCancelUnsignedPriceOpen\(true\)/);
  assert.match(details, /<CancelUnsignedPriceRequestModal[\s\S]*?open=\{cancelUnsignedPriceOpen\}[\s\S]*?onConfirm=\{cancelPreparedPriceRequest\}/);
});

test('confirmation requires explicit wallet acknowledgement and resets it for each opening', () => {
  assert.match(confirmation, /setAcknowledged\(false\);[\s\S]*?\}, \[open\]\)/);
  assert.match(confirmation, /type="checkbox"/);
  assert.match(confirmation, /checked=\{acknowledged\}/);
  assert.match(confirmation, /disabled=\{!acknowledged \|\| loading\}/);
  assert.match(confirmation, /onClick=\{onConfirm\}/);
  assert.match(confirmation, /I did not sign or broadcast this transaction\./i);
  assert.match(confirmation, /does not cancel or reverse any transaction on the blockchain/i);
});

test('the dialog matches shared responsive accessible modals and cannot close during submission', () => {
  assert.match(confirmation, /trapFocus/);
  assert.match(confirmation, /dismissible=\{!loading\}/);
  assert.match(confirmation, /if \(!loading\) onClose\(\)/);
  assert.match(confirmation, /variant="danger"/);
  assert.match(confirmation, /variant="secondary"/);
  assert.match(confirmation, /className="sm:max-w-lg"/);
  assert.match(sharedModal, /max-h-\[92dvh\]/);
  assert.match(sharedModal, /sm:items-center/);
  assert.match(sharedModal, /role="dialog"/);
  assert.match(sharedModal, /aria-modal="true"/);
});

test('cancellation is explicitly acknowledged and clears only a cancelled status', () => {
  assert.match(details, /pending\.walletApprovalAttemptedAt && !pending\.walletRejectedAt/);
  assert.match(details, /const remote = await tokenApi\.getManualPriceUpdate\(pending\.priceUpdateUid, pending\.chainUid\)/);
  assert.match(details, /remote\?\.txHash/);
  assert.match(details, /await tokenApi\.cancelManualPrice\(pending\.priceUpdateUid, pending\.chainUid, \{/);
  assert.match(details, /confirmNotBroadcast: true/);
  assert.match(details, /recoveryStatus === 'CANCELLED'/);
  assert.match(details, /recoveryStatus === 'BROADCAST_STATUS_UNKNOWN'/);
  assert.match(details, /await synchronizePriceFromBackend\(pending\)/);
  assert.match(details, /loading=\{updatingPrice\}/);
});
