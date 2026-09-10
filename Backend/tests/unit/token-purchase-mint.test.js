const test = require('node:test');
const assert = require('node:assert/strict');
const { TokenPurchaseMintService } = require('../../src/services/blockchain/token-purchase-mint.service');

const TX = `0x${'a'.repeat(64)}`;
const row = {
  purchaseUid: 'purchase-1', status: 'PAYMENT_CONFIRMED', mintStatus: 'QUEUED', mintTxHash: null,
  chainId: 11155111, tokenAddress: `0x${'1'.repeat(40)}`, usdtContractAddress: `0x${'2'.repeat(40)}`,
  investorWalletAddress: `0x${'3'.repeat(40)}`, treasuryWalletAddress: `0x${'4'.repeat(40)}`,
  platformWalletAddress: `0x${'5'.repeat(40)}`, usdtAmountRaw: '1000000', tokenAmountRaw: '100',
};

test('mint submitter globally leases and persists exactly one platform mint hash', async () => {
  const state = { row: { ...row }, broadcasts: 0, transactions: [] };
  const repository = {
    findByUid: async () => state.row,
    markMintPreparing: async () => {
      if (state.row.mintStatus !== 'QUEUED') return false;
      state.row.mintStatus = 'PROCESSING'; state.row.mintPreparedAtBlock = 100; return true;
    },
    markMintSubmitted: async (uid, submitted) => {
      state.row = { ...state.row, status: 'MINT_SUBMITTED', mintStatus: 'SUBMITTED', mintTxHash: submitted.txHash };
    },
    recordTransaction: async (uid, stage, txHash, status) => state.transactions.push({ stage, txHash, status }),
    recordError: async () => {},
  };
  const checkpointRepository = {
    ensureCheckpoint: async () => {}, acquireLease: async () => true, releaseLease: async () => {},
  };
  const blockchain = {
    chainHead: async () => ({ chainId: 11155111, latestBlock: 100 }),
    submitMint: async () => { state.broadcasts += 1; return { txHash: TX, preparedAtBlock: 100 }; },
  };
  const service = new TokenPurchaseMintService({
    repository, checkpointRepository, blockchain, config: { transactionTimeoutMs: 1000 },
    transactionRunner: (work) => work({}),
  });

  const first = await service.submit(state.row);
  const second = await service.submit(state.row);
  assert.equal(first.submitted, true);
  assert.equal(second.idempotent, true);
  assert.equal(state.broadcasts, 1);
  assert.deepEqual(state.transactions, [{ stage: 'MINT', txHash: TX, status: 'SUBMITTED' }]);
});

test('interactive mint waits for verification metadata and completes in the same call', async () => {
  const verified = {
    txHash: TX, blockNumber: 105, blockHash: `0x${'b'.repeat(64)}`,
    transactionIndex: 3, logIndex: 7, gasUsed: '92000', effectiveGasPrice: '12',
  };
  const state = { row: { ...row }, transactions: [] };
  const repository = {
    findByUid: async () => state.row,
    markMintPreparing: async () => { state.row.mintStatus = 'PROCESSING'; state.row.mintPreparedAtBlock = 100; return true; },
    markMintSubmitted: async (uid, submitted) => {
      state.row = { ...state.row, status: 'MINT_SUBMITTED', mintStatus: 'SUBMITTED', mintTxHash: submitted.txHash };
    },
    completeMint: async (uid, data) => {
      state.row = { ...state.row, status: 'COMPLETED', mintStatus: 'CONFIRMED', mintBlockNumber: data.blockNumber };
      return true;
    },
    recordTransaction: async (uid, stage, txHash, status, data) => state.transactions.push({ stage, txHash, status, data }),
    recordError: async () => {}, schedulePending: async () => {},
  };
  const service = new TokenPurchaseMintService({
    repository,
    checkpointRepository: { ensureCheckpoint: async () => {}, acquireLease: async () => true, releaseLease: async () => {} },
    blockchain: {
      chainHead: async () => ({ chainId: 11155111, latestBlock: 100 }),
      submitMint: async () => ({ txHash: TX, preparedAtBlock: 100 }),
      waitForMint: async () => verified,
    },
    config: { purchaseConfirmations: 1, transactionTimeoutMs: 1000 },
    transactionRunner: (work) => work({}),
  });
  const result = await service.submit(state.row, { confirmImmediately: true });
  assert.equal(result.confirmed, true);
  assert.equal(result.row.status, 'COMPLETED');
  assert.equal(result.row.mintBlockNumber, 105);
  assert.deepEqual(state.transactions.map((item) => item.status), ['SUBMITTED', 'CONFIRMED']);
});

test('mint submitter does not broadcast when another process owns the global mint lease', async () => {
  let broadcasts = 0;
  const service = new TokenPurchaseMintService({
    repository: { findByUid: async () => ({ ...row }) },
    checkpointRepository: { ensureCheckpoint: async () => {}, acquireLease: async () => false },
    blockchain: {
      chainHead: async () => ({ chainId: 11155111, latestBlock: 100 }),
      submitMint: async () => { broadcasts += 1; },
    },
    config: {},
  });
  const result = await service.submit(row);
  assert.equal(result.pending, true);
  assert.equal(result.code, 'MINT_ALREADY_PROCESSING');
  assert.equal(broadcasts, 0);
});
