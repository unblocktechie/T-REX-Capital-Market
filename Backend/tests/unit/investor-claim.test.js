const test = require('node:test');
const assert = require('node:assert/strict');
const ethers = require('ethers');
const schemas = require('../../src/schemas/investor-claim.schema');
const { InvestorClaimService } = require('../../src/services/investor-claim.service');
const { ClaimSubmissionVerifierService, ClaimVerificationError } = require('../../src/services/blockchain/claim-submission-verifier.service');

const investor = { userUid: 'u-inv', roleName: 'Investor' };
const INVESTOR_IDENTITY = `0x${'11'.repeat(20)}`;
const ISSUER_IDENTITY = `0x${'22'.repeat(20)}`;
const DATA = '0x4b59435f415050524f564544';
const SIG = `0x${'ab'.repeat(65)}`;
const TX = `0x${'cd'.repeat(32)}`;

// ------------------------------------------------------ on-chain verifier

const iface = new ethers.Interface([
  'event ClaimAdded(bytes32 indexed claimId, uint256 indexed topic, uint256 scheme, address indexed issuer, bytes signature, bytes data, string uri)',
]);
const claimLog = (address, { topic = 1, issuer = ISSUER_IDENTITY, signature = SIG, data = DATA, index = 0 } = {}) => {
  const enc = iface.encodeEventLog(iface.getEvent('ClaimAdded'), [ethers.id('c'), topic, 1, issuer, signature, data, '']);
  return { address, topics: enc.topics, data: enc.data, index };
};
const makeVerifier = (receipt, { chainId = 11155111 } = {}) => new ClaimSubmissionVerifierService(
  { sepoliaRpcUrl: 'http://rpc', chainId: 11155111, supportedChainIds: [11155111] },
  {
    providerFactory: () => ({
      getNetwork: async () => ({ chainId: BigInt(chainId) }),
      getTransactionReceipt: async () => receipt,
      destroy: () => {},
    }),
  },
);
const expected = { txHash: TX, investorIdentityAddress: INVESTOR_IDENTITY, issuerIdentityAddress: ISSUER_IDENTITY, claimTopic: 1, data: DATA, signature: SIG };

test('verifier confirms a matching ClaimAdded on the investor identity', async () => {
  const receipt = { status: 1, blockNumber: 100, index: 2, logs: [claimLog(INVESTOR_IDENTITY, { index: 5 })] };
  const result = await makeVerifier(receipt).verifyClaimSubmission(expected);
  assert.deepEqual(result, { blockNumber: 100, transactionIndex: 2, logIndex: 5 });
});

test('verifier accepts ClaimChanged (claim already existed on-chain)', async () => {
  const changedIface = new ethers.Interface([
    'event ClaimChanged(bytes32 indexed claimId, uint256 indexed topic, uint256 scheme, address indexed issuer, bytes signature, bytes data, string uri)',
  ]);
  const enc = changedIface.encodeEventLog(changedIface.getEvent('ClaimChanged'), [ethers.id('c'), 1, 1, ISSUER_IDENTITY, SIG, DATA, '']);
  const receipt = { status: 1, blockNumber: 7, index: 1, to: INVESTOR_IDENTITY, logs: [{ address: INVESTOR_IDENTITY, topics: enc.topics, data: enc.data, index: 4 }] };
  const result = await makeVerifier(receipt).verifyClaimSubmission(expected);
  assert.deepEqual(result, { blockNumber: 7, transactionIndex: 1, logIndex: 4 });
});

test('verifier rejects a claim added to a different identity contract', async () => {
  const receipt = { status: 1, blockNumber: 1, index: 0, logs: [claimLog(`0x${'99'.repeat(20)}`)] };
  await assert.rejects(makeVerifier(receipt).verifyClaimSubmission(expected), (e) => e.code === 'WRONG_IDENTITY_CONTRACT');
});

test('verifier rejects when the claim fields do not match (topic/issuer/data/signature)', async () => {
  const receipt = { status: 1, blockNumber: 1, index: 0, logs: [claimLog(INVESTOR_IDENTITY, { data: '0xdeadbeef' })] };
  await assert.rejects(makeVerifier(receipt).verifyClaimSubmission(expected), (e) => e.code === 'CLAIM_MISMATCH');
});

