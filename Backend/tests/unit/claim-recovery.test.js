const test = require('node:test');
const assert = require('node:assert/strict');
const ethers = require('ethers');
const { ClaimRecoveryService, RESULT } = require('../../src/services/blockchain/claim-recovery.service');
const { IDENTITY_ABI } = require('../../src/services/blockchain/claim-submission-verifier.service');

const INVESTOR = `0x${'11'.repeat(20)}`;
const ISSUER = `0x${'22'.repeat(20)}`;
const OTHER = `0x${'99'.repeat(20)}`;
const DATA = '0x4b59435f415050524f564544';
const SIG = `0x${'ab'.repeat(65)}`;

const iface = new ethers.Interface(IDENTITY_ABI);
const mkLog = (address, o = {}) => {
  const { name = 'ClaimAdded', topic = 1, issuer = ISSUER, data = DATA, signature = SIG, blockNumber = 1500, transactionIndex = 0, logIndex = 0, txHash = `0x${'cd'.repeat(32)}` } = o;
  const enc = iface.encodeEventLog(iface.getEvent(name), [ethers.id('c'), topic, 1, issuer, signature, data, '']);
  return { address, topics: enc.topics, data: enc.data, blockNumber, transactionIndex, index: logIndex, transactionHash: txHash };
};

const defaultCandidate = () => ({
  submissionUid: 'sub-1', interestUid: 'int-1', tokenUid: 'tok-1', organizationUid: 'org-1', investorUid: 'inv-1',
  claimSignatureUid: 'clm-1', claimTopic: 1, data: DATA, signature: SIG,
  investorIdentityAddress: INVESTOR, issuerIdentityAddress: ISSUER, txHash: null, status: 'PENDING',
});

const makeService = (over = {}) => {
  const state = {
    latestBlock: over.latestBlock ?? 2000,
    logs: over.logs || [],
    candidates: over.candidates || [defaultCandidate()],
    claimSignature: over.claimSignature === undefined
      ? { interestUid: 'int-1', status: 'SIGNED', claimTopic: 1, data: DATA, signature: SIG }
      : over.claimSignature,
    requiredTopics: over.requiredTopics || [{ value: 1 }],
    interest: over.interest || { interestUid: 'int-1', tokenUid: 'tok-1', status: 'verifiedByIssuer' },
    confirmedTopics: [],
    recovered: null,
    recoverReturns: over.recoverReturns === undefined ? true : over.recoverReturns,
    history: [],
    getLogsError: over.getLogsError || null,
    settings: over.settings || {},
    claimState: over.claimState || { exists: true, matches: true, claimId: ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['address', 'uint256'], [ISSUER, 1])) },
  };
  const provider = {
    getBlockNumber: async () => state.latestBlock,
    getLogs: async ({ address, fromBlock, toBlock }) => {
      if (state.getLogsError) throw new Error(state.getLogsError);
      return state.logs.filter((l) => l.address.toLowerCase() === address.toLowerCase() && l.blockNumber >= fromBlock && l.blockNumber <= toBlock);
    },
    destroy: () => {},
  };
  const service = new ClaimRecoveryService({
    settingRepository: { findByKey: async (k) => (state.settings[k] !== undefined ? { settingValue: state.settings[k] } : null) },
    submissionRepository: {
      findRecoveryCandidates: async (limit) => state.candidates.filter((c) => c.txHash == null && c.status === 'PENDING').slice(0, limit),
      markSyncProcessing: async (uid) => state.candidates.some((c) => c.submissionUid === uid && c.txHash == null && c.status === 'PENDING'),
      finishSynchronization: async (uid, data) => {
        const c = state.candidates.find((x) => x.submissionUid === uid);
        if (c) Object.assign(c, { syncStatus: data.syncStatus, syncFailureReason: data.failureReason || null });
      },
      recoverSubmission: async (uid, data) => {
        if (!state.recoverReturns) return false;
        const c = state.candidates.find((x) => x.submissionUid === uid);
        if (c && c.txHash == null && c.status === 'PENDING') {
          Object.assign(c, { txHash: data.txHash, blockNumber: data.blockNumber, transactionIndex: data.transactionIndex, logIndex: data.logIndex, status: data.status });
          state.recovered = { uid, ...data };
          state.confirmedTopics.push(Number(c.claimTopic));
          return true;
        }
        return false;
      },
      listConfirmedTopics: async () => [...new Set(state.confirmedTopics)],
    },
    issuerClaimRepository: { findSignatureByUid: async () => state.claimSignature },
    interestRepository: {
      findInterestForUpdate: async () => state.interest,
      transitionInterestStatus: async (uid, from, to) => { if (state.interest.status === from) { state.interest.status = to; return true; } return false; },
      createHistory: async (d) => { state.history.push(d); },
    },
    tokenRepository: { listClaimTopics: async () => state.requiredTopics },
    config: { sepoliaRpcUrl: 'http://rpc', chainId: 11155111, supportedChainIds: [11155111] },
    transactionRunner: (work) => work({}),
    dependencies: {
      providerFactory: () => provider,
      claimStateInspector: async () => state.claimState,
      maxRetries: 1,
      retryBaseDelayMs: 1,
    },
  });
  return { service, state, provider };
};

