const crypto = require('node:crypto');
const { env } = require('../../core/config/env');
const { logger } = require('../common/log.service');
const { withTransaction } = require('../../database/connection');
const { PurchaseBlockchainError } = require('./token-purchase-blockchain.service');

const INDEXER_NAME = 'tokenPurchasePayment';
const SETTING_KEYS = {
  enabled: 'PurchaseWorkerEnabled', intervalSeconds: 'PurchaseWorkerIntervalSeconds',
  blockOffset: 'PurchaseIndexerBlockOffset', confirmationBlocks: 'PurchaseIndexerConfirmationBlocks',
  leaseSeconds: 'PurchaseWorkerLeaseSeconds', batchSize: 'PurchaseWorkerBatchSize',
  eventBatchSize: 'PurchaseEventBatchSize', maxChunksPerRun: 'PurchaseIndexerMaxChunksPerRun',
  expirationBatchSize: 'PurchaseExpirationBatchSize', expirationGraceSeconds: 'PurchaseIntentExpiryGraceSeconds',
};
const DEFAULTS = {
  intervalSeconds: 15, blockOffset: 1000, confirmationBlocks: 12, leaseSeconds: 180,
  batchSize: 50, eventBatchSize: 200, maxChunksPerRun: 10, expirationBatchSize: 50,
  expirationGraceSeconds: 180,
};

class TokenPurchaseReconciliationService {
  constructor({ settingRepository, repository, checkpointRepository, blockchain, mintService, config = env.blockchain, transactionRunner = withTransaction, dependencies = {} }) {
    this.settingRepository = settingRepository;
    this.repository = repository;
    this.checkpointRepository = checkpointRepository;
    this.blockchain = blockchain;
    this.mintService = mintService;
    this.config = config;
    this.transactionRunner = transactionRunner;
    this.leaseOwner = dependencies.leaseOwner || `${process.pid}-${crypto.randomUUID()}`;
  }

  async setting(key) { return (await this.settingRepository.findByKey(key))?.settingValue; }
  async getNumber(key, fallback) { const n = Number(await this.setting(key)); return Number.isFinite(n) ? n : fallback; }
  async getBoolean(key, fallback) { const v = await this.setting(key); return v === undefined ? fallback : String(v).toLowerCase() === 'true'; }
  expected(row) {
    return {
      chainId: Number(row.chainId), usdtContractAddress: row.usdtContractAddress, tokenAddress: row.tokenAddress,
      investorWalletAddress: row.investorWalletAddress, treasuryWalletAddress: row.treasuryWalletAddress,
      platformWalletAddress: row.platformWalletAddress, usdtAmountRaw: String(row.usdtAmountRaw),
      tokenAmountRaw: String(row.tokenAmountRaw),
    };
  }

  async confirmPayment(row, txHash) {
    const used = await this.repository.findByPaymentTxHash(txHash);
    if (used && used.purchaseUid !== row.purchaseUid) throw new PurchaseBlockchainError('PAYMENT_TRANSACTION_ALREADY_USED', 'Payment transaction belongs to another purchase.');
    row = await this.repository.assignPaymentHash(row.purchaseUid, txHash, false);
    const verified = await this.blockchain.verifyPayment(txHash, this.expected(row));
    await this.transactionRunner(async (connection) => {
      const changed = await this.repository.confirmPayment(row.purchaseUid, verified, connection);
      if (!changed) throw new PurchaseBlockchainError('PURCHASE_STATE_CHANGED', 'Purchase changed during payment finalization.');
      await this.repository.recordTransaction(row.purchaseUid, 'PAYMENT', txHash, 'CONFIRMED', verified, connection);
    });
    return this.repository.findByUid(row.purchaseUid);
  }

  async processPaymentEvents(chainId, limit, stats) {
    for (const event of await this.repository.listPaymentEvents(chainId, limit)) {
      const purchase = await this.repository.findPendingForPaymentEvent(event);
      if (!purchase) {
        await this.repository.markPaymentEvent(event.paymentEventUid, 'UNMATCHED', null, 'No exact pending purchase exists.');
        stats.eventsUnmatched += 1;
        continue;
      }
      try {
        await this.confirmPayment(purchase, event.txHash);
        await this.repository.markPaymentEvent(event.paymentEventUid, 'MATCHED', purchase.purchaseUid, 'USDT payment independently verified.');
        stats.eventsMatched += 1;
      } catch (error) {
        await this.repository.markPaymentEvent(event.paymentEventUid, 'FAILED', purchase.purchaseUid, error.message);
        stats.errors += 1;
      }
    }
  }

