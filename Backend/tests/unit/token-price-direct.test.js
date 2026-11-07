const test = require('node:test');
const assert = require('node:assert/strict');
const { ethers } = require('ethers');
const { TokenPriceUpdateService } = require('../../src/services/token-price-update.service');
const { TokenPriceUpdateRepository } = require('../../src/repositories/token-price-update.repository');
const { CONTROLLER_ABI } = require('../../src/services/blockchain/blockchain-transaction.service');
const iface = new ethers.Interface(CONTROLLER_ABI);
const tokenAddress = `0x${'1'.repeat(40)}`;
const controllerAddress = `0x${'2'.repeat(40)}`;
const issuer = `0x${'3'.repeat(40)}`;
const txHash = `0x${'a'.repeat(64)}`;
const blockHash = `0x${'b'.repeat(64)}`;
function fixture(config = {}) {
  const state = { saved: [], latest: 11, blockHash };
  const event = iface.encodeEventLog(iface.getEvent('TokenPriceUpdated'), [tokenAddress, 10000000n, 300000000n]);
  state.tx = { to: controllerAddress, from: issuer, chainId: 1n, nonce: 7, data: iface.encodeFunctionData('setPrice', [tokenAddress, 300000000n]), value: 0n };
  state.receipt = { status: 1, blockNumber: 10, blockHash, index: 0, gasUsed: 100n, gasPrice: 2n,
    logs: [{ ...event, address: controllerAddress, index: 6 }] };
  const token = { tokenUid: 't', organizationUid: 'o', chainUid: 'c', tokenAddress, tokenAgentWalletAddress: controllerAddress, status: 'deployed', isActive: true };
  const provider = { getNetwork: async () => ({ chainId: 1n }), getTransaction: async () => state.tx,
    getTransactionReceipt: async () => state.receipt, getBlockNumber: async () => state.latest,
    getBlock: async () => ({ hash: state.blockHash, timestamp: 1 }), destroy() {} };
  state.intent = { priceUpdateUid: 'p', tokenUid: 't', organizationUid: 'o', chainUid: 'c',
    submissionMode: 'DIRECT', directTransactionNonce: 7, newPriceRaw: '300000000', tokenAddress, controllerAddress, issuerWalletAddress: issuer, status: 'PENDING' };
  const service = new TokenPriceUpdateService({
    tokenRepository: { findByUserUid: async () => token },
    organizationRepository: { findByUserUid: async () => ({ organizationUid: 'o', walletAddress: issuer, status: 'approved' }) },
    repository: { findByUid: async () => state.intent,
      recordDirectHash: async () => { state.intent.status = 'SUBMITTED'; state.intent.transactionHash = txHash; return state.intent; },
      markFailed: async () => { state.intent.status = 'FAILED'; },
      confirmEvent: async (data) => { state.saved.push(data); } },
    transactionRunner: (work) => work({}),
    dependencies: { providerFactory: () => provider, contractFactory: () => ({ PRICE_DECIMALS: async () => 6n }) },
  });
  return { state, run: (input = {}) => service.confirmDirect({ userUid: 'u', roleName: 'Issuer' },
    { priceUpdateUid: 'p', txHash, currentTokenPrice: '300', ...input }, { chainUid: 'c', chainId: 1, confirmations: 2, platformControllerAddress: controllerAddress, ...config }) };
}

