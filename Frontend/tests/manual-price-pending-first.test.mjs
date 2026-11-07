import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  validatePreparedManualPrice,
  sendPreparedManualPriceTransaction,
} from '../src/services/issuer/manualPriceTransaction.service.js';
import {
  loadTokenPriceSyncRecovery,
  saveTokenPriceSyncRecovery,
  clearTokenPriceSyncRecovery,
} from '../src/services/issuer/tokenPriceSyncRecovery.service.js';

const issuer = '0x' + 'a'.repeat(40);
const token = '0x' + 'b'.repeat(40);
const controller = '0x' + 'c'.repeat(40);
const hash = '0x' + 'f'.repeat(64);
const prepared = () => ({
  priceUpdateUid: 'price-intent-uid', status: 'PENDING', chainId: 11155111,
  issuerWalletAddress: issuer, tokenAddress: token, controllerAddress: controller,
  transactionRequest: { to: controller, from: issuer, chainId: 11155111,
    nonce: 7, value: '0', data: '0x12345678' },
});
const read = (file) => readFileSync(new URL(file, import.meta.url), 'utf8');

test('prepared transaction keeps controller, nonce, zero value and exact calldata', () => {
  const tx = validatePreparedManualPrice(prepared(), { issuerWalletAddress: issuer, tokenAddress: token, chainId: 11155111 });
  assert.deepEqual(tx, {
    from: issuer, to: controller, value: '0x0', nonce: '0x7',
    chainId: '0xaa36a7', data: '0x12345678',
  });
  assert.throws(() => validatePreparedManualPrice({ ...prepared(), transactionRequest: { ...prepared().transactionRequest, to: token } },
    { issuerWalletAddress: issuer, tokenAddress: token, chainId: 11155111 }), /Controller/);
  assert.throws(() => validatePreparedManualPrice({ ...prepared(), transactionRequest: { ...prepared().transactionRequest, nonce: -1 } },
    { issuerWalletAddress: issuer, tokenAddress: token, chainId: 11155111 }), /nonce/);
  assert.throws(() => validatePreparedManualPrice({ ...prepared(), transactionRequest: { ...prepared().transactionRequest, value: '1' } },
    { issuerWalletAddress: issuer, tokenAddress: token, chainId: 11155111 }), /native currency/);
  assert.equal(validatePreparedManualPrice({ ...prepared(), status: 'SUBMITTED', txHash: hash }, { issuerWalletAddress: issuer, tokenAddress: token, chainId: 11155111 }), null);
});

test('wallet sends one direct EIP-1193 transaction using server intent', async () => {
  const calls = [];
  const connector = { getProvider: async () => ({ request: async (args) => {
    calls.push(args);
    if (args.method === 'eth_accounts') return [issuer];
    if (args.method === 'eth_chainId') return '0xaa36a7';
    if (args.method === 'eth_sendTransaction') return hash;
  } }) };
  assert.equal(await sendPreparedManualPriceTransaction({ connector, connectedAddress: issuer, issuerWalletAddress: issuer,
    tokenAddress: token, chainId: 11155111, prepared: prepared() }), hash);
  assert.deepEqual(calls.map(c => c.method), ['eth_accounts','eth_chainId','eth_sendTransaction']);
  assert.equal(calls[2].params[0].to, controller);
  assert.equal(calls[2].params[0].nonce, '0x7');
  assert.equal(calls[2].params[0].data, '0x12345678');
});

test('wallet rejects account/network mismatch before broadcasting', async () => {
  const called = [];
  const connector = { getProvider: async () => ({ request: async (args) => {
    called.push(args.method);
    if (args.method === 'eth_accounts') return [issuer];
    if (args.method === 'eth_chainId') return '0x1';
  } }) };
  await assert.rejects(sendPreparedManualPriceTransaction({ connector, connectedAddress: issuer, issuerWalletAddress: issuer,
    tokenAddress: token, chainId: 11155111, prepared: prepared() }), /Switch MetaMask/);
  assert.ok(!called.includes('eth_sendTransaction'));
});

