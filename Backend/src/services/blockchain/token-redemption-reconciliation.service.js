const crypto = require('node:crypto');
const { env } = require('../../core/config/env');
const { logger } = require('../common/log.service');
const { withTransaction } = require('../../database/connection');
const { RedemptionBlockchainError } = require('./token-redemption-blockchain.service');

const REDEMPTION_INDEXER_NAME = 'tokenRedemptionPayment';
const REDEMPTION_SETTING_KEYS = Object.freeze({
  enabled: 'RedemptionWorkerEnabled', intervalSeconds: 'RedemptionWorkerIntervalSeconds',
  blockOffset: 'RedemptionIndexerBlockOffset', confirmationBlocks: 'RedemptionConfirmationBlocks',
  leaseSeconds: 'RedemptionWorkerLeaseSeconds', batchSize: 'RedemptionWorkerBatchSize',
  eventBatchSize: 'RedemptionEventBatchSize', maxChunksPerRun: 'RedemptionIndexerMaxChunksPerRun',
  expirationBatchSize: 'RedemptionExpirationBatchSize',
});
const REDEMPTION_DEFAULTS = Object.freeze({
  intervalSeconds: 15, blockOffset: 1000, confirmationBlocks: 12, leaseSeconds: 180,
  batchSize: 50, eventBatchSize: 200, maxChunksPerRun: 10, expirationBatchSize: 50,
});

class TokenRedemptionReconciliationService {
  constructor({ settingRepository, repository, checkpointRepository, blockchain, executionService, redemptionService,
    config = env.blockchain, transactionRunner = withTransaction, dependencies = {} }) {
    this.settingRepository = settingRepository; this.repository = repository;
    this.checkpointRepository = checkpointRepository; this.blockchain = blockchain;
    this.executionService = executionService; this.redemptionService = redemptionService;
    this.config = config; this.transactionRunner = transactionRunner;
    this.leaseOwner = dependencies.leaseOwner || `${process.pid}-${crypto.randomUUID()}`;
  }

  async setting(key) { return (await this.settingRepository.findByKey(key))?.settingValue; }
  async getNumber(key, fallback) { const value = Number(await this.setting(key)); return Number.isFinite(value) ? value : fallback; }
  async getBoolean(key, fallback) { const value = await this.setting(key); return value === undefined ? fallback : String(value).toLowerCase() === 'true'; }
  expected(row) { return this.redemptionService.expected(row); }

