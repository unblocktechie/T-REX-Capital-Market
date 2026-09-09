const ethers = require('ethers');
const { env } = require('../../core/config/env');
const { withTransaction } = require('../../database/connection');
const { logger } = require('../common/log.service');
const { IDENTITY_ABI, CLAIM_EVENT_NAMES } = require('./claim-submission-verifier.service');
const { CLAIM_READ_ABI, buildOnchainClaimId } = require('./claim-state.service');

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

// General Settings keys (camelCase values, consistent with the TREX deployment runner).
const SETTING_KEYS = {
  blockOffset: 'ClaimRecoveryBlockOffset',
  confirmationBlocks: 'ClaimRecoveryConfirmationBlocks',
  lookbackBlocks: 'ClaimRecoveryLookbackBlocks',
  batchSize: 'ClaimRecoveryBatchSize',
  enabled: 'ClaimRecoveryEnabled',
};

const DEFAULTS = {
  blockOffset: 1000,
  confirmationBlocks: 12,
  lookbackBlocks: 200000,
  batchSize: 100,
};

// Explicit per-candidate result types (monitoring/debugging).
const RESULT = {
  RECOVERED: 'RECOVERED',
  NO_MATCH: 'NO_MATCH',
  ISSUER_MISMATCH: 'ISSUER_MISMATCH',
  TOPIC_MISMATCH: 'TOPIC_MISMATCH',
  DATA_MISMATCH: 'DATA_MISMATCH',
  CLAIM_SIGNATURE_MISMATCH: 'CLAIM_SIGNATURE_MISMATCH',
  ALREADY_PROCESSED: 'ALREADY_PROCESSED',
  INVALID_SUBMISSION: 'INVALID_SUBMISSION',
  RPC_ERROR: 'RPC_ERROR',
  DB_ERROR: 'DB_ERROR',
};

// Normalized byte comparison for hex values (0xABC === 0xabc).
const normalizeHex = (value) => {
  try {
    return ethers.hexlify(ethers.getBytes(value)).toLowerCase();
  } catch {
    return String(value || '').toLowerCase();
  }
};
const hexEqual = (a, b) => normalizeHex(a) === normalizeHex(b);

// Fallback runner for investor claim submissions that succeeded on-chain but whose transaction
// metadata was never recorded in the DB (prepared -> PENDING, txHash NULL). It is DB-driven and
// targeted: for each suspicious submission it queries ONLY that investor's Identity contract for
// ClaimAdded/ClaimChanged, validates issuer + topic + data + the issuer-signed claim, and
// recovers the exact tx metadata. It is read-only on-chain, idempotent, reorg-aware, and never
// associates an unrelated claim. It deliberately does NOT use a global forward checkpoint (a claim
// tx can exist before its DB row becomes suspicious) — the range comes from a lookback window.
class ClaimRecoveryService {
  constructor({
    settingRepository,
    submissionRepository,
    issuerClaimRepository,
    interestRepository,
    tokenRepository,
    config = env.blockchain,
    transactionRunner = withTransaction,
    dependencies = {},
  }) {
    this.settingRepository = settingRepository;
    this.submissionRepository = submissionRepository;
    this.issuerClaimRepository = issuerClaimRepository;
    this.interestRepository = interestRepository;
    this.tokenRepository = tokenRepository;
    this.config = config;
    this.transactionRunner = transactionRunner;
    this.providerFactory = dependencies.providerFactory || ((rpcUrl) => new ethers.JsonRpcProvider(rpcUrl));
    this.identityInterface = dependencies.identityInterface || new ethers.Interface(IDENTITY_ABI);
    this.claimTopics = [...CLAIM_EVENT_NAMES].map((name) => this.identityInterface.getEvent(name).topicHash);
    this.claimStateInspector = dependencies.claimStateInspector || (async (provider, candidate) => {
      const claimId = buildOnchainClaimId(candidate.issuerIdentityAddress, candidate.claimTopic);
      const identity = new ethers.Contract(candidate.investorIdentityAddress, CLAIM_READ_ABI, provider);
      const claim = await identity.getClaim(claimId);
      const topic = Number(claim.topic ?? claim[0]);
      const scheme = Number(claim.scheme ?? claim[1]);
      const issuer = String(claim.issuer ?? claim[2]);
      const signature = claim.signature ?? claim[3];
      const data = claim.data ?? claim[4];
      const exists = topic > 0 && ethers.isAddress(issuer) && issuer !== ethers.ZeroAddress;
      return {
        exists,
        matches: exists && topic === Number(candidate.claimTopic) && scheme === 1
          && issuer.toLowerCase() === candidate.issuerIdentityAddress.toLowerCase()
          && hexEqual(data, candidate.data) && hexEqual(signature, candidate.signature),
        claimId,
      };
    });
    this.maxRetries = Number.isInteger(dependencies.maxRetries) ? dependencies.maxRetries : 3;
    this.retryBaseDelayMs = Number.isInteger(dependencies.retryBaseDelayMs) ? dependencies.retryBaseDelayMs : 1000;
  }

