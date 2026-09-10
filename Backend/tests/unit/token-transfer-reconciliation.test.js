const test = require('node:test');
const assert = require('node:assert/strict');
const {
  TokenTransferReconciliationService,
} = require('../../src/services/blockchain/token-transfer-reconciliation.service');

const TX = `0x${'a'.repeat(64)}`;
const row = {
  transferUid: 'transfer-1', status: 'PENDING_TRANSFER', chainId: 11155111,
  tokenAddress: '0x1111111111111111111111111111111111111111',
  identityRegistryAddress: '0x2222222222222222222222222222222222222222',
  senderWalletAddress: '0x3333333333333333333333333333333333333333',
  recipientWalletAddress: '0x4444444444444444444444444444444444444444',
  senderIdentityAddress: '0x5555555555555555555555555555555555555555',
  recipientIdentityAddress: '0x6666666666666666666666666666666666666666',
  tokenAmountRaw: '250', preparedAtBlock: 100, txHash: null,
};

test('recovers a missing transaction hash with the targeted fallback and confirms the same row', async () => {
  const state = { row: { ...row }, recorded: [] };
  const repository = {
    markProcessing: async () => true,
    findByUid: async () => state.row,
    findByTxHash: async () => null,
    assignHash: async (_uid, txHash) => { state.row.txHash = txHash; return state.row; },
    recordTransaction: async (_uid, txHash, status) => state.recorded.push({ txHash, status }),
    confirm: async (_uid, verified) => { state.row = { ...state.row, status: 'COMPLETED', ...verified }; return true; },
    schedulePending: async () => state.row,
    recordError: async () => {},
  };
  const service = new TokenTransferReconciliationService({
    settingRepository: { findByKey: async () => null },
    repository,
    checkpointRepository: {},
    blockchain: {
      findEvent: async () => TX,
      verify: async () => ({
        txHash: TX, blockNumber: 110, blockHash: `0x${'b'.repeat(64)}`,
        transactionIndex: 1, logIndex: 2, gasUsed: '1', effectiveGasPrice: '1',
        senderBalanceAfterRaw: '750', recipientBalanceAfterRaw: '350', senderFrozenAfterRaw: '0',
      }),
    },
    transactionRunner: (work) => work({}),
    dependencies: { leaseOwner: 'test' },
  });
  const stats = { hashesRecovered: 0, transfersConfirmed: 0, pendingConfirmations: 0, errors: 0 };
  await service.reconcile(state.row, 120, 12, stats);
  assert.equal(state.row.status, 'COMPLETED');
  assert.equal(state.row.txHash, TX);
  assert.equal(stats.hashesRecovered, 1);
  assert.deepEqual(state.recorded.map((item) => item.status), ['PENDING', 'CONFIRMED']);
});

test('global indexer stores events before advancing its checkpoint', async () => {
  const order = [];
  const checkpoint = { lastIndexedBlock: 0, startBlock: 100 };
  const repository = {
    earliestPreparedBlock: async () => 100,
    listIndexedTokenAddresses: async () => [row.tokenAddress],
    storeEvents: async () => order.push('store'),
    listEvents: async () => [],
    listRecoveryCandidates: async () => [],
    expireAbandoned: async () => 0,
  };
  const checkpointRepository = {
    ensureCheckpoint: async () => checkpoint,
    acquireLease: async () => true,
    findCheckpoint: async () => checkpoint,
    advanceCheckpoint: async () => order.push('advance'),
    releaseLease: async () => {},
  };
  const service = new TokenTransferReconciliationService({
    settingRepository: { findByKey: async () => null },
    repository,
    checkpointRepository,
    blockchain: {
      chainHead: async () => ({ chainId: 11155111, latestBlock: 112 }),
      scanEvents: async () => [{ txHash: TX }],
      blockHash: async () => `0x${'c'.repeat(64)}`,
    },
    config: { transferWorkerEnabled: true, transferIndexerConfirmations: 12 },
    dependencies: { leaseOwner: 'test' },
  });
  const result = await service.run();
  assert.deepEqual(order, ['store', 'advance']);
  assert.equal(result.eventsFound, 1);
  assert.equal(result.blocksScanned, 1);
});