  async finalizeAction(row, action, verified) {
    await this.transactionRunner(async (connection) => {
      const current = await this.repository.findForUpdate(row.redemptionUid, connection);
      if (!current) return;
      const prefix = action.toLowerCase();
      const metadata = {
        [`${prefix}Status`]: 'CONFIRMED', [`${prefix}TxHash`]: verified.txHash,
        [`${prefix}BlockNumber`]: verified.blockNumber, [`${prefix}BlockHash`]: verified.blockHash,
        [`${prefix}TransactionIndex`]: verified.transactionIndex, [`${prefix}LogIndex`]: verified.logIndex,
        [`${prefix}GasUsed`]: verified.gasUsed, [`${prefix}EffectiveGasPrice`]: verified.effectiveGasPrice,
        [`${prefix}ConfirmedAt`]: new Date(), errorStage: null, errorCode: null, errorMessage: null,
      };
      let nextStatus; let extra = {};
      if (action === 'LOCK') {
        if (current.lockStatus === 'CONFIRMED' && ['TOKENS_LOCKED', 'CANCELLATION_PENDING'].includes(current.status)) return;
        if (!['TOKEN_LOCK_SUBMITTED', 'CANCELLATION_PENDING', 'ISSUER_APPROVED'].includes(current.status)) return;
        if (current.status === 'CANCELLATION_PENDING') {
          nextStatus = 'CANCELLATION_PENDING';
          extra = { unlockStatus: 'QUEUED', unlockAmountRaw: String(current.tokenAmountRaw), syncStatus: 'QUEUED', nextSyncAt: new Date() };
        } else {
          nextStatus = 'TOKENS_LOCKED';
          extra = { paymentStatus: 'AWAITING_ISSUER', paymentRequestedAtBlock: verified.blockNumber, syncStatus: 'IDLE', nextSyncAt: null };
        }
      } else if (action === 'BURN') {
        if (['BURN_CONFIRMED', 'UNLOCK_SUBMITTED', 'COMPLETED'].includes(current.status)) return;
        if (!['BURN_SUBMITTED', 'PAYMENT_CONFIRMED'].includes(current.status)) return;
        const extraFrozen = BigInt(verified.frozenAfterRaw) > BigInt(current.frozenBeforeRaw)
          ? BigInt(verified.frozenAfterRaw) - BigInt(current.frozenBeforeRaw) : 0n;
        const unlockAmount = extraFrozen > BigInt(current.tokenAmountRaw) ? BigInt(current.tokenAmountRaw) : extraFrozen;
        nextStatus = unlockAmount > 0n ? 'BURN_CONFIRMED' : 'COMPLETED';
        extra = unlockAmount > 0n
          ? { unlockStatus: 'QUEUED', unlockAmountRaw: unlockAmount.toString(), syncStatus: 'QUEUED', nextSyncAt: new Date() }
          : { unlockStatus: 'NOT_REQUIRED', syncStatus: 'IDLE', syncCompletedAt: new Date(), nextSyncAt: null };
      } else {
        if (['COMPLETED', 'CANCELLED'].includes(current.status)) return;
        if (current.status !== 'UNLOCK_SUBMITTED') return;
        nextStatus = current.paymentStatus === 'CONFIRMED' ? 'COMPLETED' : 'CANCELLED';
        extra = { syncStatus: 'IDLE', syncCompletedAt: new Date(), nextSyncAt: null };
      }
      const changed = await this.repository.transition(current.redemptionUid, current.status, {
        ...metadata, ...extra, status: nextStatus,
      }, connection);
      if (!changed) throw new RedemptionBlockchainError('REDEMPTION_STATE_CHANGED', `Redemption changed during ${action} finalization.`, { transient: true });
      await this.repository.recordTransaction(current.redemptionUid, action, verified.txHash, 'CONFIRMED', verified, connection);
      await this.repository.addHistory({
        redemptionUid: current.redemptionUid, eventType: `${action}_CONFIRMED`, fromStatus: current.status,
        toStatus: nextStatus, actorRole: 'system', message: `${action} transaction independently verified on-chain.`,
        metadata: { txHash: verified.txHash, blockNumber: verified.blockNumber },
      }, connection);
    });
  }

  async resetMissingAction(row, action) {
    if (action === 'LOCK' && row.status === 'CANCELLATION_PENDING') {
      await this.transactionRunner(async (connection) => {
        const changed = await this.repository.transition(row.redemptionUid, 'CANCELLATION_PENDING', {
          status: 'CANCELLED', lockStatus: 'NOT_REQUIRED', paymentStatus: 'NOT_REQUIRED',
          burnStatus: 'NOT_REQUIRED', unlockStatus: 'NOT_REQUIRED', syncStatus: 'IDLE', nextSyncAt: null,
        }, connection);
        if (changed) await this.repository.addHistory({
          redemptionUid: row.redemptionUid, eventType: 'CANCELLED', fromStatus: 'CANCELLATION_PENDING',
          toStatus: 'CANCELLED', actorRole: 'system', message: 'Cancellation completed; no token lock was found on-chain.',
        }, connection);
      });
      return null;
    }
    const definitions = {
      LOCK: { from: ['ISSUER_APPROVED', 'TOKEN_LOCK_SUBMITTED'], to: 'ISSUER_APPROVED', statusField: 'lockStatus', preparedField: 'lockPreparedAtBlock', hashField: 'lockTxHash' },
      BURN: { from: ['PAYMENT_CONFIRMED', 'BURN_SUBMITTED'], to: 'PAYMENT_CONFIRMED', statusField: 'burnStatus', preparedField: 'burnPreparedAtBlock', hashField: 'burnTxHash' },
      UNLOCK: { from: ['BURN_CONFIRMED', 'UNLOCK_SUBMITTED'], to: 'BURN_CONFIRMED', statusField: 'unlockStatus', preparedField: 'unlockPreparedAtBlock', hashField: 'unlockTxHash' },
    };
    const definition = { ...definitions[action] };
    if (action === 'UNLOCK' && row.paymentStatus !== 'CONFIRMED') {
      definition.from = ['CANCELLATION_PENDING', 'UNLOCK_SUBMITTED'];
      definition.to = 'CANCELLATION_PENDING';
    }
    await this.repository.transition(row.redemptionUid, definition.from, {
      status: definition.to, [definition.statusField]: 'QUEUED', [definition.preparedField]: null,
      [definition.hashField]: null, syncStatus: 'QUEUED', nextSyncAt: new Date(),
    });
    return this.repository.findByUid(row.redemptionUid);
  }

