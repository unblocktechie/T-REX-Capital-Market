const test = require('node:test');
const assert = require('node:assert/strict');
const { TokenRedemptionExecutionService } = require('../../src/services/blockchain/token-redemption-execution.service');

test('platform execution lease persists one lock hash and repeated submit is idempotent', async () => {
  const txHash = `0x${'a'.repeat(64)}`;
  const state = {
    row: {
      redemptionUid: 'redemption-1', status: 'ISSUER_APPROVED', lockStatus: 'QUEUED', lockTxHash: null,
      chainId: 11155111, usdtContractAddress: `0x${'1'.repeat(40)}`, tokenAddress: `0x${'2'.repeat(40)}`,
      investorWalletAddress: `0x${'3'.repeat(40)}`, issuerPaymentWalletAddress: `0x${'4'.repeat(40)}`,
      platformWalletAddress: `0x${'5'.repeat(40)}`, tokenAmountRaw: '100', usdtAmountRaw: '1000000',
      frozenBeforeRaw: '0', unlockAmountRaw: null,
    },
    broadcasts: 0,
  };
  const repository = {
    findByUid: async () => state.row,
    transition: async (uid, allowed, values) => {
      const statuses = Array.isArray(allowed) ? allowed : [allowed];
      if (!statuses.includes(state.row.status)) return false;
      state.row = { ...state.row, ...values }; return true;
    },
    recordTransaction: async () => {}, addHistory: async () => {}, recordError: async () => {},
  };
  const service = new TokenRedemptionExecutionService({
    repository,
    checkpointRepository: { ensureCheckpoint: async () => {}, acquireLease: async () => true, releaseLease: async () => {} },
    blockchain: {
      chainHead: async () => ({ chainId: 11155111, latestBlock: 100 }),
      submitAction: async () => { state.broadcasts += 1; return { txHash, preparedAtBlock: 100 }; },
    },
    config: { transactionTimeoutMs: 1000 }, transactionRunner: (work) => work({}),
  });
  const first = await service.submit('LOCK', state.row);
  const second = await service.submit('LOCK', state.row);
  assert.equal(first.submitted, true);
  assert.equal(second.idempotent, true);
  assert.equal(state.broadcasts, 1);
  assert.equal(state.row.status, 'TOKEN_LOCK_SUBMITTED');
  assert.equal(state.row.lockTxHash, txHash);
});