const RANGE = { safeLatestBlock: 1988, offset: 1000, lookbackBlocks: 200000 };
const stats = () => ({ retries: 0 });

// ------------------------------------------------------------- recovery

test('recovers a matching ClaimAdded (metadata + status transition)', async () => {
  const ctx = makeService({ logs: [mkLog(INVESTOR, { blockNumber: 1500, transactionIndex: 2, logIndex: 7, txHash: `0x${'a1'.repeat(32)}` })] });
  const result = await ctx.service.processCandidate(ctx.provider, defaultCandidate(), RANGE, stats());
  assert.equal(result, RESULT.RECOVERED);
  assert.equal(ctx.state.recovered.txHash, `0x${'a1'.repeat(32)}`);
  assert.equal(ctx.state.recovered.blockNumber, 1500);
  assert.equal(ctx.state.recovered.transactionIndex, 2);
  assert.equal(ctx.state.recovered.logIndex, 7);
  assert.equal(ctx.state.recovered.status, 'CONFIRMED');
  assert.equal(ctx.state.interest.status, 'claimSubmitted');
  assert.ok(ctx.state.history.some((h) => h.eventType === 'claimSubmitted' && h.actorRole === 'system'));
});

test('recovers a matching ClaimChanged', async () => {
  const ctx = makeService({ logs: [mkLog(INVESTOR, { name: 'ClaimChanged', blockNumber: 1600, txHash: `0x${'b2'.repeat(32)}` })] });
  const result = await ctx.service.processCandidate(ctx.provider, defaultCandidate(), RANGE, stats());
  assert.equal(result, RESULT.RECOVERED);
  assert.equal(ctx.state.recovered.blockNumber, 1600);
});

test('selects the latest matching event by (block, txIndex, logIndex)', async () => {
  const logs = [
    mkLog(INVESTOR, { name: 'ClaimAdded', blockNumber: 1000, txHash: `0x${'01'.repeat(32)}` }),
    mkLog(INVESTOR, { name: 'ClaimChanged', blockNumber: 1100, txHash: `0x${'02'.repeat(32)}` }),
    mkLog(INVESTOR, { name: 'ClaimChanged', blockNumber: 1200, txHash: `0x${'03'.repeat(32)}` }),
  ];
  const ctx = makeService({ logs });
  await ctx.service.processCandidate(ctx.provider, defaultCandidate(), RANGE, stats());
  assert.equal(ctx.state.recovered.blockNumber, 1200);
  assert.equal(ctx.state.recovered.txHash, `0x${'03'.repeat(32)}`);
});

// ------------------------------------------------------------- mismatches

test('no event on the investor identity -> NO_MATCH (wrong identity contract)', async () => {
  const ctx = makeService({ logs: [mkLog(OTHER, {})] }); // event on a different identity
  const result = await ctx.service.processCandidate(ctx.provider, defaultCandidate(), RANGE, stats());
  assert.equal(result, RESULT.NO_MATCH);
  assert.equal(ctx.state.recovered, null);
});

test('wrong issuer -> ISSUER_MISMATCH', async () => {
  const ctx = makeService({ logs: [mkLog(INVESTOR, { issuer: OTHER })] });
  assert.equal(await ctx.service.processCandidate(ctx.provider, defaultCandidate(), RANGE, stats()), RESULT.ISSUER_MISMATCH);
  assert.equal(ctx.state.recovered, null);
});

test('wrong topic -> TOPIC_MISMATCH', async () => {
  const ctx = makeService({ logs: [mkLog(INVESTOR, { topic: 2 })] });
  assert.equal(await ctx.service.processCandidate(ctx.provider, defaultCandidate(), RANGE, stats()), RESULT.TOPIC_MISMATCH);
});

