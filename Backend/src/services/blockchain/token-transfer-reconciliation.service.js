const crypto = require('node:crypto');
const { env } = require('../../core/config/env');
const { withTransaction } = require('../../database/connection');
const { logger } = require('../common/log.service');
const { TokenTransferBlockchainError } = require('./token-transfer-blockchain.service');

const INDEXER_NAME = 'tokenTransfer';
const SETTING_KEYS = {
  enabled: 'TransferWorkerEnabled',
  intervalSeconds: 'TransferWorkerIntervalSeconds',
  blockOffset: 'TransferIndexerBlockOffset',
  confirmationBlocks: 'TransferIndexerConfirmationBlocks',
  addressBatchSize: 'TransferIndexerAddressBatchSize',
  eventBatchSize: 'TransferEventBatchSize',
  leaseSeconds: 'TransferWorkerLeaseSeconds',
  batchSize: 'TransferWorkerBatchSize',
  maxChunksPerRun: 'TransferIndexerMaxChunksPerRun',
  expirationBatchSize: 'TransferExpirationBatchSize',
  expirationGraceSeconds: 'TransferIntentExpiryGraceSeconds',
};
const DEFAULTS = {
  intervalSeconds: 15,
  blockOffset: 1000,
  confirmationBlocks: 2,
  addressBatchSize: 100,
  eventBatchSize: 200,
  leaseSeconds: 180,
  batchSize: 50,
  maxChunksPerRun: 10,
  expirationBatchSize: 50,
  expirationGraceSeconds: 180,
};

class TokenTransferReconciliationService {
  constructor({
    settingRepository,
    repository,
    checkpointRepository,
    blockchain,
    config = env.blockchain,
    transactionRunner = withTransaction,
    dependencies = {},
  }) {
    this.settingRepository = settingRepository;
    this.repository = repository;
    this.checkpointRepository = checkpointRepository;
    this.blockchain = blockchain;
    this.config = config;
    this.transactionRunner = transactionRunner;
    this.leaseOwner = dependencies.leaseOwner || `${process.pid}-${crypto.randomUUID()}`;
  }

  async setting(key) { return (await this.settingRepository.findByKey(key))?.settingValue; }
  async getNumber(key, fallback) {
    const value = Number(await this.setting(key));
    return Number.isFinite(value) ? value : fallback;
  }
  async getBoolean(key, fallback) {
    const value = await this.setting(key);
    return value === undefined ? fallback : String(value).toLowerCase() === 'true';
  }

  expected(row) {
    return {
      chainId: Number(row.chainId),
      tokenAddress: row.tokenAddress,
      identityRegistryAddress: row.identityRegistryAddress,
      senderWalletAddress: row.senderWalletAddress,
      recipientWalletAddress: row.recipientWalletAddress,
      senderIdentityAddress: row.senderIdentityAddress,
      recipientIdentityAddress: row.recipientIdentityAddress,
      tokenAmountRaw: String(row.tokenAmountRaw),
    };
  }

  async finalize(row, txHash, confirmations) {
    const used = await this.repository.findByTxHash(txHash);
    if (used && used.transferUid !== row.transferUid) {
      throw new TokenTransferBlockchainError('TRANSFER_TRANSACTION_ALREADY_USED', 'Transaction belongs to another transfer intent.');
    }
    row = await this.repository.assignHash(row.transferUid, txHash, false);
    const verified = await this.blockchain.verify(txHash, this.expected(row), { confirmations });
    await this.transactionRunner(async (connection) => {
      const changed = await this.repository.confirm(row.transferUid, verified, connection);
      if (!changed) {
        const current = await this.repository.findByUid(row.transferUid, connection);
        if (current?.status !== 'COMPLETED') {
          throw new TokenTransferBlockchainError('TRANSFER_STATE_CHANGED', 'Transfer changed during reconciliation.');
        }
      }
      await this.repository.recordTransaction(row.transferUid, txHash, 'CONFIRMED', verified, connection);
    });
    return this.repository.findByUid(row.transferUid);
  }

  async processEvents(chainId, limit, confirmations, stats) {
    for (const event of await this.repository.listEvents(chainId, limit)) {
      const row = await this.repository.findPendingForEvent(event);
      if (!row) {
        await this.repository.markEvent(event.transferEventUid, 'UNMATCHED', null, 'No exact pending transfer intent exists.');
        stats.eventsUnmatched += 1;
        continue;
      }
      try {
        await this.finalize(row, event.txHash, confirmations);
        await this.repository.markEvent(event.transferEventUid, 'MATCHED', row.transferUid, 'Transfer independently verified.');
        stats.eventsMatched += 1;
      } catch (error) {
        const pending = error instanceof TokenTransferBlockchainError && (error.pending || error.transient);
        await this.repository.markEvent(
          event.transferEventUid,
          pending ? 'NEW' : 'FAILED',
          row.transferUid,
          error.message,
        );
        if (pending) stats.pendingConfirmations += 1;
        else stats.errors += 1;
      }
    }
  }