const manager = `0x${'4'.repeat(40)}`;
const delegation = new ethers.Interface(require('../../src/services/blockchain/blockchain-transaction.service').DELEGATION_MANAGER_ABI);
function wrap(state, { target = controllerAddress, value = 0n, mode = ethers.ZeroHash, count = 1 } = {}) {
  const payload = ethers.concat([target, ethers.zeroPadValue(ethers.toBeHex(value), 32), state.tx.data]);
  state.tx.to = manager;
  state.tx.data = delegation.encodeFunctionData('redeemDelegations', [Array(count).fill('0x'), Array(count).fill(mode), Array(count).fill(payload)]);
}
test('issuer-originated allowlisted smart-account call confirms the original intent', async () => {
  const { state, run } = fixture({ transactionDelegationManagerAddresses: [manager] });
  wrap(state);
  assert.equal((await run()).pending, false);
  assert.equal(state.saved[0].matchedPriceUpdateUid, 'p');
  assert.equal(state.saved[0].directTransactionNonce, 7);
  assert.equal(state.saved[0].submissionMode, 'DIRECT');
});
test('indexer recognizes the same smart-account execution and supplies the pinned nonce for intent recovery', async () => {
  const { TokenPriceIndexerService } = require('../../src/services/blockchain/token-price-indexer.service');
  const { state } = fixture(); wrap(state);
  const saved = [];
  const indexer = new TokenPriceIndexerService({
    config: { chainUid: 'c', chainId: 1, platformControllerAddress: controllerAddress,
      transactionDelegationManagerAddresses: [manager] },
    tokenRepository: { findDeployedByAddress: async () => ({ tokenUid: 't', tokenAddress,
      issuerWalletAddress: issuer, tokenAgentWalletAddress: controllerAddress }) },
    priceRepository: { confirmEvent: async data => saved.push(data) },
  });
  const provider = { getTransaction: async () => state.tx, getTransactionReceipt: async () => state.receipt,
    getBlock: async () => ({ timestamp: 1 }) };
  const log = { transactionHash: txHash, blockNumber: 10, blockHash, index: 6 };
  const parsed = { args: { token: tokenAddress, oldPrice: 10000000n, newPrice: 300000000n } };
  assert.equal(await indexer.processPriceEvent(provider, log, parsed, controllerAddress, 6, {}), true);
  assert.equal(saved[0].submissionMode, 'DIRECT');
  assert.equal(saved[0].directTransactionNonce, 7);
  state.tx.from = tokenAddress;
  await indexer.processPriceEvent(provider, log, parsed, controllerAddress, 6, {});
  assert.equal(saved[1].submissionMode, 'INDEXED');
  assert.equal(saved[1].directTransactionNonce, null);
  assert.equal(await indexer.processPriceEvent(provider, log, parsed, manager, 6, {}), false);
});
test('smart-account calls reject untrusted managers, batches, modes, value, sender, nonce and inner targets', async () => {
  for (const change of [
    s => { s.tx.to = tokenAddress; }, s => { s.tx.from = tokenAddress; },
    s => { s.tx.nonce = 8; }, s => { s.tx.value = 1n; },
  ]) {
    const { state, run } = fixture({ transactionDelegationManagerAddresses: [manager] });
    wrap(state); change(state); await assert.rejects(run()); assert.equal(state.saved.length, 0);
  }
  for (const options of [{ count: 2 }, { value: 1n }, { target: tokenAddress }, { mode: txHash }]) {
    const { state, run } = fixture({ transactionDelegationManagerAddresses: [manager] });
    wrap(state, options); await assert.rejects(run()); assert.equal(state.saved.length, 0);
  }
  const { state, run } = fixture(); wrap(state); await assert.rejects(run());
});
test('direct confirmation verifies evidence and saves DIRECT, never LEGACY', async () => {
  const { state, run } = fixture();
  assert.equal((await run()).pending, false);
  assert.equal(state.saved[0].submissionMode, 'DIRECT');
  assert.equal(state.saved[0].transactionHash, txHash);
  assert.equal(state.saved[0].oldPriceRaw, '10000000');
  assert.equal(state.saved[0].newPriceFormatted, '300.0');
});
test('missing, unmined, insufficient-confirmation and noncanonical transactions do not update DB', async () => {
  for (const mutate of [s => { s.tx = null; }, s => { s.receipt = null; },
    s => { s.latest = 10; }, s => { s.blockHash = txHash; }]) {
    const { state, run } = fixture(); mutate(state);
    assert.equal((await run()).pending, true); assert.equal(state.saved.length, 0);
  }
});
test('wrong sender, contract, chain, price, function, failed receipt and missing event rejected', async () => {
  for (const mutate of [s => { s.tx.from = tokenAddress; }, s => { s.tx.to = tokenAddress; },
    s => { s.tx.chainId = 2n; }, s => { s.tx.data = iface.encodeFunctionData('setPrice', [tokenAddress, 1n]); },
    s => { s.tx.data = '0x'; }, s => { s.receipt.status = 0; }, s => { s.receipt.logs = []; }]) {
    const { state, run } = fixture(); mutate(state);
    await assert.rejects(run()); assert.equal(state.saved.length, 0);
  }
  await assert.rejects(fixture().run({ txHash: undefined }));
});

test('manual confirmation rejects another issuer intent and a different wallet nonce', async () => {
  for (const mutate of [s => { s.intent.organizationUid = 'other'; }, s => { s.tx.nonce = 8; }]) {
    const { state, run } = fixture(); mutate(state); await assert.rejects(run());
    assert.equal(state.saved.length, 0);
  }
});