test('wrong data -> DATA_MISMATCH', async () => {
  const ctx = makeService({ logs: [mkLog(INVESTOR, { data: '0xdeadbeef' })] });
  assert.equal(await ctx.service.processCandidate(ctx.provider, defaultCandidate(), RANGE, stats()), RESULT.DATA_MISMATCH);
});

test('data normalization treats 0xABC == 0xabc', async () => {
  const cand = { ...defaultCandidate(), data: '0xABCDEF' };
  const ctx = makeService({
    logs: [mkLog(INVESTOR, { data: '0xabcdef' })],
    claimSignature: { interestUid: 'int-1', status: 'SIGNED', claimTopic: 1, data: '0xABCDEF', signature: SIG },
  });
  assert.equal(await ctx.service.processCandidate(ctx.provider, cand, RANGE, stats()), RESULT.RECOVERED);
});

test('a stale on-chain claim with the same issuer/topic/data but a DIFFERENT signature is NOT recovered', async () => {
  // Same identity/issuer/topic/data as a prior run, but the new submission has a fresh signature.
  const ctx = makeService({
    logs: [mkLog(INVESTOR, { signature: `0x${'ee'.repeat(65)}` })],
    claimState: { exists: true, matches: false },
  });
  const result = await ctx.service.processCandidate(ctx.provider, defaultCandidate(), RANGE, stats());
  assert.equal(result, RESULT.NO_MATCH);
  assert.equal(ctx.state.recovered, null);
});

test('claim-signature disagreement -> CLAIM_SIGNATURE_MISMATCH (no chain query)', async () => {
  const ctx = makeService({
    claimSignature: { interestUid: 'int-1', status: 'SIGNED', claimTopic: 1, data: '0xdifferent', signature: SIG },
    logs: [mkLog(INVESTOR, {})],
  });
  assert.equal(await ctx.service.processCandidate(ctx.provider, defaultCandidate(), RANGE, stats()), RESULT.CLAIM_SIGNATURE_MISMATCH);
  assert.equal(ctx.state.recovered, null);
});

test('already recovered (txHash set) -> ALREADY_PROCESSED', async () => {
  const ctx = makeService();
  const cand = { ...defaultCandidate(), txHash: `0x${'ff'.repeat(32)}` };
  assert.equal(await ctx.service.processCandidate(ctx.provider, cand, RANGE, stats()), RESULT.ALREADY_PROCESSED);
});

test('race: conditional update affects 0 rows -> ALREADY_PROCESSED (no overwrite)', async () => {
  const ctx = makeService({ logs: [mkLog(INVESTOR, {})], recoverReturns: false });
  assert.equal(await ctx.service.processCandidate(ctx.provider, defaultCandidate(), RANGE, stats()), RESULT.ALREADY_PROCESSED);
  assert.equal(ctx.state.recovered, null);
});

test('RPC failure bubbles up and leaves the submission unchanged', async () => {
  const ctx = makeService({ getLogsError: 'network error' });
  await assert.rejects(ctx.service.processCandidate(ctx.provider, defaultCandidate(), RANGE, stats()));
  assert.equal(ctx.state.recovered, null);
});

// ------------------------------------------------------------- run()

test('run() uses latestBlock - confirmationBlocks as the upper bound (reorg-safe)', async () => {
  // Matching event sits at 1995, above safe head (2000 - 12 = 1988) -> must not be found.
  const ctx = makeService({ latestBlock: 2000, logs: [mkLog(INVESTOR, { blockNumber: 1995 })] });
  const result = await ctx.service.run();
  assert.equal(result.recovered, 0);
  assert.equal(ctx.state.recovered, null);
});

test('run() is idempotent: a second run makes no further changes', async () => {
  const ctx = makeService({ latestBlock: 2000, logs: [mkLog(INVESTOR, { blockNumber: 1500, txHash: `0x${'0a'.repeat(32)}` })] });
  const first = await ctx.service.run();
  assert.equal(first.recovered, 1);
  const second = await ctx.service.run();
  assert.equal(second.candidateCount, 0);
  assert.equal(second.recovered, 0);
});

test('run() skips when disabled via settings', async () => {
  const ctx = makeService({ settings: { ClaimRecoveryEnabled: 'false' }, logs: [mkLog(INVESTOR, {})] });
  const result = await ctx.service.run();
  assert.equal(result.enabled, false);
  assert.equal(ctx.state.recovered, null);
});
