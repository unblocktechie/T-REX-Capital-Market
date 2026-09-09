const crypto = require('node:crypto');
const ethers = require('ethers');
const { env } = require('../../core/config/env');
const { withTransaction } = require('../../database/connection');
const { logger } = require('../common/log.service');
const {
  IDENTITY_REGISTRY_ABI,
  RegistryVerificationError,
} = require('./identity-registry-verifier.service');

const INDEXER_NAME = 'identityRegistryRegistration';
const SETTING_KEYS = {
  enabled: 'RegistryIndexerEnabled',
  intervalSeconds: 'RegistryIndexerIntervalSeconds',
  startBlock: 'RegistryIndexerStartBlock',
  blockOffset: 'RegistryIndexerBlockOffset',
  confirmationBlocks: 'RegistryIndexerConfirmationBlocks',
  addressBatchSize: 'RegistryIndexerAddressBatchSize',
  eventBatchSize: 'RegistryIndexerEventBatchSize',
  leaseSeconds: 'RegistryIndexerLeaseSeconds',
  maxChunksPerRun: 'RegistryIndexerMaxChunksPerRun',
  recoveryBatchSize: 'RegistryRecoveryBatchSize',
  recoveryLookbackBlocks: 'RegistryRecoveryLookbackBlocks',
};
const DEFAULTS = {
  intervalSeconds: 15, blockOffset: 1000, confirmationBlocks: 12, addressBatchSize: 100,
  eventBatchSize: 200, leaseSeconds: 120, maxChunksPerRun: 20, recoveryBatchSize: 100,
  recoveryLookbackBlocks: 200000,
};

const chunk = (values, size) => {
  const groups = [];
  for (let index = 0; index < values.length; index += size) groups.push(values.slice(index, index + size));
  return groups;
};

class IdentityRegistryReconciliationService {
  constructor({
    settingRepository,
    repository,
    checkpointRepository,
    verifier,
    finalizationService,
    config = env.blockchain,
    transactionRunner = withTransaction,
    dependencies = {},
  }) {
    this.settingRepository = settingRepository;
    this.repository = repository;
    this.checkpointRepository = checkpointRepository;
    this.verifier = verifier;
    this.finalizationService = finalizationService;
    this.config = config;
    this.transactionRunner = transactionRunner;
    this.providerFactory = dependencies.providerFactory || ((rpcUrl) => new ethers.JsonRpcProvider(rpcUrl));
    this.interface = dependencies.registryInterface || new ethers.Interface(IDENTITY_REGISTRY_ABI);
    this.eventTopic = this.interface.getEvent('IdentityRegistered').topicHash;
    this.leaseOwner = dependencies.leaseOwner || `${process.pid}-${crypto.randomUUID()}`;
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
    const value = await this.getSettingRaw(key);
    if (value === undefined || value === null || value === '') return fallback;
    return String(value).toLowerCase() === 'true';
  }

  expected(row) {
    return {
      chainId: Number(row.chainId),
      identityRegistryAddress: row.identityRegistryAddress,
      issuerWalletAddress: row.issuerWalletAddress,
      investorWalletAddress: row.investorWalletAddress,
      investorIdentityAddress: row.investorIdentityAddress,
      countryCode: Number(row.countryCode),
    };
  }

  parseLog(log, chainId) {
    let parsed;
    try {
      parsed = this.interface.parseLog({ topics: [...log.topics], data: log.data });
    } catch {
      return null;
    }
    if (parsed?.name !== 'IdentityRegistered') return null;
    return {
      chainId,
      identityRegistryAddress: ethers.getAddress(log.address),
      investorWalletAddress: ethers.getAddress(parsed.args.investorAddress ?? parsed.args[0]),
      investorIdentityAddress: ethers.getAddress(parsed.args.identity ?? parsed.args[1]),
      eventName: parsed.name,
      txHash: String(log.transactionHash).toLowerCase(),
      blockNumber: Number(log.blockNumber),
      blockHash: log.blockHash || null,
      transactionIndex: Number(log.transactionIndex ?? 0),
      logIndex: Number(log.index ?? log.logIndex ?? 0),
    };
  }