test('verifier rejects a failed transaction, wrong chain, and missing receipt', async () => {
  await assert.rejects(makeVerifier({ status: 0, logs: [] }).verifyClaimSubmission(expected), (e) => e.code === 'TRANSACTION_FAILED');
  await assert.rejects(makeVerifier({ status: 1, logs: [] }, { chainId: 1 }).verifyClaimSubmission(expected), (e) => e.code === 'WRONG_CHAIN');
  await assert.rejects(makeVerifier(null).verifyClaimSubmission(expected), (e) => e.code === 'TRANSACTION_NOT_FOUND');
});

test('verifier rejects a malformed tx hash', async () => {
  await assert.rejects(makeVerifier({}).verifyClaimSubmission({ ...expected, txHash: '0x1234' }), (e) => e.code === 'INVALID_TX_HASH');
});

// ------------------------------------------------------------- schema

test('submit schema requires interestId + a valid txHash and rejects extra fields', () => {
  assert.equal(schemas.submitClaim.validate({ interestId: '00000000-0000-4000-8000-000000000001', txHash: TX }).error, undefined);
  assert.ok(schemas.submitClaim.validate({ interestId: '00000000-0000-4000-8000-000000000001', txHash: '0x1234' }).error);
  assert.ok(schemas.submitClaim.validate({ interestId: '00000000-0000-4000-8000-000000000001', txHash: TX, investorIdentityAddress: 'x' }).error);
});

// --------------------------------------------------------------- flow

const makeService = (over = {}) => {
  const state = {
    investor: over.investor || { investorUid: 'inv-1', userUid: 'u-inv' },
    interest: over.interest || {
      interestUid: 'int-1', investorUid: 'inv-1', tokenUid: 'tok-1', organizationUid: 'org-1',
      status: over.status || 'verifiedByIssuer',
      investorIdentityAddress: INVESTOR_IDENTITY, organizationIdentityAddress: ISSUER_IDENTITY,
    },
    signatures: over.signatures || {
      'clm-1': { signatureUid: 'clm-1', interestUid: 'int-1', claimTopic: 1, data: DATA, signature: SIG, status: 'SIGNED' },
      'clm-2': { signatureUid: 'clm-2', interestUid: 'int-1', claimTopic: 2, data: DATA, signature: SIG, status: 'SIGNED' },
    },
    requiredTopics: over.requiredTopics || [{ value: 1 }, { value: 2 }],
    submissions: [],
    history: [],
    verifyResult: over.verifyResult || { blockNumber: 100, transactionIndex: 2, logIndex: 3 },
    verifyError: over.verifyError || null,
    claimState: over.claimState || { exists: true, matches: true },
    claimStateCalled: false,
    indexedEvent: over.indexedEvent === undefined ? true : over.indexedEvent,
    indexerCalled: false,
  };
  const repository = {
    findByInterestAndSignature: async (i, s) => state.submissions.find((x) => x.interestUid === i && x.claimSignatureUid === s) || null,
    upsert: async (base, mutable) => {
      let row = state.submissions.find((x) => x.interestUid === base.interestUid && x.claimSignatureUid === base.claimSignatureUid);
      if (row) { Object.assign(row, mutable); return row; }
      row = { submissionUid: `s${state.submissions.length + 1}`, ...base, ...mutable };
      state.submissions.push(row);
      return row;
    },
    listConfirmedTopics: async (i) => [...new Set(state.submissions.filter((x) => x.interestUid === i && x.status === 'CONFIRMED').map((x) => Number(x.claimTopic)))],
    listByInterest: async (i) => state.submissions.filter((x) => x.interestUid === i),
    findByUid: async (uid) => state.submissions.find((x) => x.submissionUid === uid) || null,
    update: async (uid, data) => {
      const row = state.submissions.find((x) => x.submissionUid === uid);
      if (row) Object.assign(row, data);
      return row || null;
    },
    confirmFromEvent: async (uid, data) => {
      const row = state.submissions.find((x) => x.submissionUid === uid);
      if (!row || row.status === 'CONFIRMED') return false;
      Object.assign(row, { ...data, status: 'CONFIRMED', confirmedAt: 'now', syncStatus: 'IDLE' });
      return true;
    },
    finishSynchronization: async (uid, data) => {
      const row = state.submissions.find((x) => x.submissionUid === uid);
      if (row) Object.assign(row, { syncStatus: data.syncStatus, syncFailureReason: data.failureReason || null });
    },
    queueSynchronization: async (uid) => {
      const row = state.submissions.find((x) => x.submissionUid === uid);
      if (row) row.syncStatus = 'QUEUED';
      return row || null;
    },
  };
  const service = new InvestorClaimService({
    repository,
    interestRepository: {
      findInterestByUid: async () => state.interest,
      findInterestForUpdate: async () => state.interest,
      transitionInterestStatus: async (uid, from, to) => {
        if (state.interest.interestUid === uid && state.interest.status === from) { state.interest.status = to; return true; }
        return false;
      },
      createHistory: async (data) => { state.history.push(data); return `h${state.history.length}`; },
    },
    issuerClaimRepository: {
      findSignatureByUid: async (uid) => state.signatures[uid] || null,
      findLatestVerificationByStatus: async () => ({ verificationUid: 'v1' }),
      listSignatures: async () => Object.values(state.signatures),
    },
    investorRepository: { findByUserUid: async () => state.investor },
    tokenRepository: { listClaimTopics: async () => state.requiredTopics },
    verifier: { verifyClaimSubmission: async () => { if (state.verifyError) throw state.verifyError; return state.verifyResult; } },
    claimStateService: {
      getLatestBlockNumber: async () => 100,
      inspectClaim: async () => { state.claimStateCalled = true; return state.claimState; },
    },
    claimIndexerService: {
      reconcileSubmissionFromStoredEvent: async (submission) => {
        state.indexerCalled = true;
        if (!state.indexedEvent) return null;
        const row = state.submissions.find((s) => s.submissionUid === submission.submissionUid);
        Object.assign(row, { status: 'CONFIRMED', txHash: `0x${'ab'.repeat(32)}`, confirmedAt: 'now', syncStatus: 'IDLE' });
        return row;
      },
    },
    transactionRunner: (work) => work({}),
  });
  return { service, state };
};

