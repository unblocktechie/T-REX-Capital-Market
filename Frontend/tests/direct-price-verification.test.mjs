import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  verifyDirectPriceUntilSynchronized,
  isTransientPriceVerificationError,
} from '../src/services/issuer/directPriceVerification.service.js';
import {
  loadTokenPriceSyncRecovery,
  saveTokenPriceSyncRecovery,
  clearTokenPriceSyncRecovery,
} from '../src/services/issuer/tokenPriceSyncRecovery.service.js';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const hash = `0x${'a'.repeat(64)}`;

const makeResponse = (status, data = {}) => ({ pending: status === 202, token: status === 200 ? data : null });

test('HTTP 202 retries the exact original price/hash/chain without any wallet call and 200 stops', async () => {
  const calls = [];
  const delays = [];
  const states = [makeResponse(202), makeResponse(202), makeResponse(200, { currentTokenPrice: '301' })];
  let count = 0;
  const token = await verifyDirectPriceUntilSynchronized({
    submit: async (...args) => { calls.push(args.slice(0, 3)); return states[count++]; },
    currentTokenPrice: '300.000000', txHash: hash, chainUid: 'sepolia', priceUpdateUid: 'price-uid-1',
    sleep: async (ms) => { delays.push(ms); },
  });
  assert.deepEqual(delays, [5000, 5000]);
  assert.deepEqual(calls, Array(3).fill(['300.000000', hash, 'sepolia']));
  assert.deepEqual(token, { currentTokenPrice: '301' });
});

test('transient network errors back off; retry verification rather than MetaMask', async () => {
  const delays = [];
  let attempt = 0;
  const token = await verifyDirectPriceUntilSynchronized({
    submit: async () => {
      attempt++;
      if (attempt < 3) throw { response: { status: 502 } };
      return makeResponse(200, { currentTokenPrice: '3' });
    },
    currentTokenPrice: '3', txHash: hash, chainUid: 'sepolia', priceUpdateUid: 'price-uid-1',
    sleep: async (ms) => { delays.push(ms); },
  });
  assert.equal(attempt, 3);
  assert.deepEqual(delays, [5000, 10000]);
  assert.equal(token.currentTokenPrice, '3');
});

test('invalid transaction, chain mismatch and rejected receipts are terminal, not auto-retried', async () => {
  for (const status of [400, 403, 409, 422]) {
    let calls = 0;
    await assert.rejects(verifyDirectPriceUntilSynchronized({
      submit: async () => { calls++; throw { response: { status } }; },
      currentTokenPrice: '3', txHash: hash, chainUid: 'sepolia', priceUpdateUid: 'price-uid-1',
      sleep: async () => { throw Error('Should never sleep'); },
    }));
    assert.equal(calls, 1);
  }
  assert.equal(isTransientPriceVerificationError({ response: { status: 503, data: { error: { code: 'RPC_CHAIN_MISMATCH' } } } }), false);
  assert.equal(isTransientPriceVerificationError({ response: { status: 502 } }), true);
});

test('aborting verification stops polling', async () => {
  const controller = new AbortController();
  let called = 0;
  await assert.rejects(verifyDirectPriceUntilSynchronized({
    submit: async () => { called++; return makeResponse(202); },
    currentTokenPrice: '3', txHash: hash, chainUid: 'sepolia', priceUpdateUid: 'price-uid-1', signal: controller.signal,
    sleep: async () => { controller.abort(); throw new Error('cancelled'); },
  }));
  assert.equal(called, 1);
});

test('browser recovery requires tx hash and is isolated to issuer/chain/asset', () => {
  const store = new Map();
  const oldWindow = globalThis.window;
  globalThis.window = { localStorage: {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, value),
    removeItem: (key) => store.delete(key),
  } };
  try {
    const a = saveTokenPriceSyncRecovery('0x123', { priceUpdateUid: 'intent-1', txHash: hash, chainUid: 'chain-A', userKey: 'user-A', currentTokenPrice: '300.000001' });
    const b = saveTokenPriceSyncRecovery('0x123', { priceUpdateUid: 'intent-2', txHash: `0x${'b'.repeat(64)}`, chainUid: 'chain-B', userKey: 'user-A', currentTokenPrice: '4' });
    assert.deepEqual(loadTokenPriceSyncRecovery('0x123', { chainUid: 'chain-A', userKey: 'user-A' }), a);
    assert.deepEqual(loadTokenPriceSyncRecovery('0x123', { chainUid: 'chain-B', userKey: 'user-A' }), b);
    assert.equal(loadTokenPriceSyncRecovery('0x123', { chainUid: 'chain-A', userKey: 'user-B' }), null);
    clearTokenPriceSyncRecovery('0x123', { chainUid: 'chain-A', userKey: 'user-A' });
    assert.equal(loadTokenPriceSyncRecovery('0x123', { chainUid: 'chain-A', userKey: 'user-A' }), null);
    assert.deepEqual(loadTokenPriceSyncRecovery('0x123', { chainUid: 'chain-B', userKey: 'user-A' }), b);
    assert.throws(() => saveTokenPriceSyncRecovery('0x123', { currentTokenPrice: '4', chainUid: 'chain-A', userKey: 'user-A' }), /ID/);
  } finally {
    if (oldWindow === undefined) delete globalThis.window;
    else globalThis.window = oldWindow;
  }
});

test('PATCH pins the original selected chain and requires transaction hash, not a database-only update', () => {
  const api = read('../src/api/tokens/token.api.js');
  const interceptors = read('../src/api/axios/interceptors.js');
  const details = read('../src/pages/tokens/TokenDetailsPage.jsx');
  assert.match(api, /assertValidTransactionHash\(txHash\)/);
  assert.match(api, /priceUpdateUid: savedIntentUid, currentTokenPrice: normalized, txHash: transactionHash/);
  assert.match(api, /'X-Chain-Uid': selectedChainUid/);
  assert.match(api, /pending: response\.status === 202/);
  assert.match(interceptors, /!config\.headers\?\.has\?\.\('X-Chain-Uid'\)/);
  assert.match(details, /saveTokenPriceSyncRecovery\(tokenContractAddress/);
  assert.match(details, /runPriceVerification\(broadcast\)/);
  assert.match(details, /sendPreparedManualPriceTransaction\(/);
  assert.match(details, /prepareManualPrice\(submittedPrice, tokenChainUid\)/);
  assert.doesNotMatch(details, /setPlatformTokenPrice\(/);
  assert.match(details, /Awaiting confirmation/);
  assert.doesNotMatch(details, /mergeCurrentPriceIntoToken/);
});