  async getSettingRaw(key) {
    const row = await this.settingRepository.findByKey(key);
    return row ? row.settingValue : undefined;
  }

  async getNumber(key, fallback) {
    const value = Number(await this.getSettingRaw(key));
    return Number.isFinite(value) ? value : fallback;
  }

  async getBoolean(key, fallback) {
    const raw = await this.getSettingRaw(key);
    if (raw === undefined || raw === null || raw === '') return fallback;
    return String(raw).toLowerCase() === 'true';
  }

  isConfigured() {
    return Boolean(this.config.sepoliaRpcUrl);
  }

  async isEnabled() {
    return this.getBoolean(SETTING_KEYS.enabled, true);
  }

  async withRetry(work, label, stats) {
    let attempt = 0;
    let delay = this.retryBaseDelayMs;
    for (;;) {
      try {
        return await work();
      } catch (error) {
        attempt += 1;
        if (stats) stats.retries += 1;
        if (attempt >= this.maxRetries) throw error;
        logger.warn('Claim recovery: transient RPC failure, retrying', { label, attempt, nextDelayMs: delay, error: error.message });
        await sleep(delay);
        delay *= 2;
      }
    }
  }

  async run() {
    const startedAt = Date.now();
    const stats = {
      enabled: true, candidateCount: 0, processed: 0, recovered: 0, noMatch: 0,
      mismatch: 0, skipped: 0, rpcErrors: 0, dbErrors: 0, retries: 0, durationMs: 0,
      resultsByType: {},
    };
    const record = (result) => { stats.resultsByType[result] = (stats.resultsByType[result] || 0) + 1; };

    if (!(await this.isEnabled())) {
      stats.enabled = false;
      logger.info('Claim recovery is disabled; skipping run');
      stats.durationMs = Date.now() - startedAt;
      return stats;
    }
    if (!this.isConfigured()) {
      logger.warn('Claim recovery is not configured (RPC missing); skipping run');
      stats.durationMs = Date.now() - startedAt;
      return stats;
    }

    const offset = Math.max(1, Math.trunc(await this.getNumber(SETTING_KEYS.blockOffset, DEFAULTS.blockOffset)));
    const confirmationBlocks = Math.max(0, Math.trunc(await this.getNumber(SETTING_KEYS.confirmationBlocks, DEFAULTS.confirmationBlocks)));
    const lookbackBlocks = Math.max(1, Math.trunc(await this.getNumber(SETTING_KEYS.lookbackBlocks, DEFAULTS.lookbackBlocks)));
    const batchSize = Math.max(1, Math.trunc(await this.getNumber(SETTING_KEYS.batchSize, DEFAULTS.batchSize)));

    let candidates;
    try {
      candidates = await this.submissionRepository.findRecoveryCandidates(batchSize);
    } catch (error) {
      stats.dbErrors += 1;
      logger.error('Claim recovery: could not load candidates', { error: { message: error.message, stack: error.stack } });
      stats.durationMs = Date.now() - startedAt;
      return stats;
    }
    stats.candidateCount = candidates.length;
    if (!candidates.length) {
      logger.info('Claim recovery: no suspicious submissions to process');
      stats.durationMs = Date.now() - startedAt;
      return stats;
    }

    let provider;
    try {
      provider = this.providerFactory(this.config.sepoliaRpcUrl);
      const latestBlock = Number(await this.withRetry(() => provider.getBlockNumber(), 'getBlockNumber', stats));
      const safeLatestBlock = latestBlock - confirmationBlocks; // reorg-safe upper bound
      logger.info('Claim recovery started', {
        candidateCount: candidates.length, latestBlock, safeLatestBlock, offset, confirmationBlocks, lookbackBlocks, batchSize,
      });

      for (const candidate of candidates) {
        stats.processed += 1;
        let result;
        try {
          const claimed = await this.submissionRepository.markSyncProcessing(candidate.submissionUid);
          if (!claimed) {
            result = RESULT.ALREADY_PROCESSED;
            record(result);
            stats.skipped += 1;
            continue;
          }
          result = await this.processCandidate(provider, candidate, { safeLatestBlock, offset, lookbackBlocks }, stats);
          if (![RESULT.RECOVERED, RESULT.ALREADY_PROCESSED].includes(result)) {
            await this.submissionRepository.finishSynchronization(candidate.submissionUid, {
              syncStatus: result === RESULT.NO_MATCH ? 'IDLE' : 'FAILED',
              lastScannedBlock: safeLatestBlock,
              failureReason: result === RESULT.NO_MATCH ? null : result,
              nextRetrySeconds: result === RESULT.NO_MATCH ? 60 : 300,
            });
          }
        } catch (error) {
          result = error.recoveryResult || RESULT.RPC_ERROR;
          if (result === RESULT.DB_ERROR) stats.dbErrors += 1; else stats.rpcErrors += 1;
          await this.submissionRepository.finishSynchronization(candidate.submissionUid, {
            syncStatus: 'FAILED', failureReason: error.message, nextRetrySeconds: 60,
          }).catch(() => {});
          logger.error('Claim recovery: candidate processing failed', {
            submissionId: candidate.submissionUid, result, error: { message: error.message, stack: error.stack },
          });
        }
        record(result);
        if (result === RESULT.RECOVERED) stats.recovered += 1;
        else if (result === RESULT.NO_MATCH) stats.noMatch += 1;
        else if ([RESULT.ISSUER_MISMATCH, RESULT.TOPIC_MISMATCH, RESULT.DATA_MISMATCH, RESULT.CLAIM_SIGNATURE_MISMATCH].includes(result)) stats.mismatch += 1;
        else stats.skipped += 1;
      }
    } catch (error) {
      stats.rpcErrors += 1;
      logger.error('Claim recovery: run failed', { error: { message: error.message, stack: error.stack } });
    } finally {
      if (provider && typeof provider.destroy === 'function') provider.destroy();
    }

    stats.durationMs = Date.now() - startedAt;
    logger.info('Claim recovery completed', stats);
    return stats;
  }