test('retry uses Identity state + stored indexed event to confirm without historical scanning', async () => {
  const { service, state } = makeService();
  await service.prepareClaim(investor, 'clm-1', { interestId: 'int-1' });
  const result = await service.retryClaim(investor, 'clm-1', { interestId: 'int-1' });
  assert.equal(state.claimStateCalled, true);
  assert.equal(state.indexerCalled, true);
  assert.equal(result.status, 'CONFIRMED');
  assert.equal(result.detected, true);
  assert.equal(result.claim.status, 'CONFIRMED');
  assert.equal(result.application.confirmedClaims, 1);
});

test('retry returns TRANSACTION_REQUIRED when the exact claim is absent on-chain', async () => {
  const { service, state } = makeService({ claimState: { exists: false, matches: false }, indexedEvent: false });
  await service.prepareClaim(investor, 'clm-1', { interestId: 'int-1' });
  const result = await service.retryClaim(investor, 'clm-1', { interestId: 'int-1' });
  assert.equal(result.status, 'TRANSACTION_REQUIRED');
  assert.equal(result.detected, false);
  assert.equal(result.claim.status, 'PENDING');
  assert.match(result.message, /wallet transaction is required/i);
  const row = state.submissions.find((s) => s.claimSignatureUid === 'clm-1');
  assert.equal(row.status, 'PENDING');
});

test('retry returns SYNCING and queues recovery when state exists but no indexed event is stored', async () => {
  const { service, state } = makeService({ indexedEvent: false });
  await service.prepareClaim(investor, 'clm-1', { interestId: 'int-1' });
  const result = await service.retryClaim(investor, 'clm-1', { interestId: 'int-1' });
  assert.equal(result.status, 'SYNCING');
  assert.equal(result.claim.status, 'PENDING');
  assert.equal(state.submissions[0].syncStatus, 'QUEUED');
});

test('retry is idempotent: an already-confirmed claim returns confirmed without re-querying the chain', async () => {
  const { service, state } = makeService();
  state.submissions.push({ interestUid: 'int-1', claimSignatureUid: 'clm-1', claimTopic: 1, status: 'CONFIRMED', txHash: `0x${'cc'.repeat(32)}`, confirmedAt: 'now' });
  const result = await service.retryClaim(investor, 'clm-1', { interestId: 'int-1' });
  assert.equal(result.detected, true);
  assert.equal(result.claim.status, 'CONFIRMED');
  assert.equal(state.claimStateCalled, false);
});