  async reconcileAction(row, action, safeBlock, stats) {
    const prefix = action.toLowerCase();
    const txHash = row[`${prefix}TxHash`]; const prepared = row[`${prefix}PreparedAtBlock`];
    if (txHash) {
      const verified = await this.blockchain.verifyAction(action, txHash, this.expected(row));
      await this.finalizeAction(row, action, verified); stats[`${prefix}sConfirmed`] += 1;
      return this.repository.findByUid(row.redemptionUid);
    }
    if (prepared !== null && prepared !== undefined) {
      if (safeBlock < Number(prepared)) { await this.repository.schedule(row.redemptionUid, 15); return row; }
      const recovered = await this.blockchain.findActionEvent(action, this.expected(row), Number(prepared), safeBlock);
      if (recovered) {
        const verified = await this.blockchain.verifyAction(action, recovered, this.expected(row));
        await this.finalizeAction(row, action, verified); stats.actionsRecovered += 1;
        return this.repository.findByUid(row.redemptionUid);
      }
      row = await this.resetMissingAction(row, action);
      if (!row) return null;
    }
    const result = await this.executionService.submit(action, row);
    if (result.submitted) stats[`${prefix}sSubmitted`] += 1;
    return result.row || row;
  }

  async processPaymentEvents(chainId, limit, stats) {
    for (const event of await this.repository.listPaymentEvents(chainId, limit)) {
      const row = await this.repository.findPendingForPaymentEvent(event);
      if (!row) {
        await this.repository.markPaymentEvent(event.redemptionPaymentEventUid, 'UNMATCHED', null, 'No exact payable redemption exists.');
        stats.eventsUnmatched += 1; continue;
      }
      try {
        const used = await this.repository.findByTransactionHash(event.txHash);
        if (used && used.redemptionUid !== row.redemptionUid) throw new RedemptionBlockchainError('TRANSACTION_ALREADY_USED', 'Payment hash belongs to another redemption.');
        const verified = await this.blockchain.verifyPayment(event.txHash, this.expected(row));
        await this.redemptionService.finalizePayment(row, verified);
        await this.repository.markPaymentEvent(event.redemptionPaymentEventUid, 'MATCHED', row.redemptionUid, 'Issuer payment independently verified.');
        await this.executionService.submit('BURN', await this.repository.findByUid(row.redemptionUid));
        stats.eventsMatched += 1;
      } catch (error) {
        await this.repository.markPaymentEvent(event.redemptionPaymentEventUid, 'FAILED', row.redemptionUid, error.message);
        stats.errors += 1;
      }
    }
  }