  // Reconciles a single suspicious submission. Returns a RESULT.* code.
  async processCandidate(provider, candidate, range, stats) {
    if (candidate.txHash) return RESULT.ALREADY_PROCESSED;
    if (!ethers.isAddress(candidate.investorIdentityAddress) || !ethers.isAddress(candidate.issuerIdentityAddress)) {
      logger.warn('Claim recovery: invalid identity addresses on submission', { submissionId: candidate.submissionUid });
      return RESULT.INVALID_SUBMISSION;
    }

    // Consistency vs the issuer-signed claim it references (never recover a mismatched claim).
    if (candidate.claimSignatureUid) {
      const claimSignature = await this.issuerClaimRepository.findSignatureByUid(candidate.claimSignatureUid);
      if (!claimSignature
        || claimSignature.interestUid !== candidate.interestUid
        || claimSignature.status !== 'SIGNED'
        || Number(claimSignature.claimTopic) !== Number(candidate.claimTopic)
        || !hexEqual(claimSignature.data, candidate.data)
        || !hexEqual(claimSignature.signature, candidate.signature)) {
        logger.warn('Claim recovery: submission does not agree with its issuer-signed claim', { submissionId: candidate.submissionUid });
        return RESULT.CLAIM_SIGNATURE_MISMATCH;
      }
    }

    // A cheap state read avoids any historical log scan when the exact claim is not currently on
    // the Identity contract. Historical logs are needed only to recover the authoritative txHash.
    const currentClaim = await this.withRetry(
      () => this.claimStateInspector(provider, candidate),
      `getClaim ${candidate.investorIdentityAddress}/${candidate.claimTopic}`,
      stats,
    );
    if (!currentClaim.exists || !currentClaim.matches) return RESULT.NO_MATCH;

    const legacyFromBlock = Math.max(0, range.safeLatestBlock - range.lookbackBlocks);
    const preparedFromBlock = candidate.preparedAtBlock == null
      ? legacyFromBlock
      : Math.max(0, Number(candidate.preparedAtBlock) - 2);
    const cursorFromBlock = candidate.lastScannedBlock == null
      ? preparedFromBlock
      : Math.max(preparedFromBlock, Number(candidate.lastScannedBlock) - 2);
    const fromBlock = cursorFromBlock;
    if (range.safeLatestBlock <= 0 || fromBlock > range.safeLatestBlock) return RESULT.NO_MATCH;

    // Query ONLY this investor's Identity contract, in reorg-safe chunks, NEWEST-FIRST with an
    // early exit: the first (newest) chunk that contains a full match holds the latest matching
    // events, so we stop there instead of scanning the whole lookback window every time.
    const events = [];
    const seen = { anyEvent: false, issuerMatch: false, issuerTopicMatch: false, issuerTopicDataMatch: false };
    let to = range.safeLatestBlock;
    while (to >= fromBlock) {
      const from = Math.max(fromBlock, to - range.offset + 1);
      const claimId = currentClaim.claimId || buildOnchainClaimId(candidate.issuerIdentityAddress, candidate.claimTopic);
      const topicValue = ethers.toBeHex(BigInt(candidate.claimTopic), 32);
      const issuerValue = ethers.zeroPadValue(candidate.issuerIdentityAddress, 32);
      const logs = await this.withRetry(() => provider.getLogs({
        address: candidate.investorIdentityAddress,
        // All indexed event fields are filtered by the RPC node. Application-level validation
        // below still verifies data and signature exactly before any DB update.
        topics: [this.claimTopics, claimId, topicValue, issuerValue],
        fromBlock: from,
        toBlock: to,
      }), `getLogs ${from}-${to}`, stats);

      for (const log of logs) {
        let parsed;
        try {
          parsed = this.identityInterface.parseLog({ topics: [...log.topics], data: log.data });
        } catch {
          continue;
        }
        if (!parsed || !CLAIM_EVENT_NAMES.has(parsed.name)) continue;
        seen.anyEvent = true;
        const issuerOk = hexEqual(parsed.args.issuer, candidate.issuerIdentityAddress);
        const topicOk = Number(parsed.args.topic) === Number(candidate.claimTopic);
        const dataOk = hexEqual(parsed.args.data, candidate.data);
        // The issuer signature must be the EXACT one from this submission's issuer-signed claim.
        // Without this, a stale on-chain claim with the same (issuer, topic, data) — e.g. from an
        // earlier run reusing the same identity/data — would falsely confirm a new submission.
        const signatureOk = hexEqual(parsed.args.signature, candidate.signature);
        if (issuerOk) seen.issuerMatch = true;
        if (issuerOk && topicOk) seen.issuerTopicMatch = true;
        if (issuerOk && topicOk && dataOk) seen.issuerTopicDataMatch = true;
        if (issuerOk && topicOk && dataOk && signatureOk) {
          events.push({
            eventName: parsed.name,
            transactionHash: log.transactionHash,
            blockNumber: Number(log.blockNumber),
            transactionIndex: Number(log.transactionIndex),
            logIndex: Number(log.index),
          });
        }
      }
      if (events.length) break; // newest chunk with a full match -> latest event is here
      to = from - 1;
    }

    if (!events.length) {
      // Everything matched except the signature -> this exact signed claim isn't on-chain yet
      // (e.g. a stale claim with the same data exists, but not THIS submission). Treat as NO_MATCH.
      if (seen.issuerTopicDataMatch) return RESULT.NO_MATCH;
      if (seen.issuerTopicMatch) return RESULT.DATA_MISMATCH;
      if (seen.issuerMatch) return RESULT.TOPIC_MISMATCH;
      if (seen.anyEvent) return RESULT.ISSUER_MISMATCH;
      return RESULT.NO_MATCH;
    }

    // Deterministic latest event: highest (blockNumber, transactionIndex, logIndex).
    events.sort((a, b) => (a.blockNumber - b.blockNumber)
      || (a.transactionIndex - b.transactionIndex)
      || (a.logIndex - b.logIndex));
    const latest = events[events.length - 1];

    // Atomic recovery — safe against the normal submit flow / another worker running concurrently.
    let recovered;
    try {
      recovered = await this.submissionRepository.recoverSubmission(candidate.submissionUid, {
        txHash: latest.transactionHash,
        blockNumber: latest.blockNumber,
        transactionIndex: latest.transactionIndex,
        logIndex: latest.logIndex,
        status: 'CONFIRMED',
        confirmedAt: new Date(),
      });
    } catch (error) {
      error.recoveryResult = RESULT.DB_ERROR;
      throw error;
    }
    if (!recovered) return RESULT.ALREADY_PROCESSED; // normal flow won the race

    logger.info('Claim recovery: submission recovered', {
      submissionId: candidate.submissionUid,
      investorIdentityAddress: candidate.investorIdentityAddress,
      issuerIdentityAddress: candidate.issuerIdentityAddress,
      claimTopic: Number(candidate.claimTopic),
      eventName: latest.eventName,
      transactionHash: latest.transactionHash,
      blockNumber: latest.blockNumber,
      transactionIndex: latest.transactionIndex,
      logIndex: latest.logIndex,
      result: RESULT.RECOVERED,
    });

    // Complete the application if every required claim is now confirmed (same rule as submit).
    await this.finalizeInterestIfComplete(candidate).catch((error) => {
      logger.warn('Claim recovery: interest finalization failed (recovery still succeeded)', {
        submissionId: candidate.submissionUid, error: { message: error.message },
      });
    });
    return RESULT.RECOVERED;
  }