test('retry never creates a missing submission', async () => {
  const { service, state } = makeService();
  await assert.rejects(
    service.retryClaim(investor, 'clm-1', { interestId: 'int-1' }),
    (e) => e.statusCode === 404 && e.code === 'CLAIM_SUBMISSION_NOT_PREPARED',
  );
  assert.equal(state.submissions.length, 0);
});

test('prepare records a PENDING submission and returns the on-chain params', async () => {
  const { service, state } = makeService();
  const result = await service.prepareClaim(investor, 'clm-1', { interestId: 'int-1' });
  assert.equal(result.status, 'PENDING');
  assert.equal(result.claimId, 'clm-1');
  assert.equal(result.claimTopic, 1);
  assert.equal(result.data, DATA);
  assert.equal(result.signature, SIG);
  assert.equal(result.investorIdentityAddress, INVESTOR_IDENTITY);
  assert.equal(result.issuerIdentityAddress, ISSUER_IDENTITY);
  const row = state.submissions.find((s) => s.claimSignatureUid === 'clm-1');
  assert.equal(row.status, 'PENDING');
  assert.equal(row.txHash, null);
});

test('prepare then submit confirms the same record (two-phase flow)', async () => {
  const { service, state } = makeService();
  await service.prepareClaim(investor, 'clm-1', { interestId: 'int-1' });
  assert.equal(state.submissions.length, 1);
  const result = await service.submitClaim(investor, 'clm-1', { interestId: 'int-1', txHash: TX });
  assert.equal(result.claim.status, 'CONFIRMED');
  assert.equal(state.submissions.length, 1, 'submit updates the prepared row, not a new one');
});

test('prepare is rejected for a claim not owned / not verified (shares validation)', async () => {
  const notVerified = makeService({ status: 'submitIntrest' });
  await assert.rejects(notVerified.service.prepareClaim(investor, 'clm-1', { interestId: 'int-1' }), (e) => e.statusCode === 409);
  const notFound = makeService();
  await assert.rejects(notFound.service.prepareClaim(investor, 'nope', { interestId: 'int-1' }), (e) => e.code === 'CLAIM_NOT_FOUND');
});

test('getClaims returns issuer-signed claims + trusted identity addresses', async () => {
  const { service } = makeService();
  const result = await service.getClaims(investor, 'int-1');
  assert.equal(result.investorIdentityAddress, INVESTOR_IDENTITY);
  assert.equal(result.issuerIdentityAddress, ISSUER_IDENTITY);
  assert.equal(result.claims.length, 2);
  assert.equal(result.claims[0].claimId, 'clm-1');
  // No investorClaimSubmission row yet -> notInitiated (not PENDING).
  assert.equal(result.claims[0].status, 'notInitiated');
});

test('getClaims reflects an existing submission status (not notInitiated) once started', async () => {
  const { service, state } = makeService();
  state.submissions.push({ interestUid: 'int-1', claimSignatureUid: 'clm-1', claimTopic: 1, status: 'PENDING' });
  const result = await service.getClaims(investor, 'int-1');
  const c1 = result.claims.find((c) => c.claimId === 'clm-1');
  const c2 = result.claims.find((c) => c.claimId === 'clm-2');
  assert.equal(c1.status, 'PENDING');
  assert.equal(c2.status, 'notInitiated');
});

test('submitting the first of two required claims confirms it but keeps verifiedByIssuer', async () => {
  const { service, state } = makeService();
  const result = await service.submitClaim(investor, 'clm-1', { interestId: 'int-1', txHash: TX });
  assert.equal(result.claim.status, 'CONFIRMED');
  assert.equal(result.application.status, 'verifiedByIssuer');
  assert.equal(result.application.confirmedClaims, 1);
  assert.equal(result.application.pendingClaims, 1);
  assert.equal(state.history.length, 0);
});

test('confirming the final required claim transitions to claimSubmitted + records history', async () => {
  const { service, state } = makeService();
  await service.submitClaim(investor, 'clm-1', { interestId: 'int-1', txHash: TX });
  const result = await service.submitClaim(investor, 'clm-2', { interestId: 'int-1', txHash: `0x${'ef'.repeat(32)}` });
  assert.equal(result.application.status, 'claimSubmitted');
  assert.equal(result.application.confirmedClaims, 2);
  assert.equal(result.application.pendingClaims, 0);
  assert.ok(state.history.some((h) => h.eventType === 'claimSubmitted' && h.actorRole === 'investor'));
  assert.equal(state.interest.status, 'claimSubmitted');
});