test('pending intent without a hash survives reload and remains chain/issuer scoped', () => {
  const oldWindow = globalThis.window;
  const memory = new Map();
  globalThis.window = { localStorage: {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, val) => memory.set(key, val),
    removeItem: (key) => memory.delete(key),
  } };
  try {
    const args = { chainUid: 'sep', userKey: 'issuer-1', priceUpdateUid: 'uid-1', currentTokenPrice: '350',
      transactionRequest: prepared().transactionRequest };
    const saved = saveTokenPriceSyncRecovery(token, args);
    assert.equal(saved.txHash, '');
    assert.equal(loadTokenPriceSyncRecovery(token, args).priceUpdateUid, 'uid-1');
    assert.equal(loadTokenPriceSyncRecovery(token, { chainUid: 'other', userKey: 'issuer-1' }), null);
    const broadcast = saveTokenPriceSyncRecovery(token, { ...saved, txHash: hash });
    assert.equal(loadTokenPriceSyncRecovery(token, args).txHash, hash);
    assert.equal(broadcast.priceUpdateUid, 'uid-1');
    clearTokenPriceSyncRecovery(token, args);
    assert.equal(loadTokenPriceSyncRecovery(token, args), null);
  } finally { if (oldWindow === undefined) delete globalThis.window; else globalThis.window = oldWindow; }
});