  async confirmFromHash(registration, txHash) {
    const owner = await this.repository.findByTxHash(txHash);
    if (owner && owner.registryRegistrationUid !== registration.registryRegistrationUid) {
      throw new RegistryVerificationError('TRANSACTION_ALREADY_USED', 'Transaction belongs to another registry operation.');
    }
    if (!registration.txHash) {
      registration = await this.repository.assignTransaction(registration.registryRegistrationUid, txHash);
      if (String(registration.txHash || '').toLowerCase() !== String(txHash).toLowerCase()) {
        throw new RegistryVerificationError('REGISTRY_TRANSACTION_ALREADY_ASSIGNED', 'Operation is already awaiting another transaction.');
      }
    }
    const verified = await this.verifier.verifyRegistration({ txHash, ...this.expected(registration) });
    const finalized = await this.finalizationService.finalizeConfirmedOperation(
      registration.registryRegistrationUid,
      verified,
    );
    return finalized.operation;
  }

  async reconcileEvent(event) {
    const registration = await this.repository.findPendingForEvent(event);
    if (!registration) {
      await this.repository.markEvent(event.registryEventUid, 'UNMATCHED', null, 'No matching PENDING registry operation exists yet.');
      return 'UNMATCHED';
    }
    try {
      const confirmed = await this.confirmFromHash(registration, event.txHash);
      if (confirmed.status !== 'CONFIRMED') throw new Error('Conditional confirmation did not update the operation.');
      await this.repository.markEvent(event.registryEventUid, 'MATCHED', registration.registryRegistrationUid, 'Operation independently verified and confirmed.');
      return 'MATCHED';
    } catch (error) {
      await this.repository.markEvent(event.registryEventUid, 'FAILED', registration.registryRegistrationUid, error.message);
      if (error instanceof RegistryVerificationError && !error.transient && !error.pending) {
        await this.repository.recordError(registration.registryRegistrationUid, error.code, error.message, { retrySeconds: null });
      }
      throw error;
    }
  }

  async processStoredEvents(chainId, limit, stats) {
    const events = await this.repository.listProcessableEvents(chainId, limit);
    for (const event of events) {
      try {
        const result = await this.reconcileEvent(event);
        if (result === 'MATCHED') stats.eventsMatched += 1;
        else stats.eventsUnmatched += 1;
      } catch (error) {
        stats.errors += 1;
        logger.warn('Registry indexer could not reconcile a stored event', {
          registryEventUid: event.registryEventUid, txHash: event.txHash, error: error.message,
        });
      }
    }
  }

  async recoverCandidate(candidate, provider, chainId, safeLatestBlock, lookbackBlocks, stats) {
    if (!(await this.repository.markSyncProcessing(candidate.registryRegistrationUid))) return;
    try {
      if (candidate.txHash) {
        await this.confirmFromHash(candidate, candidate.txHash);
        stats.recovered += 1;
        return;
      }

      const state = await this.verifier.inspectRegistryState(this.expected(candidate));
      if (!state.contains) {
        await this.repository.finishSync(candidate.registryRegistrationUid, {
          lastScannedBlock: safeLatestBlock, errorCode: null, errorMessage: null, retrySeconds: 60,
        });
        return;
      }
      if (!state.matches) {
        await this.repository.finishSync(candidate.registryRegistrationUid, {
          lastScannedBlock: safeLatestBlock,
          errorCode: 'REGISTRY_STATE_MISMATCH',
          errorMessage: 'Investor is registered, but identity or country does not match the pending operation.',
          retrySeconds: null,
        });
        return;
      }

      const floor = Math.max(0, safeLatestBlock - lookbackBlocks + 1);
      const prepared = Number(candidate.preparedAtBlock || floor);
      const lastScanned = Number(candidate.lastScannedBlock || 0);
      const fromBlock = Math.max(floor, prepared - 2, lastScanned > 0 ? lastScanned + 1 : 0);
      if (fromBlock > safeLatestBlock) {
        await this.repository.finishSync(candidate.registryRegistrationUid, { lastScannedBlock: safeLatestBlock, retrySeconds: 30 });
        return;
      }
      const walletTopic = ethers.zeroPadValue(candidate.investorWalletAddress, 32);
      const identityTopic = ethers.zeroPadValue(candidate.investorIdentityAddress, 32);
      const logs = await provider.getLogs({
        address: candidate.identityRegistryAddress,
        topics: [this.eventTopic, walletTopic, identityTopic],
        fromBlock,
        toBlock: safeLatestBlock,
      });
      stats.rpcLogQueries += 1;
      const events = logs.map((log) => this.parseLog(log, chainId)).filter(Boolean).reverse();
      for (const event of events) {
        try {
          await this.confirmFromHash(candidate, event.txHash);
          await this.repository.storeEvents([event]);
          stats.recovered += 1;
          return;
        } catch (error) {
          if (error.transient || error.pending) throw error;
        }
      }
      await this.repository.finishSync(candidate.registryRegistrationUid, {
        lastScannedBlock: safeLatestBlock,
        errorCode: 'REGISTRY_EVENT_NOT_FOUND',
        errorMessage: 'Matching final state exists, but the authoritative IdentityRegistered transaction is not indexed yet.',
        retrySeconds: 60,
      });
    } catch (error) {
      stats.errors += 1;
      await this.repository.finishSync(candidate.registryRegistrationUid, {
        lastScannedBlock: safeLatestBlock,
        errorCode: error.code || 'REGISTRY_RECOVERY_FAILED',
        errorMessage: error.message,
        retrySeconds: error.transient || error.pending ? 30 : 120,
      }).catch(() => {});
    }
  }