  // Mirrors the submit flow's completion: under a row lock, if all required claim topics are
  // CONFIRMED and the interest is still verifiedByIssuer, transition it to claimSubmitted and
  // record the timeline event (system actor).
  async finalizeInterestIfComplete(candidate) {
    const requiredRows = await this.tokenRepository.listClaimTopics(candidate.tokenUid);
    const required = requiredRows.map((row) => Number(row.value)).filter((value) => Number.isInteger(value));
    if (!required.length) return;

    await this.transactionRunner(async (connection) => {
      const locked = await this.interestRepository.findInterestForUpdate(candidate.interestUid, connection);
      if (!locked || locked.status !== 'verifiedByIssuer') return;
      const confirmed = await this.submissionRepository.listConfirmedTopics(candidate.interestUid, connection);
      if (!required.every((topic) => confirmed.includes(topic))) return;

      const transitioned = await this.interestRepository.transitionInterestStatus(
        candidate.interestUid, 'verifiedByIssuer', 'claimSubmitted', connection,
      );
      if (transitioned && typeof this.interestRepository.createHistory === 'function') {
        await this.interestRepository.createHistory({
          interestUid: candidate.interestUid,
          tokenUid: candidate.tokenUid,
          organizationUid: candidate.organizationUid,
          investorUid: candidate.investorUid,
          eventType: 'claimSubmitted',
          actorRole: 'system',
          actorUserUid: null,
          note: 'All required investor claims recovered and verified on-chain by the claim recovery runner.',
        }, connection);
      }
    });
  }
}

module.exports = { ClaimRecoveryService, SETTING_KEYS, RESULT, DEFAULTS, normalizeHex };