test('prepare precedes wallet prompt and PATCH carries pinned request ID, price and hash', () => {
  const details = read('../src/pages/tokens/TokenDetailsPage.jsx');
  const api = read('../src/api/tokens/token.api.js');
  assert.match(details, /await tokenApi\.prepareManualPrice\(submittedPrice, tokenChainUid\)/);
  assert.match(details, /saveTokenPriceSyncRecovery\(tokenContractAddress/);
  assert.match(details, /await submitPreparedWithWallet\(pending\)/);
  assert.doesNotMatch(details, />Approve in MetaMask</);
  assert.match(details, /cancelManualPrice/);
  assert.match(api, /priceUpdateUid: savedIntentUid, currentTokenPrice: normalized, txHash: transactionHash/);
  assert.match(api, /skipSelectedChainHeader: true/);
  assert.doesNotMatch(details, /setPlatformTokenPrice\(/);
});


test('wallet-managed execution is accepted as a normal returned blockchain hash', async () => {
  const calls = [];
  const actions = [];
  const connector = { getProvider: async () => ({ request: async (request) => {
    calls.push(request.method);
    if (request.method === 'eth_accounts') return [issuer];
    if (request.method === 'eth_chainId') return '0xaa36a7';
    if (request.method === 'eth_sendTransaction') {
      actions.push('wallet submit');
      assert.equal(request.params[0].to, controller);
      return hash; // wallet may route outer execution through its own account
    }
    throw new Error('Unexpected transaction lookup or extra wallet call');
  } }) };
  const actual = await sendPreparedManualPriceTransaction({
    connector, connectedAddress: issuer, issuerWalletAddress: issuer,
    tokenAddress: token, chainId: 11155111, prepared: prepared(),
    onBeforeBroadcast: () => actions.push('persist attempted wallet submission'),
  });
  assert.equal(actual, hash);
  assert.deepEqual(actions, ['persist attempted wallet submission','wallet submit']);
  assert.deepEqual(calls, ['eth_accounts','eth_chainId','eth_sendTransaction']);
});

test('an invalid wallet/network is blocked without marking a wallet submission', async () => {
  let started = 0;
  const connector = { getProvider: async () => ({ request: async ({ method }) => {
    if (method === 'eth_accounts') return [issuer];
    if (method === 'eth_chainId') return '0x1';
    throw new Error(`Unexpected method ${method}`);
  } }) };
  await assert.rejects(sendPreparedManualPriceTransaction({
    connector, connectedAddress: issuer, issuerWalletAddress: issuer,
    tokenAddress: token, chainId: 11155111, prepared: prepared(),
    onBeforeBroadcast: () => started++,
  }), /Switch MetaMask/);
  assert.equal(started, 0);
});

test('interrupted wallet prompt cannot be treated as unsigned after refresh', () => {
  const oldWindow = globalThis.window;
  const memory = new Map();
  globalThis.window = { localStorage: {
    getItem: key => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, value),
    removeItem: key => memory.delete(key),
  }};
  try {
    const identity = { userKey: 'issuer', chainUid: 'sepolia' };
    const pending = saveTokenPriceSyncRecovery(token, {
      ...identity, priceUpdateUid: 'prepared-uid', currentTokenPrice: '389',
      walletSubmissionStartedAt: new Date().toISOString(),
    });
    assert.equal(pending.txHash, '');
    assert.ok(loadTokenPriceSyncRecovery(token, identity).walletSubmissionStartedAt);
    const recovered = saveTokenPriceSyncRecovery(token, { ...pending, txHash: hash });
    assert.equal(loadTokenPriceSyncRecovery(token, identity).txHash, hash);
    assert.equal(recovered.walletSubmissionStartedAt, pending.walletSubmissionStartedAt);
  } finally { if (oldWindow === undefined) delete globalThis.window; else globalThis.window = oldWindow; }
});

test('rejected wallet approval triggers backend cancellation without a popup or on-page action', () => {
  const details = read('../src/pages/tokens/TokenDetailsPage.jsx');
  assert.match(details, /walletRejectedAt: new Date\(\)\.toISOString\(\)/);
  assert.doesNotMatch(details, /const mayApprove/);
  assert.doesNotMatch(details, /const mayCancel/);
  assert.match(details, /await cancelRejectedPriceRequest\(rejected\)/);
  assert.doesNotMatch(details, /setCancelUnsignedPriceOpen/);
  assert.match(details, /onBeforeBroadcast:/);
  assert.doesNotMatch(details, /verifyExistingWalletHash|retrySavedPriceVerification|Review and resume prepared request/);
  assert.doesNotMatch(details, /inspectBroadcastManualPriceTransaction/);
});

test('explicit rejection marker survives reload and does not mask previously broadcast hashes', () => {
  const oldWindow = globalThis.window;
  const memory = new Map();
  globalThis.window = { localStorage: {
    getItem: k => memory.get(k) ?? null,
    setItem: (k,v) => memory.set(k,v),
    removeItem: k => memory.delete(k),
  }};
  try {
    const identity = { chainUid: 'sep', userKey: 'issuer-1' };
    const rejected = saveTokenPriceSyncRecovery(token, { ...identity, priceUpdateUid: 'request-id',
      currentTokenPrice: '42', walletSubmissionStartedAt: '', walletRejectedAt: '2026-10-14T07:00:00.000Z' });
    assert.ok(loadTokenPriceSyncRecovery(token, identity).walletRejectedAt);
    assert.equal(rejected.txHash, '');
    const submitted = saveTokenPriceSyncRecovery(token, { ...rejected, txHash: hash });
    assert.equal(submitted.txHash, hash);
  } finally {
    if (oldWindow === undefined) delete globalThis.window;
    else globalThis.window = oldWindow;
  }
});

test('terminal wrong-controller finding is retained through page reloads', () => {
  const oldWindow = globalThis.window;
  const memory = new Map();
  globalThis.window = { localStorage: {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, value),
    removeItem: (key) => memory.delete(key),
  } };
  try {
    const settings = { chainUid: 'sepolia', userKey: 'issuer', priceUpdateUid: 'prepared-1',
      currentTokenPrice: '300', txHash: hash, verificationIssue: 'INVALID_PRICE_TRANSACTION_TARGET' };
    const saved = saveTokenPriceSyncRecovery(token, settings);
    assert.equal(saved.verificationIssue, 'INVALID_PRICE_TRANSACTION_TARGET');
    assert.equal(loadTokenPriceSyncRecovery(token, settings).verificationIssue, 'INVALID_PRICE_TRANSACTION_TARGET');
    assert.equal(loadTokenPriceSyncRecovery(token, settings).txHash, hash);
  } finally { if (oldWindow === undefined) delete globalThis.window; else globalThis.window = oldWindow; }
});