test('an already-confirmed claim is idempotent and does not re-verify', async () => {
  const { service, state } = makeService();
  await service.submitClaim(investor, 'clm-1', { interestId: 'int-1', txHash: TX });
  let verifyCalls = 0;
  state.verifyError = null;
  const spied = makeService();
  // Re-submit on the same service: mark verifier to throw if called again.
  service.verifier.verifyClaimSubmission = async () => { verifyCalls += 1; throw new Error('should not verify'); };
  const result = await service.submitClaim(investor, 'clm-1', { interestId: 'int-1', txHash: TX });
  assert.equal(result.claim.status, 'CONFIRMED');
  assert.match(result.message, /already been confirmed/i);
  assert.equal(verifyCalls, 0);
  void spied;
});

test('a verification failure records a FAILED submission and returns the error code', async () => {
  const { service, state } = makeService({ verifyError: new ClaimVerificationError('CLAIM_MISMATCH', 'nope') });
  await assert.rejects(
    service.submitClaim(investor, 'clm-1', { interestId: 'int-1', txHash: TX }),
    (e) => e.statusCode === 422 && e.code === 'CLAIM_MISMATCH',
  );
  const row = state.submissions.find((s) => s.claimSignatureUid === 'clm-1');
  assert.equal(row.status, 'FAILED');
  assert.equal(row.failureReason, 'CLAIM_MISMATCH');
  assert.equal(state.interest.status, 'verifiedByIssuer');
});

test('a transient RPC error records PENDING (not FAILED) and returns 503', async () => {
  const { service, state } = makeService({ verifyError: new ClaimVerificationError('RPC_UNAVAILABLE', 'rpc down', { transient: true }) });
  await assert.rejects(service.submitClaim(investor, 'clm-1', { interestId: 'int-1', txHash: TX }), (e) => e.statusCode === 503);
  const row = state.submissions.find((s) => s.claimSignatureUid === 'clm-1');
  assert.equal(row.status, 'PENDING');
});

test('claim not found / not associated / signature not verified', async () => {
  const notFound = makeService();
  await assert.rejects(notFound.service.submitClaim(investor, 'nope', { interestId: 'int-1', txHash: TX }), (e) => e.statusCode === 404 && e.code === 'CLAIM_NOT_FOUND');

  const foreign = makeService({ signatures: { 'clm-x': { signatureUid: 'clm-x', interestUid: 'OTHER', claimTopic: 1, data: DATA, signature: SIG, status: 'SIGNED' } } });
  await assert.rejects(foreign.service.submitClaim(investor, 'clm-x', { interestId: 'int-1', txHash: TX }), (e) => e.code === 'CLAIM_NOT_ASSOCIATED_WITH_APPLICATION');

  const unsigned = makeService({ signatures: { 'clm-1': { signatureUid: 'clm-1', interestUid: 'int-1', claimTopic: 1, data: DATA, signature: SIG, status: 'VERIFICATION_FAILED' } } });
  await assert.rejects(unsigned.service.submitClaim(investor, 'clm-1', { interestId: 'int-1', txHash: TX }), (e) => e.code === 'ISSUER_SIGNATURE_NOT_VERIFIED');
});

test('rejects a subscription not owned by the investor, and one not yet verified by the issuer', async () => {
  const foreign = makeService({ interest: { interestUid: 'int-1', investorUid: 'OTHER', tokenUid: 'tok-1', organizationUid: 'org-1', status: 'verifiedByIssuer', investorIdentityAddress: INVESTOR_IDENTITY, organizationIdentityAddress: ISSUER_IDENTITY } });
  await assert.rejects(foreign.service.submitClaim(investor, 'clm-1', { interestId: 'int-1', txHash: TX }), (e) => e.statusCode === 404);

  const notVerified = makeService({ status: 'submitIntrest' });
  await assert.rejects(notVerified.service.submitClaim(investor, 'clm-1', { interestId: 'int-1', txHash: TX }), (e) => e.statusCode === 409);
});