  async reconcileCandidate(candidate, safeBlock, stats) {
    if (!(await this.repository.markProcessing(candidate.redemptionUid))) return;
    let row = await this.repository.findByUid(candidate.redemptionUid);
    try {
      if (row.status === 'ISSUER_APPROVED') row = await this.reconcileAction(row, 'LOCK', safeBlock, stats);
      else if (row.status === 'TOKEN_LOCK_SUBMITTED') row = await this.reconcileAction(row, 'LOCK', safeBlock, stats);
      else if (row.status === 'CANCELLATION_PENDING') {
        if (row.lockStatus !== 'CONFIRMED') {
          row = (!row.lockTxHash && row.lockPreparedAtBlock === null)
            ? await this.resetMissingAction(row, 'LOCK')
            : await this.reconcileAction(row, 'LOCK', safeBlock, stats);
        }
        if (row && row.status === 'CANCELLATION_PENDING' && row.lockStatus === 'CONFIRMED') {
          if (!row.unlockAmountRaw) {
            await this.repository.transition(row.redemptionUid, 'CANCELLATION_PENDING', {
              unlockStatus: 'QUEUED', unlockAmountRaw: String(row.tokenAmountRaw), syncStatus: 'QUEUED', nextSyncAt: new Date(),
            });
            row = await this.repository.findByUid(row.redemptionUid);
          }
          row = await this.reconcileAction(row, 'UNLOCK', safeBlock, stats);
        }
      } else if (row.status === 'TOKENS_LOCKED') {
        await this.repository.schedule(row.redemptionUid, 60);
      } else if (row.status === 'PAYMENT_SUBMITTED') {
        if (!row.paymentTxHash) { await this.repository.schedule(row.redemptionUid, 30); return; }
        const verified = await this.blockchain.verifyPayment(row.paymentTxHash, this.expected(row));
        await this.redemptionService.finalizePayment(row, verified); stats.paymentsConfirmed += 1;
        row = await this.repository.findByUid(row.redemptionUid);
        await this.executionService.submit('BURN', row);
      } else if (row.status === 'PAYMENT_CONFIRMED') row = await this.reconcileAction(row, 'BURN', safeBlock, stats);
      else if (row.status === 'BURN_SUBMITTED') row = await this.reconcileAction(row, 'BURN', safeBlock, stats);
      else if (row.status === 'BURN_CONFIRMED') row = await this.reconcileAction(row, 'UNLOCK', safeBlock, stats);
      else if (row.status === 'UNLOCK_SUBMITTED') row = await this.reconcileAction(row, 'UNLOCK', safeBlock, stats);
      if (row && !['TOKENS_LOCKED', 'COMPLETED', 'CANCELLED'].includes(row.status)) await this.repository.schedule(row.redemptionUid, 15);
    } catch (error) {
      const known = error instanceof RedemptionBlockchainError;
      if (known && (error.pending || error.transient)) {
        await this.repository.recordError(row.redemptionUid, this.stage(row), error.code, error.message, 30);
        stats.pending += 1; return;
      }
      await this.transactionRunner(async (connection) => {
        const current = await this.repository.findForUpdate(row.redemptionUid, connection);
        if (!current || ['COMPLETED', 'CANCELLED'].includes(current.status)) return;
        await this.repository.transition(current.redemptionUid, current.status, {
          status: 'MANUAL_REVIEW', errorStage: this.stage(current),
          errorCode: error.code || 'REDEMPTION_RECONCILIATION_FAILED', errorMessage: String(error.message || error),
          syncStatus: 'FAILED', nextSyncAt: null,
        }, connection);
        await this.repository.addHistory({
          redemptionUid: current.redemptionUid, eventType: 'MANUAL_REVIEW_REQUIRED',
          fromStatus: current.status, toStatus: 'MANUAL_REVIEW', actorRole: 'system',
          message: String(error.message || error).slice(0, 1000),
        }, connection);
      });
      stats.errors += 1;
      logger.warn('Token redemption reconciliation failed', { redemptionUid: row.redemptionUid, code: error.code, error: error.message });
    }
  }

  stage(row) {
    if (['ISSUER_APPROVED', 'TOKEN_LOCK_SUBMITTED', 'CANCELLATION_PENDING'].includes(row.status) && row.lockStatus !== 'CONFIRMED') return 'LOCK';
    if (['TOKENS_LOCKED', 'PAYMENT_SUBMITTED'].includes(row.status)) return 'PAYMENT';
    if (['PAYMENT_CONFIRMED', 'BURN_SUBMITTED'].includes(row.status)) return 'BURN';
    if (['BURN_CONFIRMED', 'UNLOCK_SUBMITTED'].includes(row.status)) return 'UNLOCK';
    return 'SYSTEM';
  }

