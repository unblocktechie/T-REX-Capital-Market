const test = require('node:test');
const assert = require('node:assert/strict');
const { TokenTransferService } = require('../../src/services/token-transfer.service');
const { TokenTransferBlockchainError } = require('../../src/services/blockchain/token-transfer-blockchain.service');

const address = (char) => `0x${char.repeat(40)}`;
const investor = { userUid: 'sender-user', roleName: 'Investor' };
const TX = `0x${'a'.repeat(64)}`;

const context = {
  senderInterestUid: 'sender-interest', senderInterestStatus: 'registered', organizationUid: 'org-1',
  senderInvestorUid: 'sender-investor', senderUserUid: investor.userUid,
  senderWalletAddress: address('1'), senderIdentityAddress: address('2'),
  senderProfileStatus: 'submitted', senderProfileActive: true,
  recipientInterestUid: 'recipient-interest', recipientInterestStatus: 'registered',
  recipientInvestorUid: 'recipient-investor', recipientUserUid: 'recipient-user',
  recipientWalletAddress: address('3'), recipientIdentityAddress: address('4'),
  recipientProfileStatus: 'submitted', recipientProfileActive: true,
  tokenUid: 'token-1', tokenAddress: address('5'), identityRegistryAddress: address('6'),
  tokenDecimals: 2, tokenPrice: '7.50', maxBalancePerInvestor: '1000',
  tokenStatus: 'deployed', tokenActive: true,
};

const make = (overrides = {}) => {
  const state = { row: overrides.row || null, history: [] };
  const repository = {
    findByIdempotency: async () => overrides.idempotent || null,
    findContext: async () => overrides.context || context,
    findActiveBySenderToken: async () => overrides.active || null,
    sumPendingIncomingRaw: async () => '0',
    create: async (data) => {
      state.row = {
        transferUid: 'transfer-1', status: 'PENDING_TRANSFER', syncStatus: 'IDLE', syncAttempts: 0,
        senderBalanceAfterRaw: null, recipientBalanceAfterRaw: null, senderFrozenAfterRaw: null,
        txHash: null, ...data,
      };
      return state.row;
    },
    findSenderOwnedByUid: async () => state.row,
    findAccessibleByUid: async () => state.row,
    findByUid: async () => state.row,
    findByTxHash: async () => null,
    assignHash: async (_uid, txHash) => { state.row.txHash = txHash; return state.row; },
    confirm: async (_uid, data) => {
      state.row = {
        ...state.row, status: 'COMPLETED', txHash: data.txHash,
        blockNumber: data.blockNumber, blockHash: data.blockHash,
        transactionIndex: data.transactionIndex, logIndex: data.logIndex,
        gasUsed: data.gasUsed, effectiveGasPrice: data.effectiveGasPrice,
        senderBalanceAfterRaw: data.senderBalanceAfterRaw,
        recipientBalanceAfterRaw: data.recipientBalanceAfterRaw,
        senderFrozenAfterRaw: data.senderFrozenAfterRaw,
      };
      return true;
    },
    recordTransaction: async (_uid, txHash, status) => state.history.push({ txHash, status }),
    listTransactions: async () => state.history,
    schedulePending: async () => { state.row.syncStatus = 'QUEUED'; state.row.errorCode = null; return state.row; },
    recordError: async (_uid, code, message) => { state.row.errorCode = code; state.row.errorMessage = message; state.row.nextSyncAt = null; },
    queue: async () => { state.row.syncStatus = 'QUEUED'; return state.row; },
    listAccessibleByToken: async () => ({ rows: state.row ? [state.row] : [], total: state.row ? 1 : 0 }),
  };
  const blockchain = overrides.blockchain || {
    prepare: async () => ({
      chainId: 11155111, tokenDecimals: 2, senderBalanceBeforeRaw: '1000',
      recipientBalanceBeforeRaw: '100', senderFrozenBeforeRaw: '50', preparedAtBlock: 100,
    }),
    verify: async (txHash) => ({
      txHash, blockNumber: 110, blockHash: `0x${'b'.repeat(64)}`, transactionIndex: 1,
      logIndex: 2, gasUsed: '70000', effectiveGasPrice: '10',
      senderBalanceAfterRaw: '750', recipientBalanceAfterRaw: '350', senderFrozenAfterRaw: '50',
    }),
  };
  return {
    state,
    service: new TokenTransferService({
      repository, blockchain,
      config: { transferConfirmations: 1, transferIntentTtlMinutes: 15 },
      transactionRunner: (work) => work({}),
    }),
  };
};

test('creates an authoritative pending token transfer', async () => {
  const setup = make();
  const result = await setup.service.create(investor, 'token-1', {
    recipientWalletAddress: context.recipientWalletAddress,
    tokenAmount: '2.50',
    idempotencyKey: 'transfer-123',
  });
  assert.equal(result.transfer.status, 'PENDING_TRANSFER');
  assert.equal(result.transfer.tokenAmount, '2.5');
  assert.equal(result.transfer.tokenAmountRaw, '250');
  assert.equal(result.transfer.tokenPrice, '7.50');
  assert.equal(setup.state.row.tokenPrice, '7.50');
  assert.deepEqual(result.transfer.transactionRequest.args, [context.recipientWalletAddress, '250']);
  assert.ok(setup.state.row.expiresAt instanceof Date);
});

test('requires the recipient to be registered for the same token', async () => {
  const setup = make({ context: { ...context, recipientInterestStatus: 'claimSubmitted' } });
  await assert.rejects(
    setup.service.create(investor, 'token-1', {
      recipientWalletAddress: context.recipientWalletAddress,
      tokenAmount: '1',
      idempotencyKey: 'transfer-123',
    }),
    (error) => error.code === 'RECIPIENT_NOT_REGISTERED',
  );
});

test('confirms the exact on-chain transfer and stores receipt metadata', async () => {
  const setup = make();
  await setup.service.create(investor, 'token-1', {
    recipientWalletAddress: context.recipientWalletAddress,
    tokenAmount: '2.5',
    idempotencyKey: 'transfer-123',
  });
  const result = await setup.service.confirm(investor, 'transfer-1', TX);
  assert.equal(result.transfer.status, 'COMPLETED');
  assert.equal(result.transfer.transaction.txHash, TX);
  assert.equal(result.transfer.transaction.logIndex, 2);
  assert.deepEqual(setup.state.history.map((item) => item.status), ['RECEIVED', 'CONFIRMED']);
});

test('queues a not-yet-mined transfer instead of confirming it', async () => {
  const setup = make({
    blockchain: {
      prepare: async () => ({
        chainId: 11155111, tokenDecimals: 2, senderBalanceBeforeRaw: '1000',
        recipientBalanceBeforeRaw: '100', senderFrozenBeforeRaw: '0', preparedAtBlock: 100,
      }),
      verify: async () => { throw new TokenTransferBlockchainError('TRANSACTION_NOT_FOUND', 'Not mined.', { pending: true }); },
    },
  });
  await setup.service.create(investor, 'token-1', {
    recipientWalletAddress: context.recipientWalletAddress,
    tokenAmount: '1',
    idempotencyKey: 'transfer-123',
  });
  const result = await setup.service.confirm(investor, 'transfer-1', TX);
  assert.equal(result.pendingVerification, true);
  assert.equal(result.transfer.status, 'PENDING_TRANSFER');
  assert.equal(result.transfer.synchronization.status, 'QUEUED');
});