  async run() {
    const startedAt = Date.now();
    const stats = {
      enabled: true, leaseAcquired: false, chainId: null, latestBlock: null, safeLatestBlock: null,
      registryCount: 0, chunksProcessed: 0, rpcLogQueries: 0, eventsStored: 0,
      eventsMatched: 0, eventsUnmatched: 0, recoveryCandidates: 0, recovered: 0, errors: 0, durationMs: 0,
    };
    if (!(await this.getBoolean(SETTING_KEYS.enabled, true)) || !this.config.sepoliaRpcUrl) {
      stats.enabled = false;
      stats.durationMs = Date.now() - startedAt;
      return stats;
    }

    const blockOffset = Math.max(1, Math.trunc(await this.getNumber(SETTING_KEYS.blockOffset, DEFAULTS.blockOffset)));
    const confirmationBlocks = Math.max(0, Math.trunc(await this.getNumber(SETTING_KEYS.confirmationBlocks, DEFAULTS.confirmationBlocks)));
    const addressBatchSize = Math.max(1, Math.trunc(await this.getNumber(SETTING_KEYS.addressBatchSize, DEFAULTS.addressBatchSize)));
    const eventBatchSize = Math.max(1, Math.trunc(await this.getNumber(SETTING_KEYS.eventBatchSize, DEFAULTS.eventBatchSize)));
    const leaseSeconds = Math.max(10, Math.trunc(await this.getNumber(SETTING_KEYS.leaseSeconds, DEFAULTS.leaseSeconds)));
    const maxChunks = Math.max(1, Math.trunc(await this.getNumber(SETTING_KEYS.maxChunksPerRun, DEFAULTS.maxChunksPerRun)));
    const recoveryBatchSize = Math.max(1, Math.trunc(await this.getNumber(SETTING_KEYS.recoveryBatchSize, DEFAULTS.recoveryBatchSize)));
    const lookbackBlocks = Math.max(blockOffset, Math.trunc(await this.getNumber(SETTING_KEYS.recoveryLookbackBlocks, DEFAULTS.recoveryLookbackBlocks)));

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
      if (!supported.includes(chainId)) throw new Error(`Registry indexer RPC is connected to unsupported chain ${chainId}.`);

      const settingStart = Number(await this.getSettingRaw(SETTING_KEYS.startBlock));
      const databaseStart = await this.repository.findIndexerStartBlock();
      const configuredStart = Math.max(0, Math.trunc(settingStart > 0 ? settingStart : (this.config.registryIndexerStartBlock || databaseStart || 0)));
      await this.checkpointRepository.ensureCheckpoint(INDEXER_NAME, chainId, configuredStart);
      leased = await this.checkpointRepository.acquireLease(INDEXER_NAME, chainId, this.leaseOwner, leaseSeconds);
      stats.leaseAcquired = leased;
      if (!leased) return stats;

      let checkpoint = await this.checkpointRepository.findCheckpoint(INDEXER_NAME, chainId);
      const latestBlock = Number(await provider.getBlockNumber());
      const safeLatestBlock = Math.max(0, latestBlock - confirmationBlocks);
      stats.latestBlock = latestBlock;
      stats.safeLatestBlock = safeLatestBlock;

      if (Number(checkpoint.lastIndexedBlock) > 0 && checkpoint.lastIndexedBlockHash) {
        const block = await provider.getBlock(Number(checkpoint.lastIndexedBlock));
        if (!block || String(block.hash).toLowerCase() !== String(checkpoint.lastIndexedBlockHash).toLowerCase()) {
          const rewindTo = Math.max(Number(checkpoint.startBlock || configuredStart), Number(checkpoint.lastIndexedBlock) - blockOffset);
          const rewindBlock = rewindTo > 0 ? await provider.getBlock(rewindTo) : null;
          await this.transactionRunner(async (connection) => {
            await this.repository.rewindAfterBlock(chainId, rewindTo, connection);
            const rewound = await this.checkpointRepository.advanceCheckpoint(
              INDEXER_NAME, chainId, this.leaseOwner, rewindTo, rewindBlock?.hash || null, connection,
            );
            if (!rewound) throw new Error('Registry indexer lost its lease while rewinding a reorganization.');
          });
          checkpoint = { ...checkpoint, lastIndexedBlock: rewindTo, lastIndexedBlockHash: rewindBlock?.hash || null };
          logger.warn('Registry indexer rewound a non-canonical checkpoint', { rewindTo });
        }
      }

      const addresses = (await this.repository.listRegistryAddresses()).filter(ethers.isAddress);
      stats.registryCount = addresses.length;
      const batches = chunk(addresses, addressBatchSize);
      let from = Number(checkpoint.lastIndexedBlock) + 1;
      if (Number(checkpoint.lastIndexedBlock) <= 0) {
        const start = Number(checkpoint.startBlock || configuredStart);
        from = start > 0 ? start : Math.max(0, safeLatestBlock - blockOffset + 1);
      }
      while (from <= safeLatestBlock && stats.chunksProcessed < maxChunks) {
        const to = Math.min(safeLatestBlock, from + blockOffset - 1);
        const events = [];
        for (const addressBatch of batches) {
          const logs = await provider.getLogs({ address: addressBatch, topics: [this.eventTopic], fromBlock: from, toBlock: to });
          stats.rpcLogQueries += 1;
          for (const log of logs) {
            const event = this.parseLog(log, chainId);
            if (event) events.push(event);
          }
        }
        const toBlock = await provider.getBlock(to);
        await this.transactionRunner(async (connection) => {
          await this.repository.storeEvents(events, connection);
          const advanced = await this.checkpointRepository.advanceCheckpoint(
            INDEXER_NAME, chainId, this.leaseOwner, to, toBlock?.hash || null, connection,
          );
          if (!advanced) throw new Error('Registry indexer lost its database lease.');
        });
        stats.eventsStored += events.length;
        stats.chunksProcessed += 1;
        await this.checkpointRepository.renewLease(INDEXER_NAME, chainId, this.leaseOwner, leaseSeconds);
        from = to + 1;
      }

      await this.processStoredEvents(chainId, eventBatchSize, stats);
      const candidates = await this.repository.findRecoveryCandidates(recoveryBatchSize);
      stats.recoveryCandidates = candidates.length;
      for (const candidate of candidates) {
        await this.recoverCandidate(candidate, provider, chainId, safeLatestBlock, lookbackBlocks, stats);
      }
    } catch (error) {
      runError = error;
      stats.errors += 1;
      logger.error('Identity Registry reconciliation run failed', { error: { message: error.message, stack: error.stack } });
    } finally {
      if (leased && chainId) {
        await this.checkpointRepository.releaseLease(
          INDEXER_NAME, chainId, this.leaseOwner, runError ? runError.message : null,
        ).catch(() => {});
      }
      if (provider && typeof provider.destroy === 'function') provider.destroy();
      stats.durationMs = Date.now() - startedAt;
      logger.info('Identity Registry reconciliation run completed', stats);
    }
    return stats;
  }
}

module.exports = { IdentityRegistryReconciliationService, INDEXER_NAME, SETTING_KEYS, DEFAULTS };
