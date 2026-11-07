import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  hasBackendPriceVerificationRejection,
  loadTokenPriceSyncRecovery,
  saveTokenPriceSyncRecovery,
} from '../src/services/issuer/tokenPriceSyncRecovery.service.js';
import { sendPreparedManualPriceTransaction } from '../src/services/issuer/manualPriceTransaction.service.js';

const read = (name) => readFileSync(new URL(name, import.meta.url), 'utf8');
const details = read('../src/pages/tokens/TokenDetailsPage.jsx');
const api = read('../src/api/tokens/token.api.js');
const issuer = `0x${'a'.repeat(40)}`;
const token = `0x${'b'.repeat(40)}`;
const controller = `0x${'c'.repeat(40)}`;
const hash = `0x${'f'.repeat(64)}`;
const prepared = {
  priceUpdateUid: 'prepared-price-uid', status: 'PENDING', chainId: 11155111,
  issuerWalletAddress: issuer, tokenAddress: token, controllerAddress: controller,
  transactionRequest: { from: issuer, to: controller, data: '0x12345678', value: '0', nonce: 7, chainId: 11155111 },
};

test('reference flow: persist hash then verify through backend, never gate PATCH on local RPC transaction inspection', () => {
  const submitStart = details.indexOf('const submitPreparedWithWallet = async (pending) =>');
  const submitEnd = details.indexOf('const handlePriceUpdate = async () =>');
  const body = details.slice(submitStart, submitEnd);
  assert.ok(submitStart > 0 && submitEnd > submitStart);
  assert.match(body, /await sendPreparedManualPriceTransaction\(/);
  assert.match(body, /const broadcast = saveTokenPriceSyncRecovery\(/);
  assert.match(body, /void runPriceVerification\(broadcast\)/);
  assert.doesNotMatch(body, /inspectBroadcastManualPriceTransaction|eth_getTransactionByHash/);
  assert.ok(body.indexOf('const broadcast = saveTokenPriceSyncRecovery(') < body.indexOf('void runPriceVerification(broadcast)'));
  assert.match(api, /\.patch\(\s*TOKEN_ENDPOINTS\.price,\s*\{ priceUpdateUid: savedIntentUid, currentTokenPrice: normalized, txHash: transactionHash \}/);
  assert.match(api, /response\.status === 202/);
});

test('wallet broadcasts one transaction even when an unrelated RPC would report a wrapped transaction', async () => {
  const calls = [];
  const connector = { getProvider: async () => ({ request: async ({ method, params }) => {
    calls.push({ method, params });
    if (method === 'eth_accounts') return [issuer];
    if (method === 'eth_chainId') return '0xaa36a7';
    if (method === 'eth_sendTransaction') return hash;
    throw new Error(`Unexpected wallet request: ${method}`);
  } }) };
  const actual = await sendPreparedManualPriceTransaction({
    connector, connectedAddress: issuer, issuerWalletAddress: issuer,
    tokenAddress: token, chainId: 11155111, prepared,
  });
  assert.equal(actual, hash);
  assert.deepEqual(calls.map(({method}) => method), ['eth_accounts', 'eth_chainId', 'eth_sendTransaction']);
  assert.equal(calls[2].params[0].to, controller);
});

test('pre-existing client-only warning is not treated as an authoritative backend rejection', () => {
  assert.equal(hasBackendPriceVerificationRejection({ verificationIssue: 'INVALID_PRICE_TRANSACTION_TARGET' }), false);
  assert.equal(hasBackendPriceVerificationRejection({ verificationIssue: 'INVALID_PRICE_TRANSACTION_TARGET', verificationIssueSource: 'backend' }), true);
  assert.equal(hasBackendPriceVerificationRejection({ verificationIssue: 'INVALID_PRICE_TRANSACTION_DETAILS', verificationIssueSource: 'backend' }), true);
  assert.equal(hasBackendPriceVerificationRejection({ verificationIssue: 'INVALID_PRICE_TRANSACTION_TARGET', verificationIssueSource: 'local' }), false);
  assert.equal(hasBackendPriceVerificationRejection({ verificationIssue: 'NETWORK_TIMEOUT', verificationIssueSource: 'backend' }), false);
});

test('legacy on-device hash and error are safely recoverable, backend refusal persists across reload', () => {
  const oldWindow = globalThis.window;
  const memory = new Map();
  globalThis.window = { localStorage: {
    getItem: key => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, value),
    removeItem: key => memory.delete(key),
  }};
  try {
    const identity = { chainUid: 'sepolia', userKey: 'issuer-a' };
    const legacy = saveTokenPriceSyncRecovery(token, { ...prepared, ...identity, currentTokenPrice: '389', txHash: hash, verificationIssue: 'INVALID_PRICE_TRANSACTION_TARGET' });
    assert.equal(hasBackendPriceVerificationRejection(loadTokenPriceSyncRecovery(token, identity)), false);
    const backend = saveTokenPriceSyncRecovery(token, { ...legacy, verificationIssue: 'INVALID_PRICE_TRANSACTION_TARGET', verificationIssueSource: 'backend' });
    assert.equal(hasBackendPriceVerificationRejection(loadTokenPriceSyncRecovery(token, identity)), true);
    assert.equal(backend.txHash, hash);
    assert.equal(loadTokenPriceSyncRecovery(token, { ...identity, chainUid: 'other-chain' }), null);
  } finally {
    if (oldWindow === undefined) delete globalThis.window;
    else globalThis.window = oldWindow;
  }
});

test('on reload the backend alone determines whether the old saved hash is terminal', () => {
  assert.match(details, /pending\.txHash && hasBackendPriceVerificationRejection\(pending\)/);
  assert.match(details, /else if \(pending\.txHash\) \{\s*void runPriceVerification\(pending, \{ resumed: true \}\)/);
  assert.match(details, /hasBackendPriceVerificationRejection\(pending\)/);
  assert.match(details, /const remote = await tokenApi\.getManualPriceUpdate\(pending\.priceUpdateUid, pending\.chainUid\)/);
  assert.match(details, /remoteStatus === 'CONFIRMED'/);
  assert.match(details, /verificationIssueSource: 'backend'/);
  assert.match(details, /clearTokenPriceSyncRecovery\(pending\.tokenAddress/);
  assert.doesNotMatch(details, /wallet_sendCalls\(|redeemDelegations\(/);
});