  async reconcilePurchase(candidate, safeBlock, stats) {
    if (!(await this.repository.markProcessing(candidate.purchaseUid))) return;
    let row = await this.repository.findByUid(candidate.purchaseUid);
    try {
      if (row.status === 'PENDING_PAYMENT') {
        if (!row.paymentTxHash) {
          await this.repository.schedulePending(row.purchaseUid, 30);
          return;
        }
        row = await this.confirmPayment(row, row.paymentTxHash);
        stats.paymentsConfirmed += 1;
      }

      if (row.status === 'MINT_SUBMITTED' && row.mintTxHash) {
        const verified = await this.blockchain.verifyMint(row.mintTxHash, this.expected(row));
        await this.transactionRunner(async (connection) => {
          const changed = await this.repository.completeMint(row.purchaseUid, verified, connection);
          if (!changed) throw new PurchaseBlockchainError('PURCHASE_STATE_CHANGED', 'Purchase changed during mint finalization.');
          await this.repository.recordTransaction(row.purchaseUid, 'MINT', row.mintTxHash, 'CONFIRMED', verified, connection);
        });
        stats.mintsConfirmed += 1;
        return;
      }

      if (row.status === 'PAYMENT_CONFIRMED') {
        // Re-check the canonical payment immediately before any irreversible mint action. This
        // protects the settlement boundary even if the worker runs long after initial confirmation.
        if (!row.paymentTxHash) throw new PurchaseBlockchainError('PAYMENT_PROOF_MISSING', 'Confirmed payment has no transaction hash.');
        await this.blockchain.verifyPayment(row.paymentTxHash, this.expected(row), {
          confirmations: Math.max(1, Number(this.config.purchasePaymentConfirmations || 1)),
        });
        // A prepared block without a hash means the process may have crashed immediately after
        // broadcasting. Wait until that block is safe and search for the exact mint event first.
        let allowPreparedRetry = false;
        if (row.mintPreparedAtBlock !== null) {
          if (safeBlock < Number(row.mintPreparedAtBlock)) {
            await this.repository.schedulePending(row.purchaseUid, 15);
            return;
          }
          const recoveredHash = await this.blockchain.findMintEvent(this.expected(row), Number(row.mintPreparedAtBlock), safeBlock);
          if (recoveredHash) {
            const verified = await this.blockchain.verifyMint(recoveredHash, this.expected(row));
            await this.transactionRunner(async (connection) => {
              const changed = await this.repository.completeMint(row.purchaseUid, verified, connection);
              if (!changed) throw new PurchaseBlockchainError('PURCHASE_STATE_CHANGED', 'Purchase changed during recovered mint finalization.');
              await this.repository.recordTransaction(row.purchaseUid, 'MINT', recoveredHash, 'CONFIRMED', verified, connection);
            });
            stats.mintsRecovered += 1;
            return;
          }
          // No mint was emitted in the now-safe range: clear the preparation marker by resetting
          // through the submitted state is unnecessary; a fresh marker is stored below.
          allowPreparedRetry = true;
        }
        const mintResult = await this.mintService.submit(row, { allowPreparedRetry });
        if (mintResult.submitted) stats.mintsSubmitted += 1;
        if (mintResult.error) {
          stats.errors += 1;
          logger.warn('Token purchase mint submission failed', {
            purchaseUid: row.purchaseUid,
            code: mintResult.code,
            error: mintResult.error.message,
          });
        }
      }
    } catch (error) {
      const known = error instanceof PurchaseBlockchainError;
      const pending = known && (error.pending || error.transient);
      if (known && error.pending) {
        if (row.mintTxHash) {
          await this.repository.recordTransaction(row.purchaseUid, 'MINT', row.mintTxHash, 'PENDING');
        }
        await this.repository.schedulePending(row.purchaseUid, 30);
        stats.pendingConfirmations = (stats.pendingConfirmations || 0) + 1;
        logger.info('Token purchase transaction is awaiting confirmations', {
          purchaseUid: row.purchaseUid,
          stage: row.status === 'PENDING_PAYMENT' ? 'PAYMENT' : 'MINT',
          message: error.message,
        });
        return;
      }
      if (row.mintTxHash) {
        await this.repository.recordTransaction(row.purchaseUid, 'MINT', row.mintTxHash, pending ? 'PENDING' : 'FAILED', {
          errorCode: error.code || 'MINT_FAILED', errorMessage: error.message,
        });
      }
      await this.repository.recordError(row.purchaseUid,
        row.status === 'PENDING_PAYMENT' ? 'PAYMENT' : 'MINT', error.code || 'PURCHASE_RECONCILIATION_FAILED', error.message,
        pending ? 30 : null);
      stats.errors += 1;
      logger.warn('Token purchase reconciliation failed', { purchaseUid: row.purchaseUid, code: error.code, error: error.message });
    }
  }