  async reconcile(row, safeBlock, confirmations, stats) {
    if (!(await this.repository.markProcessing(row.transferUid))) return;
    row = await this.repository.findByUid(row.transferUid);
    try {
      let txHash = row.txHash;
      if (!txHash && safeBlock >= Number(row.preparedAtBlock)) {
        txHash = await this.blockchain.findEvent(this.expected(row), Number(row.preparedAtBlock), safeBlock);
        if (txHash) stats.hashesRecovered += 1;
      }
      if (!txHash) {
        await this.repository.schedulePending(row.transferUid, 30);
        return;
      }
      await this.repository.recordTransaction(row.transferUid, txHash, 'PENDING');
      await this.finalize(row, txHash, confirmations);
      stats.transfersConfirmed += 1;
    } catch (error) {
      const known = error instanceof TokenTransferBlockchainError;
      const retryable = known && (error.pending || error.transient);
      if (row.txHash) {
        await this.repository.recordTransaction(row.transferUid, row.txHash, retryable ? 'PENDING' : 'FAILED', {
          errorCode: retryable ? null : error.code,
          errorMessage: retryable ? null : error.message,
        });
      }
      if (retryable) {
        await this.repository.schedulePending(row.transferUid, 30);
        stats.pendingConfirmations += 1;
      } else {
        await this.repository.recordError(
          row.transferUid,
          error.code || 'TRANSFER_RECONCILIATION_FAILED',
          error.message,
          null,
        );
        stats.errors += 1;
        logger.warn('Token transfer reconciliation failed', {
          transferUid: row.transferUid,
          code: error.code,
          error: error.message,
        });
      }
    }
  }

  async run() {
    const stats = {
      enabled: true,
      leaseAcquired: true,
      blocksScanned: 0,
      eventsFound: 0,
      eventsMatched: 0,
      eventsUnmatched: 0,
      transfersConfirmed: 0,
      hashesRecovered: 0,
      transfersExpired: 0,
      expirationDeferred: false,
      pendingConfirmations: 0,
      errors: 0,
    };
    if (!this.config.transferWorkerEnabled || !(await this.getBoolean(SETTING_KEYS.enabled, true))) {
      return { ...stats, enabled: false };
    }
    const head = await this.blockchain.chainHead();
    const confirmations = Math.max(1, await this.getNumber(
      SETTING_KEYS.confirmationBlocks,
      this.config.transferIndexerConfirmations || DEFAULTS.confirmationBlocks,
    ));
    const safeBlock = Math.max(0, head.latestBlock - confirmations);
    const blockOffset = Math.max(1, await this.getNumber(SETTING_KEYS.blockOffset, DEFAULTS.blockOffset));
    const pendingStart = await this.repository.earliestPreparedBlock();
    const configuredStart = Number(this.config.transferIndexerStartBlock || 0);
    const startBlock = configuredStart || pendingStart || Math.max(0, safeBlock - blockOffset + 1);
    await this.checkpointRepository.ensureCheckpoint(INDEXER_NAME, head.chainId, startBlock);
    const leaseSeconds = await this.getNumber(SETTING_KEYS.leaseSeconds, DEFAULTS.leaseSeconds);
    if (!(await this.checkpointRepository.acquireLease(
      INDEXER_NAME,
      head.chainId,
      this.leaseOwner,
      leaseSeconds,
    ))) return { ...stats, leaseAcquired: false };

    try {
      const checkpoint = await this.checkpointRepository.findCheckpoint(INDEXER_NAME, head.chainId);
      let fromBlock = Number(checkpoint.lastIndexedBlock) > 0
        ? Number(checkpoint.lastIndexedBlock) + 1
        : Number(checkpoint.startBlock);
      const tokenAddresses = await this.repository.listIndexedTokenAddresses();
      const addressBatchSize = await this.getNumber(SETTING_KEYS.addressBatchSize, DEFAULTS.addressBatchSize);
      const maxChunks = await this.getNumber(SETTING_KEYS.maxChunksPerRun, DEFAULTS.maxChunksPerRun);
      for (let chunk = 0; fromBlock <= safeBlock && chunk < maxChunks; chunk += 1) {
        const toBlock = Math.min(safeBlock, fromBlock + blockOffset - 1);
        const events = await this.blockchain.scanEvents(tokenAddresses, fromBlock, toBlock, addressBatchSize);
        await this.repository.storeEvents(events);
        await this.checkpointRepository.advanceCheckpoint(
          INDEXER_NAME,
          head.chainId,
          this.leaseOwner,
          toBlock,
          await this.blockchain.blockHash(toBlock),
        );
        stats.blocksScanned += toBlock - fromBlock + 1;
        stats.eventsFound += events.length;
        fromBlock = toBlock + 1;
      }

      await this.processEvents(
        head.chainId,
        await this.getNumber(SETTING_KEYS.eventBatchSize, DEFAULTS.eventBatchSize),
        confirmations,
        stats,
      );
      for (const candidate of await this.repository.listRecoveryCandidates(
        await this.getNumber(SETTING_KEYS.batchSize, DEFAULTS.batchSize),
      )) {
        await this.reconcile(candidate, safeBlock, confirmations, stats);
      }
      if (fromBlock > safeBlock) {
        stats.transfersExpired = await this.repository.expireAbandoned(
          await this.getNumber(SETTING_KEYS.expirationBatchSize, DEFAULTS.expirationBatchSize),
          await this.getNumber(SETTING_KEYS.expirationGraceSeconds, DEFAULTS.expirationGraceSeconds),
        );
      } else {
        stats.expirationDeferred = true;
      }
      await this.checkpointRepository.releaseLease(INDEXER_NAME, head.chainId, this.leaseOwner);
      return stats;
    } catch (error) {
      await this.checkpointRepository.releaseLease(INDEXER_NAME, head.chainId, this.leaseOwner, error.message);
      throw error;
    }
  }
}

module.exports = {
  TokenTransferReconciliationService,
  INDEXER_NAME,
  SETTING_KEYS,
  DEFAULTS,
};
