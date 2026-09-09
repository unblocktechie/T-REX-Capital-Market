const crypto = require('node:crypto');
const ethers = require('ethers');
const { env } = require('../../core/config/env');
const { withTransaction } = require('../../database/connection');
const { logger } = require('../common/log.service');
const { IDENTITY_ABI, CLAIM_EVENT_NAMES } = require('./claim-submission-verifier.service');
const { buildOnchainClaimId, hexEqual } = require('./claim-state.service');

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

const INDEXER_NAME = 'investorClaim';
const SETTING_KEYS = {
  enabled: 'ClaimIndexerEnabled',
  intervalSeconds: 'ClaimIndexerIntervalSeconds',
  startBlock: 'ClaimIndexerStartBlock',
  blockOffset: 'ClaimIndexerBlockOffset',
  confirmationBlocks: 'ClaimIndexerConfirmationBlocks',
  addressBatchSize: 'ClaimIndexerAddressBatchSize',
  eventBatchSize: 'ClaimIndexerEventBatchSize',
  leaseSeconds: 'ClaimIndexerLeaseSeconds',
  maxChunksPerRun: 'ClaimIndexerMaxChunksPerRun',
};

const DEFAULTS = {
  intervalSeconds: 15,
  startBlock: 0,
  blockOffset: 1000,
  confirmationBlocks: 12,
  addressBatchSize: 100,
  eventBatchSize: 200,
  leaseSeconds: 120,
  maxChunksPerRun: 20,
};

const chunks = (values, size) => {
  const result = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
};

