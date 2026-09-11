const test = require('node:test');
const assert = require('node:assert/strict');
const { IdentityRegistryRegistrationService } = require('../../src/services/identity-registry-registration.service');
const { RegistryVerificationError } = require('../../src/services/blockchain/identity-registry-verifier.service');

const REGISTRY = '0x1111111111111111111111111111111111111111';
const ISSUER = '0x2222222222222222222222222222222222222222';
const INVESTOR = '0x3333333333333333333333333333333333333333';
const IDENTITY = '0x4444444444444444444444444444444444444444';
const PLATFORM_CONTROLLER = '0x9BEFDF75Dc94bbB36532c5d7A74daab28714f579';
const TX = `0x${'ab'.repeat(32)}`;
const issuer = { userUid: 'issuer-user', roleName: 'Issuer' };

const makeService = ({
  verifyError = null,
  interestStatus = 'claimSubmitted',
  registryState = { contains: false, matches: false, issuerIsAgent: true },
  registrationEvent = null,
} = {}) => {
  const state = {
    rows: [], verificationCalls: 0, interestStatus, history: [], pendingCreates: 0, confirmedCreates: 0,
  };
  const context = {
    interestUid: 'interest-1', interestStatus, tokenUid: 'token-1', organizationUid: 'org-1', investorUid: 'investor-1',
    tokenStatus: 'deployed', identityRegistryAddress: REGISTRY,
    tokenAgentWalletAddress: PLATFORM_CONTROLLER, identityManagerWalletAddress: ISSUER,
    countryRestrictionMode: 'allowlist', countryListed: true,
    issuerUserUid: issuer.userUid, issuerWalletAddress: ISSUER, organizationStatus: 'approved', organizationActive: true,
    investorWalletAddress: INVESTOR, investorIdentityAddress: IDENTITY, investorStatus: 'submitted', investorActive: true,
    countryNumericCode: '356', countryActive: true, countryDeleted: false, deployedAtBlock: 50,
  };
  const repository = {
    findContextByInterest: async () => context,
    getClaimCompletion: async () => ({ required: 2, confirmed: 2, missing: [] }),
    findByInterest: async () => state.rows[0] || null,
    findByUid: async (uid) => state.rows.find((row) => row.registryRegistrationUid === uid) || null,
    findByUidForUpdate: async (uid) => state.rows.find((row) => row.registryRegistrationUid === uid) || null,
    findByTxHash: async (hash) => state.rows.find((row) => row.txHash === hash) || null,
    findCanonicalEvent: async () => registrationEvent,
    createPending: async (data) => {
      state.pendingCreates += 1;
      const row = {
        registryRegistrationUid: 'registration-1', status: 'PENDING', txHash: null, errorCode: null,
        errorMessage: null, syncStatus: 'IDLE', ...data,
      };
      state.rows.push(row);
      return row;
    },
    createConfirmed: async (data, verified) => {
      state.confirmedCreates += 1;
      const row = {
        registryRegistrationUid: 'registration-1', status: 'CONFIRMED', errorCode: null,
        errorMessage: null, syncStatus: 'IDLE', verifiedAt: 'now', ...data, ...verified,
      };
      state.rows.push(row);
      return row;
    },
    assignTransaction: async (uid, txHash) => {
      const row = state.rows.find((item) => item.registryRegistrationUid === uid);
      Object.assign(row, { txHash, errorCode: null, errorMessage: null, syncStatus: 'QUEUED' });
      return row;
    },
    recordError: async (uid, code, message) => Object.assign(state.rows[0], { errorCode: code, errorMessage: message }),
    storeEvents: async () => {},
    markEvent: async () => {},
    confirm: async (uid, data) => {
      const row = state.rows[0];
      if (row.status === 'CONFIRMED') return false;
      Object.assign(row, { ...data, status: 'CONFIRMED', verifiedAt: 'now', syncStatus: 'IDLE' });
      return true;
    },
  };
  const verifier = {
    inspectRegistryState: async () => registryState,
    getLatestBlockNumber: async () => 90,
    findRegistrationEvent: async () => registrationEvent,
    verifyRegistration: async () => {
      state.verificationCalls += 1;
      if (verifyError) throw verifyError;
      return { txHash: TX, blockNumber: 100, blockHash: `0x${'cd'.repeat(32)}`, transactionIndex: 2, logIndex: 7 };
    },
  };
  const service = new IdentityRegistryRegistrationService({
    repository,
    interestRepository: {
      findInterestForUpdate: async () => ({
        interestUid: 'interest-1', tokenUid: 'token-1', organizationUid: 'org-1',
        investorUid: 'investor-1', status: state.interestStatus,
      }),
      transitionInterestStatus: async (uid, from, to) => {
        if (state.interestStatus !== from) return false;
        state.interestStatus = to;
        return true;
      },
      createHistory: async (data) => { state.history.push(data); return `history-${state.history.length}`; },
    },
    verifier, transactionRunner: (work) => work({}),
    config: { chainId: 11155111 },
  });
  return { service, state };
};

