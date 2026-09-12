const test = require('node:test');
const assert = require('node:assert/strict');
const ethers = require('ethers');
const { ClaimIndexerService } = require('../../src/services/blockchain/claim-indexer.service');
const { IDENTITY_ABI } = require('../../src/services/blockchain/claim-submission-verifier.service');
const { buildOnchainClaimId } = require('../../src/services/blockchain/claim-state.service');

const INVESTOR = `0x${'11'.repeat(20)}`;
const ISSUER = `0x${'22'.repeat(20)}`;
const DATA = '0x4b59435f415050524f564544';
const SIGNATURE = `0x${'ab'.repeat(65)}`;
const TX = `0x${'cd'.repeat(32)}`;
const iface = new ethers.Interface(IDENTITY_ABI);

const makeLog = () => {
  const encoded = iface.encodeEventLog(iface.getEvent('ClaimAdded'), [
    buildOnchainClaimId(ISSUER, 1), 1, 1, ISSUER, SIGNATURE, DATA, '',
  ]);
  return {
    address: INVESTOR,
    topics: encoded.topics,
    data: encoded.data,
    transactionHash: TX,
    blockNumber: 101,
    blockHash: `0x${'01'.repeat(32)}`,
    transactionIndex: 2,
    index: 3,
  };
};

const makeContext = ({ lease = true } = {}) => {
  const state = {
    checkpoint: { indexerName: 'investorClaim', chainId: 11155111, startBlock: 100, lastIndexedBlock: 0, lastIndexedBlockHash: null },
    events: [],
    submission: {
      submissionUid: 'sub-1', interestUid: 'int-1', status: 'PENDING', txHash: null,
      investorIdentityAddress: INVESTOR, issuerIdentityAddress: ISSUER,
      claimTopic: 1, data: DATA, signature: SIGNATURE,
    },
    calls: [],
    finalized: 0,
  };
  const provider = {
    getNetwork: async () => ({ chainId: 11155111n }),
    getBlockNumber: async () => 120,
    getLogs: async (filter) => { state.calls.push(['getLogs', filter]); return [makeLog()]; },
    getBlock: async (block) => ({ number: block, hash: `0x${String(block).padStart(64, '0')}` }),
    destroy: () => {},
  };
  const indexerRepository = {
    ensureCheckpoint: async (name, chainId, startBlock) => { state.checkpoint = { ...state.checkpoint, indexerName: name, chainId, startBlock }; },
    acquireLease: async () => lease,
    renewLease: async () => true,
    releaseLease: async () => {},
    findCheckpoint: async () => ({ ...state.checkpoint }),
    listIdentityAddresses: async () => [INVESTOR],
    storeEvents: async (events) => {
      state.calls.push(['storeEvents']);
      for (const event of events) {
        if (!state.events.some((row) => row.txHash === event.txHash && row.logIndex === event.logIndex)) {
          state.events.push({ claimEventUid: `event-${state.events.length + 1}`, processingStatus: 'NEW', ...event });
        }
      }
    },
    advanceCheckpoint: async (name, chainId, owner, block, hash) => {
      state.calls.push(['advanceCheckpoint']);
      state.checkpoint.lastIndexedBlock = block;
      state.checkpoint.lastIndexedBlockHash = hash;
      return true;
    },
    listProcessableEvents: async () => state.events.filter((event) => event.processingStatus !== 'MATCHED'),
    findEventsForClaim: async () => state.events,
    markEvent: async (uid, data) => {
      const event = state.events.find((row) => row.claimEventUid === uid);
      Object.assign(event, { processingStatus: data.status, matchedSubmissionUid: data.matchedSubmissionUid || null });
    },
  };
  const submissionRepository = {
    findByEvent: async (txHash, logIndex) => (state.submission.txHash === txHash && state.submission.logIndex === logIndex ? state.submission : null),
    findChainMatchCandidates: async () => (state.submission.status === 'CONFIRMED' ? [] : [state.submission]),
    confirmFromEvent: async (uid, event) => {
      if (uid !== state.submission.submissionUid || state.submission.status === 'CONFIRMED') return false;
      Object.assign(state.submission, { status: 'CONFIRMED', txHash: event.txHash, logIndex: event.logIndex, blockNumber: event.blockNumber });
      return true;
    },
    findByUid: async () => state.submission,
  };
  const service = new ClaimIndexerService({
    settingRepository: { findByKey: async () => null },
    indexerRepository,
    submissionRepository,
    recoveryService: { finalizeInterestIfComplete: async () => { state.finalized += 1; } },
    config: {
      sepoliaRpcUrl: 'http://rpc', chainId: 11155111, supportedChainIds: [11155111],
      claimIndexerStartBlock: 100,
    },
    transactionRunner: (work) => work({}),
    dependencies: { providerFactory: () => provider, leaseOwner: 'test-worker', maxRetries: 1 },
  });
  return { service, state };
};

test('global claim indexer stores events before advancing its checkpoint and confirms the existing row', async () => {
  const { service, state } = makeContext();
  const result = await service.run();
  assert.equal(result.leaseAcquired, true);
  assert.equal(result.identityCount, 1);
  assert.equal(result.rpcLogQueries, 1);
  assert.equal(state.checkpoint.lastIndexedBlock, 120 - 1);
  assert.ok(state.calls.findIndex(([name]) => name === 'storeEvents') < state.calls.findIndex(([name]) => name === 'advanceCheckpoint'));
  assert.equal(state.submission.status, 'CONFIRMED');
  assert.equal(state.submission.txHash, TX);
  assert.equal(state.events[0].processingStatus, 'MATCHED');
  assert.equal(state.finalized, 1);
});

test('global claim indexer does no blockchain scan when another worker owns the lease', async () => {
  const { service, state } = makeContext({ lease: false });
  const result = await service.run();
  assert.equal(result.leaseAcquired, false);
  assert.equal(state.calls.some(([name]) => name === 'getLogs'), false);
});

test('stored-event reconciliation is idempotent and returns the existing confirmed submission', async () => {
  const { service, state } = makeContext();
  await service.run();
  const result = await service.reconcileSubmissionFromStoredEvent(state.submission);
  assert.equal(result.status, 'CONFIRMED');
  assert.equal(result.txHash, TX);
  assert.equal(state.events.length, 1);
});
