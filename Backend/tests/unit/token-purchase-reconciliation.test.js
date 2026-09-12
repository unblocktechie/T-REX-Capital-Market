const test = require('node:test');
const assert = require('node:assert/strict');
const { TokenPurchaseReconciliationService } = require('../../src/services/blockchain/token-purchase-reconciliation.service');
const { PurchaseBlockchainError } = require('../../src/services/blockchain/token-purchase-blockchain.service');

const row = {
  purchaseUid: 'p1', status: 'PAYMENT_CONFIRMED', paymentTxHash: `0x${'9'.repeat(64)}`, mintTxHash: null, mintPreparedAtBlock: null,
  chainId: 11155111, tokenAddress: `0x${'1'.repeat(40)}`, usdtContractAddress: `0x${'2'.repeat(40)}`,
  investorWalletAddress: `0x${'3'.repeat(40)}`, treasuryWalletAddress: `0x${'4'.repeat(40)}`,
  platformWalletAddress: `0x${'5'.repeat(40)}`, usdtAmountRaw: '1000000', tokenAmountRaw: '1000000000000000000',
};

test('worker records mint hash immediately and later confirms the exact mint transaction', async () => {
  const state = { row: { ...row }, transactionStatuses: [] };
  const repository = {
    markProcessing: async () => true, findByUid: async () => state.row,
    markMintPreparing: async (uid, block) => { state.row.mintPreparedAtBlock = block; },
    markMintSubmitted: async (uid, data) => { state.row = { ...state.row, status: 'MINT_SUBMITTED', mintTxHash: data.txHash, mintPreparedAtBlock: data.preparedAtBlock }; },
    recordTransaction: async (uid, stage, hash, status) => state.transactionStatuses.push(status),
    completeMint: async () => { state.row.status = 'COMPLETED'; return true; }, recordError: async () => {},
  };
  const blockchain = {
    verifyPayment: async () => ({ txHash: `0x${'9'.repeat(64)}` }),
    chainHead: async () => ({ latestBlock: 100 }),
    submitMint: async () => ({ txHash: `0x${'a'.repeat(64)}`, preparedAtBlock: 100 }),
    verifyMint: async (hash) => ({ txHash: hash, blockNumber: 110, blockHash: `0x${'b'.repeat(64)}`, transactionIndex: 0, logIndex: 0 }),
  };
  const mintService = {
    submit: async () => {
      const submitted = await blockchain.submitMint();
      await repository.markMintSubmitted('p1', submitted);
      await repository.recordTransaction('p1', 'MINT', submitted.txHash, 'SUBMITTED');
      return { row: state.row, submitted: true, pending: false };
    },
  };
  const service = new TokenPurchaseReconciliationService({ repository, blockchain, mintService, settingRepository: {}, checkpointRepository: {}, config: {}, transactionRunner: (work) => work({}) });
  const stats = { mintsSubmitted: 0, mintsConfirmed: 0, mintsRecovered: 0, paymentsConfirmed: 0, errors: 0 };
  await service.reconcilePurchase(state.row, 100, stats);
  assert.equal(state.row.status, 'MINT_SUBMITTED');
  assert.equal(stats.mintsSubmitted, 1);
  await service.reconcilePurchase(state.row, 120, stats);
  assert.equal(state.row.status, 'COMPLETED');
  assert.deepEqual(state.transactionStatuses, ['SUBMITTED', 'CONFIRMED']);
});

test('worker recovers a mint event when broadcast succeeded but hash persistence was missed', async () => {
  const state = { row: { ...row, mintPreparedAtBlock: 90 }, completedHash: null };
  const repository = {
    markProcessing: async () => true, findByUid: async () => state.row,
    completeMint: async (uid, data) => { state.row.status = 'COMPLETED'; state.completedHash = data.txHash; return true; },
    recordTransaction: async () => {}, recordError: async () => {},
  };
  const recovered = `0x${'c'.repeat(64)}`;
  const blockchain = {
    verifyPayment: async () => ({ txHash: `0x${'9'.repeat(64)}` }),
    findMintEvent: async () => recovered,
    verifyMint: async (hash) => ({ txHash: hash, blockNumber: 95, blockHash: `0x${'d'.repeat(64)}`, transactionIndex: 0, logIndex: 1 }),
  };
  const service = new TokenPurchaseReconciliationService({ repository, blockchain, mintService: { submit: async () => ({ submitted: false }) }, settingRepository: {}, checkpointRepository: {}, config: {}, transactionRunner: (work) => work({}) });
  const stats = { mintsSubmitted: 0, mintsConfirmed: 0, mintsRecovered: 0, paymentsConfirmed: 0, errors: 0 };
  await service.reconcilePurchase(state.row, 100, stats);
  assert.equal(state.row.status, 'COMPLETED');
  assert.equal(state.completedHash, recovered);
  assert.equal(stats.mintsRecovered, 1);
});