  async run() {
    const stats = { enabled: true, blocksScanned: 0, eventsFound: 0, eventsMatched: 0, eventsUnmatched: 0, purchasesExpired: 0, expirationDeferred: false, paymentsConfirmed: 0, mintsSubmitted: 0, mintsConfirmed: 0, mintsRecovered: 0, pendingConfirmations: 0, errors: 0 };
    if (!this.config.purchaseWorkerEnabled || !(await this.getBoolean(SETTING_KEYS.enabled, true))) return { ...stats, enabled: false };
    const head = await this.blockchain.chainHead();
    const confirmations = await this.getNumber(SETTING_KEYS.confirmationBlocks, this.config.purchaseConfirmations || DEFAULTS.confirmationBlocks);
    const safeBlock = Math.max(0, head.latestBlock - confirmations);
    const configuredStart = Number(this.config.purchaseIndexerStartBlock || 0);
    const pendingStart = await this.repository.earliestPreparedBlock();
    const blockOffset = Math.max(1, await this.getNumber(SETTING_KEYS.blockOffset, DEFAULTS.blockOffset));
    const startBlock = configuredStart || pendingStart || Math.max(0, safeBlock - blockOffset + 1);
    await this.checkpointRepository.ensureCheckpoint(INDEXER_NAME, head.chainId, startBlock);
    const leaseSeconds = await this.getNumber(SETTING_KEYS.leaseSeconds, DEFAULTS.leaseSeconds);
    if (!(await this.checkpointRepository.acquireLease(INDEXER_NAME, head.chainId, this.leaseOwner, leaseSeconds))) return { ...stats, leaseAcquired: false };
    try {
      let checkpoint = await this.checkpointRepository.findCheckpoint(INDEXER_NAME, head.chainId);
      let fromBlock = Number(checkpoint.lastIndexedBlock) > 0 ? Number(checkpoint.lastIndexedBlock) + 1 : Number(checkpoint.startBlock);
      const maxChunks = await this.getNumber(SETTING_KEYS.maxChunksPerRun, DEFAULTS.maxChunksPerRun);
      for (let chunkNo = 0; fromBlock <= safeBlock && chunkNo < maxChunks; chunkNo += 1) {
        const toBlock = Math.min(safeBlock, fromBlock + blockOffset - 1);
        const events = await this.blockchain.scanPaymentEvents(fromBlock, toBlock);
        await this.repository.storePaymentEvents(events);
        await this.checkpointRepository.advanceCheckpoint(INDEXER_NAME, head.chainId, this.leaseOwner, toBlock, await this.blockchain.blockHash(toBlock));
        stats.blocksScanned += toBlock - fromBlock + 1;
        stats.eventsFound += events.length;
        fromBlock = toBlock + 1;
      }
      await this.processPaymentEvents(head.chainId, await this.getNumber(SETTING_KEYS.eventBatchSize, DEFAULTS.eventBatchSize), stats);
      // Expiration runs only after the durable USDT indexer reaches the safe head. During a long
      // outage this lets genuine transfers be matched before old no-hash intents are abandoned.
      if (fromBlock > safeBlock) {
        stats.purchasesExpired = await this.repository.expireAbandonedPaymentIntents(
          await this.getNumber(SETTING_KEYS.expirationBatchSize, DEFAULTS.expirationBatchSize),
          await this.getNumber(SETTING_KEYS.expirationGraceSeconds, DEFAULTS.expirationGraceSeconds),
        );
      } else {
        stats.expirationDeferred = true;
      }
      for (const candidate of await this.repository.listRecoveryCandidates(await this.getNumber(SETTING_KEYS.batchSize, DEFAULTS.batchSize))) {
        await this.reconcilePurchase(candidate, safeBlock, stats);
      }
      await this.checkpointRepository.releaseLease(INDEXER_NAME, head.chainId, this.leaseOwner);
      return stats;
    } catch (error) {
      await this.checkpointRepository.releaseLease(INDEXER_NAME, head.chainId, this.leaseOwner, error.message);
      throw error;
    }
  }
}

module.exports = { TokenPurchaseReconciliationService, INDEXER_NAME, SETTING_KEYS, DEFAULTS };