test('create records PENDING before MetaMask and returns only authoritative parameters', async () => {
  const { service, state } = makeService();
  const result = await service.create(issuer, 'interest-1');
  assert.equal(result.operation.status, 'PENDING');
  assert.equal(result.operation.identityRegistryAddress, REGISTRY);
  assert.equal(result.operation.investorWalletAddress, INVESTOR);
  assert.equal(result.operation.onchainIdentityAddress, IDENTITY);
  assert.equal(result.operation.country, 356);
  assert.equal(state.rows.length, 1);
  assert.equal(state.rows[0].txHash, null);
});

test('create is idempotent and does not duplicate a pending operation', async () => {
  const { service, state } = makeService();
  await service.create(issuer, 'interest-1');
  const result = await service.create(issuer, 'interest-1');
  assert.equal(result.existing, true);
  assert.equal(state.rows.length, 1);
});

test('create synchronizes an already registered investor as a confirmed success', async () => {
  const event = {
    registryEventUid: 'event-1', chainId: 11155111, identityRegistryAddress: REGISTRY,
    investorWalletAddress: INVESTOR, investorIdentityAddress: IDENTITY, txHash: TX,
    blockNumber: 100, blockHash: `0x${'cd'.repeat(32)}`, transactionIndex: 2, logIndex: 7,
  };
  const { service, state } = makeService({
    registryState: { contains: true, matches: true, issuerIsAgent: true },
    registrationEvent: event,
  });

  const result = await service.create(issuer, 'interest-1');

  assert.equal(result.alreadyRegistered, true);
  assert.equal(result.operation.status, 'CONFIRMED');
  assert.equal(result.operation.txHash, TX);
  assert.equal(result.operation.subscriptionStatus, 'registered');
  assert.equal(state.interestStatus, 'registered');
  assert.equal(state.history.length, 1);
  assert.equal(state.rows.length, 1);
  assert.equal(state.pendingCreates, 0, 'already-registered recovery must never create PENDING');
  assert.equal(state.confirmedCreates, 1);
});

test('create does not create PENDING or request MetaMask when existing event evidence is unavailable', async () => {
  const { service, state } = makeService({
    registryState: { contains: true, matches: true, issuerIsAgent: true },
  });

  await assert.rejects(
    service.create(issuer, 'interest-1'),
    (error) => error.statusCode === 503 && error.code === 'REGISTRY_EVENT_NOT_FOUND',
  );
  assert.equal(state.rows.length, 0);
  assert.equal(state.pendingCreates, 0);
  assert.equal(state.interestStatus, 'claimSubmitted');
});

test('confirm independently verifies then conditionally confirms the same database row', async () => {
  const { service, state } = makeService();
  const created = await service.create(issuer, 'interest-1');
  const result = await service.confirm(issuer, 'interest-1', created.operation.registryOperationId, TX);
  assert.equal(result.operation.status, 'CONFIRMED');
  assert.equal(result.operation.txHash, TX);
  assert.equal(result.operation.subscriptionStatus, 'registered');
  assert.equal(state.rows.length, 1);
  assert.equal(state.verificationCalls, 1);
  assert.equal(state.interestStatus, 'registered');
  assert.equal(state.history.length, 1);
  assert.equal(state.history[0].eventType, 'registered');

  const repeated = await service.confirm(issuer, 'interest-1', created.operation.registryOperationId, TX);
  assert.equal(repeated.idempotent, true);
  assert.equal(state.verificationCalls, 1);
  assert.equal(state.history.length, 1, 'idempotent confirmation does not duplicate history');
});

test('not-yet-mined transaction stays PENDING and returns pending verification state', async () => {
  const { service } = makeService({
    verifyError: new RegistryVerificationError('TRANSACTION_NOT_FOUND', 'not mined', { pending: true }),
  });
  const created = await service.create(issuer, 'interest-1');
  const result = await service.confirm(issuer, 'interest-1', created.operation.registryOperationId, TX);
  assert.equal(result.pendingVerification, true);
  assert.equal(result.operation.status, 'PENDING');
  assert.equal(result.operation.verification.code, 'TRANSACTION_NOT_FOUND');
});

test('a wrong on-chain call never confirms the pending operation', async () => {
  const { service, state } = makeService({
    verifyError: new RegistryVerificationError('REGISTRY_PARAMETERS_MISMATCH', 'wrong investor'),
  });
  const created = await service.create(issuer, 'interest-1');
  await assert.rejects(
    service.confirm(issuer, 'interest-1', created.operation.registryOperationId, TX),
    (error) => error.statusCode === 422 && error.code === 'REGISTRY_PARAMETERS_MISMATCH',
  );
  assert.equal(state.rows[0].status, 'PENDING');
});

test('registration cannot start before every claim is submitted', async () => {
  const { service } = makeService({ interestStatus: 'verifiedByIssuer' });
  await assert.rejects(service.create(issuer, 'interest-1'), (error) => error.code === 'CLAIMS_NOT_COMPLETED');
});
