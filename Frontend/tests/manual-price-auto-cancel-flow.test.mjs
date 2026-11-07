import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const page = read('../src/pages/tokens/TokenDetailsPage.jsx');
const api = read('../src/api/tokens/token.api.js');

test('wallet rejection calls cancellation directly without confirmation popup', () => {
  assert.match(page, /code === '4001' \|\| code === 'ACTION_REJECTED'/);
  assert.match(page, /walletRejectedAt: new Date\(\)\.toISOString\(\)/);
  assert.match(page, /await cancelRejectedPriceRequest\(rejected\)/);
  assert.doesNotMatch(page, /CancelUnsignedPriceRequestModal|setCancelUnsignedPriceOpen/);
  assert.doesNotMatch(page, /window\.confirm\(|>Approve in MetaMask</);
});

test('the main update action prepares and opens wallet once', () => {
  const flow = page.slice(page.indexOf('const handlePriceUpdate = async () =>'), page.indexOf('  return (\n    <div className="token-details-page'));
  assert.match(flow, /await tokenApi\.prepareManualPrice\(submittedPrice, tokenChainUid\)/);
  assert.match(flow, /saveTokenPriceSyncRecovery\(tokenContractAddress/);
  assert.match(flow, /await submitPreparedWithWallet\(pending\)/);
  assert.match(page, />Update Price<\/Button>/);
  assert.doesNotMatch(page, />Approve in MetaMask<\/Button>/);
});

test('cancellation is limited to explicit hashless wallet rejection and pinned chain', () => {
  assert.match(page, /if \(!pending\?\.walletRejectedAt \|\| pending\.txHash \|\| pending\.walletSubmissionStartedAt\) return/);
  assert.match(page, /const remote = await tokenApi\.getManualPriceUpdate\(pending\.priceUpdateUid, pending\.chainUid\)/);
  assert.match(page, /await tokenApi\.cancelManualPrice\(pending\.priceUpdateUid, pending\.chainUid, \{/);
  assert.match(page, /confirmNotBroadcast: true/);
  assert.match(api, /skipSelectedChainHeader: true/);
  assert.match(api, /if \(confirmNotBroadcast !== true\)/);
});

test('backend decides outcome; uncertain and broadcast requests are preserved', () => {
  assert.match(page, /if \(remote\?\.txHash\)/);
  assert.match(page, /recoveryStatus === 'CANCELLED'/);
  assert.match(page, /recoveryStatus === 'CONFIRMED'/);
  assert.match(page, /recoveryStatus === 'BROADCAST_STATUS_UNKNOWN'/);
  assert.match(page, /result\?\.txHash/);
  assert.match(page, /saveTokenPriceSyncRecovery\(pending\.tokenAddress, \{/);
  assert.match(page, /setPriceSyncStatus\('attention'\)/);
  assert.match(page, /rejectionCancellationRef\.current/);
});

test('generic provider errors and closing the price editor never cancel a request', () => {
  const walletCatch = page.slice(page.indexOf('const submitPreparedWithWallet ='), page.indexOf('const handlePriceUpdate ='));
  assert.match(walletCatch, /Unknown provider\/RPC errors after opening MetaMask are NOT safe to cancel/);
  assert.match(walletCatch, /MetaMask did not return a transaction hash/);
  const close = page.slice(page.indexOf('const closePriceEditor ='), page.indexOf('const resumeIncompleteSetup ='));
  assert.doesNotMatch(close, /cancelManualPrice|confirmNotBroadcast|cancelRejectedPriceRequest/);
  assert.doesNotMatch(page, /<CancelUnsignedPriceRequestModal/);
});