  async run() {
    const stats = { enabled: true, blocksScanned: 0, eventsFound: 0, eventsMatched: 0, eventsUnmatched: 0,
      expired: 0, paymentsConfirmed: 0, locksSubmitted: 0, locksConfirmed: 0,
      burnsSubmitted: 0, burnsConfirmed: 0, unlocksSubmitted: 0, unlocksConfirmed: 0,
      actionsRecovered: 0, pending: 0, errors: 0 };
    if (!this.config.redemptionWorkerEnabled || !(await this.getBoolean(REDEMPTION_SETTING_KEYS.enabled, true))) return { ...stats, enabled: false };
    const head = await this.blockchain.chainHead();
    const confirmations = await this.getNumber(REDEMPTION_SETTING_KEYS.confirmationBlocks, this.config.redemptionConfirmations || REDEMPTION_DEFAULTS.confirmationBlocks);
    const safeBlock = Math.max(0, head.latestBlock - confirmations + 1);
    const blockOffset = Math.max(1, await this.getNumber(REDEMPTION_SETTING_KEYS.blockOffset, REDEMPTION_DEFAULTS.blockOffset));
    const configuredStart = Number(this.config.redemptionIndexerStartBlock || 0);
    const pendingStart = await this.repository.earliestPaymentBlock();
    const startBlock = configuredStart || pendingStart || Math.max(0, safeBlock - blockOffset + 1);
    await this.checkpointRepository.ensureCheckpoint(REDEMPTION_INDEXER_NAME, head.chainId, startBlock);
    const leaseSeconds = await this.getNumber(REDEMPTION_SETTING_KEYS.leaseSeconds, REDEMPTION_DEFAULTS.leaseSeconds);
    if (!(await this.checkpointRepository.acquireLease(REDEMPTION_INDEXER_NAME, head.chainId, this.leaseOwner, leaseSeconds))) return { ...stats, leaseAcquired: false };
    try {
      const checkpoint = await this.checkpointRepository.findCheckpoint(REDEMPTION_INDEXER_NAME, head.chainId);
      let fromBlock = Number(checkpoint.lastIndexedBlock) > 0 ? Number(checkpoint.lastIndexedBlock) + 1 : Number(checkpoint.startBlock);
      const maxChunks = await this.getNumber(REDEMPTION_SETTING_KEYS.maxChunksPerRun, REDEMPTION_DEFAULTS.maxChunksPerRun);
      for (let chunk = 0; fromBlock <= safeBlock && chunk < maxChunks; chunk += 1) {
        const toBlock = Math.min(safeBlock, fromBlock + blockOffset - 1);
        const events = await this.blockchain.scanPaymentEvents(fromBlock, toBlock);
        await this.repository.storePaymentEvents(events);
        await this.checkpointRepository.advanceCheckpoint(REDEMPTION_INDEXER_NAME, head.chainId, this.leaseOwner,
          toBlock, await this.blockchain.blockHash(toBlock));
        stats.blocksScanned += toBlock - fromBlock + 1; stats.eventsFound += events.length; fromBlock = toBlock + 1;
      }
      await this.processPaymentEvents(head.chainId,
        await this.getNumber(REDEMPTION_SETTING_KEYS.eventBatchSize, REDEMPTION_DEFAULTS.eventBatchSize), stats);
      stats.expired = await this.repository.expireUnsigned(
        await this.getNumber(REDEMPTION_SETTING_KEYS.expirationBatchSize, REDEMPTION_DEFAULTS.expirationBatchSize),
      );
      for (const candidate of await this.repository.listRecoveryCandidates(
        await this.getNumber(REDEMPTION_SETTING_KEYS.batchSize, REDEMPTION_DEFAULTS.batchSize))) {
        await this.reconcileCandidate(candidate, safeBlock, stats);
      }
      await this.checkpointRepository.releaseLease(REDEMPTION_INDEXER_NAME, head.chainId, this.leaseOwner);
      return stats;
    } catch (error) {
      await this.checkpointRepository.releaseLease(REDEMPTION_INDEXER_NAME, head.chainId, this.leaseOwner, error.message);
      throw error;
    }
  }
}

module.exports = { TokenRedemptionReconciliationService, REDEMPTION_INDEXER_NAME, REDEMPTION_SETTING_KEYS, REDEMPTION_DEFAULTS };