test('prepare returns pinned direct calldata only after a pending record is saved', async () => {
  let saved;
  const service = new TokenPriceUpdateService({
    tokenRepository: { findByUserUid: async () => ({ tokenUid: 't', organizationUid: 'o', chainUid: 'c', status: 'deployed', tokenAddress, tokenAgentWalletAddress: controllerAddress }) },
    organizationRepository: { findByUserUid: async () => ({ organizationUid: 'o', status: 'approved', walletAddress: issuer }) },
    repository: { prepareDirect: async data => { saved = data; return { ...data, priceUpdateUid: 'p', status: 'PENDING' }; } },
    transactionRunner: work => work({}),
    dependencies: { providerFactory: () => ({ getNetwork: async () => ({ chainId: 1n }), getTransactionCount: async () => 7,
      getBlockNumber: async () => 10, destroy() {} }), contractFactory: () => ({ PRICE_DECIMALS: async () => 6,
      getTokenInfo: async () => ({ issuer }), tokenPrice: async () => 10000000n }) },
  });
  const result = await service.prepareDirect({ roleName: 'Issuer', userUid: 'u' }, { currentTokenPrice: '350' },
    { chainUid: 'c', chainId: 1, platformControllerAddress: controllerAddress });
  assert.equal(saved.newPriceRaw, '350000000');
  assert.equal(saved.oldPriceRaw, '10000000');
  assert.equal(saved.oldPriceFormatted, '10.0');
  assert.equal(result.status, 'PENDING'); assert.equal(result.priceUpdateUid, 'p');
  assert.equal(result.transactionRequest.to, controllerAddress); assert.equal(result.transactionRequest.nonce, 7);
  assert.equal(iface.parseTransaction({ data: result.transactionRequest.data }).name, 'setPrice');
});
test('repository locks token before current history read and reuses existing indexed row', async () => {
  const sql = [];
  const row = { priceUpdateUid: 'p', tokenUid: 't', chainUid: 'c' };
  const executor = { execute: async (query) => { sql.push(query);
    return [query.startsWith('SELECT * FROM tokenPriceUpdate') ? [row] : []]; } };
  const repo = new TokenPriceUpdateRepository();
  repo.findByUid = async () => row;
  await repo.confirmEvent({ tokenUid: 't', chainUid: 'c', chainId: 1, transactionHash: txHash,
    submissionMode: 'DIRECT', oldPriceRaw: '1', newPriceRaw: '2' }, executor);
  assert.match(sql[0], /tokenMaster.*FOR UPDATE/);
  assert.match(sql[1], /transactionHash=.*FOR UPDATE/);
  assert.ok(!sql.some(q => q.startsWith('INSERT')));
  assert.ok(sql.some(q => q.includes("'INDEXED' AND ?='DIRECT'")));
  assert.ok(sql.some(q => q.includes('NOT EXISTS') && q.includes('p.blockNumber>?')));
});

test('prepare reuses an active intent and refuses a different price without inserting', async () => {
  const queries = [];
  const active = { priceUpdateUid: 'p', newPriceRaw: '350000000' };
  const executor = { execute: async sql => { queries.push(sql); return [sql.includes('SELECT *') ? [active] : []]; } };
  const repo = new TokenPriceUpdateRepository();
  assert.equal((await repo.prepareDirect({ tokenUid: 't', chainUid: 'c', newPriceRaw: '350000000' }, executor)).priceUpdateUid, 'p');
  await assert.rejects(repo.prepareDirect({ tokenUid: 't', chainUid: 'c', newPriceRaw: '1' }, executor), e => e.statusCode === 409);
  assert.ok(!queries.some(sql => sql.startsWith('INSERT')));
});

test('pending INSERT persists the old price and cancelling does not clear it', async () => {
  const queries = [];
  const executor = { execute: async (sql, params) => {
    queries.push({ sql, params });
    return [sql.startsWith('UPDATE') ? { affectedRows: 1 } : []];
  } };
  const repo = new TokenPriceUpdateRepository();
  repo.findByUid = async () => ({ priceUpdateUid: 'p', oldPriceRaw: '10000000', oldPriceFormatted: '10.0' });
  await repo.prepareDirect({ tokenUid: 't', chainUid: 'c', newPriceRaw: '350000000',
    oldPriceRaw: '10000000', oldPriceFormatted: '10.0' }, executor);
  const insert = queries.find(q => q.sql.startsWith('INSERT'));
  assert.match(insert.sql, /oldPriceRaw,oldPriceFormatted/);
  assert.deepEqual(insert.params.slice(-2), ['10000000', '10.0']);
  const cancelled = await repo.cancelDirect({ tokenUid: 't', priceUpdateUid: 'p' }, executor);
  assert.equal(cancelled.oldPriceFormatted, '10.0');
  assert.doesNotMatch(queries.find(q => q.sql.startsWith('UPDATE')).sql, /oldPrice/);
  assert.match(queries.find(q => q.sql.startsWith('UPDATE')).sql, /status='CANCELLED'/);
});

test('indexer missing-hash recovery uses nonce, sender, controller, token, price and preparation block', async () => {
  const queries = [];
  const row = { priceUpdateUid: 'p', tokenUid: 't', chainUid: 'c' };
  const executor = { execute: async sql => { queries.push(sql);
    return [sql.includes('directTransactionNonce=?') ? [row] : []]; } };
  const repo = new TokenPriceUpdateRepository(); repo.findByUid = async () => row;
  const result = await repo.confirmEvent({ tokenUid: 't', chainUid: 'c', chainId: 1, transactionHash: txHash,
    submissionMode: 'DIRECT', directTransactionNonce: 7, oldPriceRaw: '1', newPriceRaw: '2' }, executor);
  assert.equal(result.priceUpdateUid, 'p');
  const match = queries.find(sql => sql.includes('directTransactionNonce=?'));
  assert.match(match, /status='CANCELLED' AND errorCode='USER_CANCELLED'/);
  for (const text of ['tokenUid=?', 'chainUid=?', 'issuerWalletAddress', 'controllerAddress', 'newPriceRaw=?', 'preparedAtBlock<=?']) {
    assert.ok(match.includes(text));
  }
  assert.ok(!queries.some(sql => sql.startsWith('INSERT')));
});