class ClaimIndexerService {
  constructor({
    settingRepository,
    indexerRepository,
    submissionRepository,
    recoveryService,
    config = env.blockchain,
    transactionRunner = withTransaction,
    dependencies = {},
  }) {
    this.settingRepository = settingRepository;
    this.indexerRepository = indexerRepository;
    this.submissionRepository = submissionRepository;
    this.recoveryService = recoveryService;
    this.config = config;
    this.transactionRunner = transactionRunner;
    this.providerFactory = dependencies.providerFactory || ((rpcUrl) => new ethers.JsonRpcProvider(rpcUrl));
    this.identityInterface = dependencies.identityInterface || new ethers.Interface(IDENTITY_ABI);
    this.claimTopics = [...CLAIM_EVENT_NAMES].map((name) => this.identityInterface.getEvent(name).topicHash);
    this.leaseOwner = dependencies.leaseOwner || `${process.pid}-${crypto.randomUUID()}`;
    this.maxRetries = Number.isInteger(dependencies.maxRetries) ? dependencies.maxRetries : 3;
    this.retryBaseDelayMs = Number.isInteger(dependencies.retryBaseDelayMs) ? dependencies.retryBaseDelayMs : 500;
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

  async isEnabled() {
    return this.getBoolean(SETTING_KEYS.enabled, true);
  }

  isConfigured() {
    return Boolean(this.config.sepoliaRpcUrl);
  }

  async withRetry(work, label, stats) {
    let attempt = 0;
    let delay = this.retryBaseDelayMs;
    for (;;) {
      try {
        return await work();
      } catch (error) {
        attempt += 1;
        stats.retries += 1;
        if (attempt >= this.maxRetries) throw error;
        logger.warn('Claim indexer RPC request failed; retrying', { label, attempt, nextDelayMs: delay, error: error.message });
        await sleep(delay);
        delay *= 2;
      }
    }
  }

  parseLog(log, chainId) {
    let parsed;
    try {
      parsed = this.identityInterface.parseLog({ topics: [...log.topics], data: log.data });
    } catch {
      return null;
    }
    if (!parsed || !CLAIM_EVENT_NAMES.has(parsed.name)) return null;
    return {
      chainId,
      identityAddress: ethers.getAddress(log.address),
      claimId: String(parsed.args.claimId),
      claimTopic: Number(parsed.args.topic),
      scheme: Number(parsed.args.scheme),
      issuerIdentityAddress: ethers.getAddress(parsed.args.issuer),
      data: parsed.args.data,
      signature: parsed.args.signature,
      uri: parsed.args.uri,
      eventName: parsed.name,
      txHash: String(log.transactionHash).toLowerCase(),
      blockNumber: Number(log.blockNumber),
      blockHash: log.blockHash || null,
      transactionIndex: Number(log.transactionIndex ?? 0),
      logIndex: Number(log.index),
    };
  }

  eventMatchesSubmission(event, submission) {
    if (event.scheme !== 1) return false;
    if (event.identityAddress.toLowerCase() !== String(submission.investorIdentityAddress).toLowerCase()) return false;
    if (event.issuerIdentityAddress.toLowerCase() !== String(submission.issuerIdentityAddress).toLowerCase()) return false;
    if (event.claimTopic !== Number(submission.claimTopic)) return false;
    if (!hexEqual(event.data, submission.data) || !hexEqual(event.signature, submission.signature)) return false;
    const expectedClaimId = buildOnchainClaimId(submission.issuerIdentityAddress, submission.claimTopic);
    return expectedClaimId.toLowerCase() === event.claimId.toLowerCase();
  }

  async reconcileEvent(event) {
    const existingOwner = await this.submissionRepository.findByEvent(event.txHash, event.logIndex);
    if (existingOwner) {
      await this.indexerRepository.markEvent(event.claimEventUid, {
        status: 'MATCHED', matchedSubmissionUid: existingOwner.submissionUid, message: 'Event was already linked to a confirmed submission.',
      });
      return 'MATCHED';
    }

    const candidates = await this.submissionRepository.findChainMatchCandidates({
      identityAddress: event.identityAddress,
      issuerIdentityAddress: event.issuerIdentityAddress,
      claimTopic: event.claimTopic,
    });
    const submission = candidates.find((candidate) => this.eventMatchesSubmission(event, candidate));
    if (!submission) {
      await this.indexerRepository.markEvent(event.claimEventUid, {
        status: 'UNMATCHED', message: 'No existing claim submission matches the indexed event yet.',
      });
      return 'UNMATCHED';
    }

    const confirmed = await this.transactionRunner(async (connection) => {
      const updated = await this.submissionRepository.confirmFromEvent(submission.submissionUid, event, connection);
      if (!updated) return false;
      await this.indexerRepository.markEvent(event.claimEventUid, {
        status: 'MATCHED', matchedSubmissionUid: submission.submissionUid, message: 'Submission confirmed from indexed on-chain event.',
      }, connection);
      return true;
    });
    if (!confirmed) return 'RACE';

    if (this.recoveryService) {
      await this.recoveryService.finalizeInterestIfComplete(submission).catch((error) => {
        logger.warn('Claim indexer confirmed submission but could not finalize the interest', {
          submissionUid: submission.submissionUid, error: error.message,
        });
      });
    }
    return 'MATCHED';
  }

  async processStoredEvents(chainId, limit, stats) {
    const events = await this.indexerRepository.listProcessableEvents(chainId, limit);
    for (const event of events) {
      try {
        const result = await this.reconcileEvent(event);
        if (result === 'MATCHED') stats.eventsMatched += 1;
        else stats.eventsUnmatched += 1;
      } catch (error) {
        stats.eventErrors += 1;
        await this.indexerRepository.markEvent(event.claimEventUid, {
          status: 'FAILED', message: error.message,
        }).catch(() => {});
        logger.warn('Claim indexer could not process stored event', {
          claimEventUid: event.claimEventUid, txHash: event.txHash, error: error.message,
        });
      }
    }
  }

  async reconcileSubmissionFromStoredEvent(submission) {
    const chainId = Number(this.config.chainId);
    const events = await this.indexerRepository.findEventsForClaim({
      chainId,
      identityAddress: submission.investorIdentityAddress,
      issuerIdentityAddress: submission.issuerIdentityAddress,
      claimTopic: Number(submission.claimTopic),
    });
    const event = events.find((row) => this.eventMatchesSubmission(row, submission));
    if (!event) return null;
    await this.reconcileEvent(event);
    return this.submissionRepository.findByUid(submission.submissionUid);
  }

  async run() {
    const startedAt = Date.now();
    const stats = {
      enabled: true, leaseAcquired: false, chainId: null, latestBlock: null, safeLatestBlock: null,
      identityCount: 0, chunksProcessed: 0, rpcLogQueries: 0, logsFound: 0, eventsStored: 0,
      eventsMatched: 0, eventsUnmatched: 0, eventErrors: 0, retries: 0, durationMs: 0,
    };
    if (!(await this.isEnabled())) {
      stats.enabled = false;
      stats.durationMs = Date.now() - startedAt;
      return stats;
    }
    if (!this.isConfigured()) {
      stats.enabled = false;
      stats.durationMs = Date.now() - startedAt;
      logger.warn('Claim indexer is not configured; RPC URL is missing');
      return stats;
    }

    const blockOffset = Math.max(1, Math.trunc(await this.getNumber(SETTING_KEYS.blockOffset, DEFAULTS.blockOffset)));
    const confirmationBlocks = Math.max(0, Math.trunc(await this.getNumber(SETTING_KEYS.confirmationBlocks, DEFAULTS.confirmationBlocks)));
    const addressBatchSize = Math.max(1, Math.trunc(await this.getNumber(SETTING_KEYS.addressBatchSize, DEFAULTS.addressBatchSize)));
    const eventBatchSize = Math.max(1, Math.trunc(await this.getNumber(SETTING_KEYS.eventBatchSize, DEFAULTS.eventBatchSize)));
    const leaseSeconds = Math.max(10, Math.trunc(await this.getNumber(SETTING_KEYS.leaseSeconds, DEFAULTS.leaseSeconds)));
    const maxChunksPerRun = Math.max(1, Math.trunc(await this.getNumber(SETTING_KEYS.maxChunksPerRun, DEFAULTS.maxChunksPerRun)));
    const startBlockSetting = Number(await this.getSettingRaw(SETTING_KEYS.startBlock));
    const environmentStartBlock = Number(this.config.claimIndexerStartBlock || DEFAULTS.startBlock);
    // A database value of zero means "use the deployment/environment start block". This keeps a
    // fresh production install from silently indexing only the most recent chunk when the factory
    // deployment block is already configured in the environment.
    const configuredStartBlock = Math.max(0, Math.trunc(
      Number.isFinite(startBlockSetting) && startBlockSetting > 0 ? startBlockSetting : environmentStartBlock,
    ));

    let provider;
    let chainId;
    let leased = false;
    let runError = null;
    try {
      provider = this.providerFactory(this.config.sepoliaRpcUrl);
      const network = await provider.getNetwork();
      chainId = Number(network.chainId);
      stats.chainId = chainId;
      const supported = Array.isArray(this.config.supportedChainIds) ? this.config.supportedChainIds.map(Number) : [Number(this.config.chainId)];
      if (!supported.includes(chainId)) throw new Error(`Claim indexer RPC is connected to unsupported chain ${chainId}.`);

      await this.indexerRepository.ensureCheckpoint(INDEXER_NAME, chainId, configuredStartBlock);
      leased = await this.indexerRepository.acquireLease(INDEXER_NAME, chainId, this.leaseOwner, leaseSeconds);
      stats.leaseAcquired = leased;
      if (!leased) {
        stats.durationMs = Date.now() - startedAt;
        return stats;
      }

      let checkpoint = await this.indexerRepository.findCheckpoint(INDEXER_NAME, chainId);
      const latestBlock = Number(await this.withRetry(() => provider.getBlockNumber(), 'getBlockNumber', stats));
      const safeLatestBlock = latestBlock - confirmationBlocks;
      stats.latestBlock = latestBlock;
      stats.safeLatestBlock = safeLatestBlock;

      if (checkpoint.lastIndexedBlock > 0 && checkpoint.lastIndexedBlockHash) {
        const checkpointBlock = await this.withRetry(
          () => provider.getBlock(Number(checkpoint.lastIndexedBlock)), `getBlock ${checkpoint.lastIndexedBlock}`, stats,
        );
        if (!checkpointBlock || String(checkpointBlock.hash).toLowerCase() !== String(checkpoint.lastIndexedBlockHash).toLowerCase()) {
          throw new Error(`Claim indexer checkpoint block ${checkpoint.lastIndexedBlock} is no longer canonical; manual rewind is required.`);
        }
      }

      const identities = (await this.indexerRepository.listIdentityAddresses()).filter(ethers.isAddress);
      const addressBatches = chunks(identities, addressBatchSize);
      stats.identityCount = identities.length;

      let from = Number(checkpoint.lastIndexedBlock) + 1;
      if (Number(checkpoint.lastIndexedBlock) <= 0) {
        const startBlock = Number(checkpoint.startBlock || configuredStartBlock);
        from = startBlock > 0 ? startBlock : Math.max(0, safeLatestBlock - blockOffset + 1);
      }

      while (from <= safeLatestBlock && stats.chunksProcessed < maxChunksPerRun) {
        const to = Math.min(from + blockOffset - 1, safeLatestBlock);
        const parsedEvents = [];
        for (const addressBatch of addressBatches) {
          const logs = await this.withRetry(() => provider.getLogs({
            address: addressBatch,
            topics: [this.claimTopics],
            fromBlock: from,
            toBlock: to,
          }), `getLogs ${from}-${to} (${addressBatch.length} identities)`, stats);
          stats.rpcLogQueries += 1;
          stats.logsFound += logs.length;
          for (const log of logs) {
            const parsed = this.parseLog(log, chainId);
            if (parsed) parsedEvents.push(parsed);
          }
        }

        const toBlock = await this.withRetry(() => provider.getBlock(to), `getBlock ${to}`, stats);
        await this.transactionRunner(async (connection) => {
          await this.indexerRepository.storeEvents(parsedEvents, connection);
          const advanced = await this.indexerRepository.advanceCheckpoint(
            INDEXER_NAME, chainId, this.leaseOwner, to, toBlock ? toBlock.hash : null, connection,
          );
          if (!advanced) throw new Error('Claim indexer lost its database lease before checkpoint advancement.');
        });
        stats.eventsStored += parsedEvents.length;
        stats.chunksProcessed += 1;
        await this.indexerRepository.renewLease(INDEXER_NAME, chainId, this.leaseOwner, leaseSeconds);
        from = to + 1;
        checkpoint = { ...checkpoint, lastIndexedBlock: to, lastIndexedBlockHash: toBlock ? toBlock.hash : null };
      }

      await this.processStoredEvents(chainId, eventBatchSize, stats);
    } catch (error) {
      runError = error;
      stats.eventErrors += 1;
      logger.error('Claim indexer run failed', { error: { message: error.message, stack: error.stack } });
    } finally {
      if (leased && chainId) {
        await this.indexerRepository.releaseLease(
          INDEXER_NAME, chainId, this.leaseOwner, runError ? runError.message : null,
        ).catch((error) => logger.error('Claim indexer could not release its lease', { error: error.message }));
      }
      if (provider && typeof provider.destroy === 'function') provider.destroy();
    }
    stats.durationMs = Date.now() - startedAt;
    logger.info('Claim indexer run completed', stats);
    return stats;
  }
}

module.exports = { ClaimIndexerService, INDEXER_NAME, SETTING_KEYS, DEFAULTS };
