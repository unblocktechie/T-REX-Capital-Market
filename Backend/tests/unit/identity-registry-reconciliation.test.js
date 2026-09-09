const test = require('node:test');
const assert = require('node:assert/strict');
const { IdentityRegistryReconciliationService } = require('../../src/services/blockchain/identity-registry-reconciliation.service');
const { RegistryVerificationError } = require('../../src/services/blockchain/identity-registry-verifier.service');

const TX = `0x${'ab'.repeat(32)}`;
const registration = {
  registryRegistrationUid: 'reg-1', status: 'PENDING', txHash: null, chainId: 11155111,
  identityRegistryAddress: '0x1111111111111111111111111111111111111111',
  issuerWalletAddress: '0x2222222222222222222222222222222222222222',
  investorWalletAddress: '0x3333333333333333333333333333333333333333',
  investorIdentityAddress: '0x4444444444444444444444444444444444444444', countryCode: 356,
};
const event = {
  registryEventUid: 'event-1', txHash: TX, blockNumber: 100, blockHash: `0x${'cd'.repeat(32)}`,
  transactionIndex: 1, logIndex: 2,
};

const makeService = (verificationError = null) => {
  const state = { row: { ...registration }, marks: [], confirms: 0, errors: [] };
  const repository = {
    findPendingForEvent: async () => state.row,
    findByTxHash: async () => null,
    assignTransaction: async (uid, txHash) => { state.row.txHash = txHash; return state.row; },
    findByUid: async () => state.row,
    confirm: async (uid, data) => {
      state.confirms += 1;
      Object.assign(state.row, data, { status: 'CONFIRMED' });
      return true;
    },
    markEvent: async (...args) => { state.marks.push(args); },
    recordError: async (...args) => { state.errors.push(args); },
  };
  const verifier = {
    verifyRegistration: async () => {
      if (verificationError) throw verificationError;
      return { ...event };
    },
  };
  const service = new IdentityRegistryReconciliationService({
    settingRepository: {}, repository, checkpointRepository: {}, verifier,
    finalizationService: {
      finalizeConfirmedOperation: async (uid, data) => {
        state.confirms += 1;
        Object.assign(state.row, data, { status: 'CONFIRMED' });
        return { operation: state.row, interest: { status: 'registered' }, transitioned: true };
      },
    },
    transactionRunner: (work) => work({}),
    config: { chainId: 11155111 },
  });
  return { service, state };
};

test('fallback confirms a matching raw event only after the full verifier succeeds', async () => {
  const { service, state } = makeService();
  const result = await service.reconcileEvent(event);
  assert.equal(result, 'MATCHED');
  assert.equal(state.row.status, 'CONFIRMED');
  assert.equal(state.row.txHash, TX);
  assert.equal(state.confirms, 1);
  assert.equal(state.marks.at(-1)[1], 'MATCHED');
});

test('fallback never confirms an event whose transaction parameters do not verify', async () => {
  const error = new RegistryVerificationError('REGISTRY_PARAMETERS_MISMATCH', 'wrong country');
  const { service, state } = makeService(error);
  await assert.rejects(service.reconcileEvent(event), (caught) => caught.code === 'REGISTRY_PARAMETERS_MISMATCH');
  assert.equal(state.row.status, 'PENDING');
  assert.equal(state.confirms, 0);
  assert.equal(state.marks.at(-1)[1], 'FAILED');
  assert.equal(state.errors.at(-1)[1], 'REGISTRY_PARAMETERS_MISMATCH');
});
