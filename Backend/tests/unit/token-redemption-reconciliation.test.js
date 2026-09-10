const test = require('node:test');
const assert = require('node:assert/strict');
const { TokenRedemptionReconciliationService } = require('../../src/services/blockchain/token-redemption-reconciliation.service');

test('confirmed burn schedules cleanup of only the redemption-created lock before completion', async () => {
  const tx = (char) => `0x${char.repeat(64)}`;
  const state = {
    row: {
      redemptionUid: 'redemption-1', status: 'BURN_SUBMITTED', paymentStatus: 'CONFIRMED',
      burnStatus: 'SUBMITTED', unlockStatus: 'NOT_STARTED', tokenAmountRaw: '20', frozenBeforeRaw: '5',
    },
    history: [], transactions: [],
  };
  const repository = {
    findForUpdate: async () => state.row,
    transition: async (uid, from, values) => {
      const statuses = Array.isArray(from) ? from : [from];
      if (!statuses.includes(state.row.status)) return false;
      state.row = { ...state.row, ...values }; return true;
    },
    recordTransaction: async (uid, stage, hash, status) => state.transactions.push({ stage, hash, status }),
    addHistory: async (entry) => state.history.push(entry),
  };
  const service = new TokenRedemptionReconciliationService({
    settingRepository: {}, repository, checkpointRepository: {}, blockchain: {}, executionService: {},
    redemptionService: { expected: () => ({}) }, transactionRunner: (work) => work({}),
  });
  await service.finalizeAction(state.row, 'BURN', {
    txHash: tx('a'), blockNumber: 100, blockHash: tx('b'), transactionIndex: 1,
    logIndex: 2, gasUsed: '90000', effectiveGasPrice: '10', frozenAfterRaw: '25',
  });
  assert.equal(state.row.status, 'BURN_CONFIRMED');
  assert.equal(state.row.unlockAmountRaw, '20');
  assert.equal(state.row.unlockStatus, 'QUEUED');

  state.row = { ...state.row, status: 'UNLOCK_SUBMITTED', unlockStatus: 'SUBMITTED' };
  await service.finalizeAction(state.row, 'UNLOCK', {
    txHash: tx('c'), blockNumber: 110, blockHash: tx('d'), transactionIndex: 1,
    logIndex: 3, gasUsed: '60000', effectiveGasPrice: '11', frozenAfterRaw: '5',
  });
  assert.equal(state.row.status, 'COMPLETED');
  assert.equal(state.row.unlockStatus, 'CONFIRMED');
});