test('worker treats insufficient mint confirmations as queued progress, not a failure', async () => {
  const mintHash = `0x${'a'.repeat(64)}`;
  const state = {
    row: { ...row, status: 'MINT_SUBMITTED', mintStatus: 'SUBMITTED', mintTxHash: mintHash },
    pendingCalls: 0,
    errorCalls: 0,
    transaction: null,
  };
  const repository = {
    markProcessing: async () => true,
    findByUid: async () => state.row,
    recordTransaction: async (uid, stage, txHash, status, data = {}) => { state.transaction = { stage, txHash, status, data }; },
    schedulePending: async () => {
      state.pendingCalls += 1;
      state.row = { ...state.row, syncStatus: 'QUEUED', errorCode: null, errorMessage: null };
    },
    recordError: async () => { state.errorCalls += 1; },
  };
  const blockchain = {
    verifyMint: async () => {
      throw new PurchaseBlockchainError('INSUFFICIENT_CONFIRMATIONS', 'Transaction has 1 confirmation(s); 2 required.', { pending: true });
    },
  };
  const service = new TokenPurchaseReconciliationService({
    repository, blockchain, mintService: { submit: async () => ({ submitted: false }) },
    settingRepository: {}, checkpointRepository: {}, config: {}, transactionRunner: (work) => work({}),
  });
  const stats = { mintsSubmitted: 0, mintsConfirmed: 0, mintsRecovered: 0, paymentsConfirmed: 0, errors: 0 };
  await service.reconcilePurchase(state.row, 100, stats);
  assert.equal(state.pendingCalls, 1);
  assert.equal(state.errorCalls, 0);
  assert.equal(state.transaction.status, 'PENDING');
  assert.deepEqual(state.transaction.data, {});
  assert.equal(stats.pendingConfirmations, 1);
  assert.equal(stats.errors, 0);
});

test('runner expires no-hash intents only after the USDT indexer reaches the safe head', async () => {
  let expiredCalls = 0;
  const repository = {
    earliestPreparedBlock: async () => 1,
    listPaymentEvents: async () => [],
    expireAbandonedPaymentIntents: async (limit, grace) => {
      expiredCalls += 1;
      assert.equal(limit, 50);
      assert.equal(grace, 180);
      return 2;
    },
    listRecoveryCandidates: async () => [],
  };
  const checkpointRepository = {
    ensureCheckpoint: async () => {}, acquireLease: async () => true,
    findCheckpoint: async () => ({ lastIndexedBlock: 99, startBlock: 1 }),
    releaseLease: async () => {},
  };
  const service = new TokenPurchaseReconciliationService({
    repository, checkpointRepository,
    blockchain: { chainHead: async () => ({ chainId: 11155111, latestBlock: 100 }) },
    mintService: {}, settingRepository: { findByKey: async () => null }, config: { purchaseWorkerEnabled: true },
  });
  const stats = await service.run();
  assert.equal(expiredCalls, 1);
  assert.equal(stats.purchasesExpired, 2);
  assert.equal(stats.expirationDeferred, false);
});

test('runner defers expiration while the USDT indexer is catching up after downtime', async () => {
  let expiredCalls = 0;
  const settings = { PurchaseIndexerBlockOffset: '10', PurchaseIndexerMaxChunksPerRun: '1' };
  const repository = {
    earliestPreparedBlock: async () => 1,
    storePaymentEvents: async () => {}, listPaymentEvents: async () => [],
    expireAbandonedPaymentIntents: async () => { expiredCalls += 1; return 1; },
    listRecoveryCandidates: async () => [],
  };
  const checkpointRepository = {
    ensureCheckpoint: async () => {}, acquireLease: async () => true,
    findCheckpoint: async () => ({ lastIndexedBlock: 1, startBlock: 1 }),
    advanceCheckpoint: async () => true, releaseLease: async () => {},
  };
  const service = new TokenPurchaseReconciliationService({
    repository, checkpointRepository,
    blockchain: {
      chainHead: async () => ({ chainId: 11155111, latestBlock: 100 }),
      scanPaymentEvents: async () => [], blockHash: async () => `0x${'1'.repeat(64)}`,
    },
    mintService: {},
    settingRepository: { findByKey: async (key) => (settings[key] ? { settingValue: settings[key] } : null) },
    config: { purchaseWorkerEnabled: true },
  });
  const stats = await service.run();
  assert.equal(expiredCalls, 0);
  assert.equal(stats.expirationDeferred, true);
});
