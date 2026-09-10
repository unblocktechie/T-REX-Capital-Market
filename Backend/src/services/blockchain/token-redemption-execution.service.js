const crypto = require('node:crypto');
const { env } = require('../../core/config/env');
const { withTransaction } = require('../../database/connection');
const { RedemptionBlockchainError } = require('./token-redemption-blockchain.service');

// Shared with token-purchase minting because both use the same platform Token Agent signer.
const EXECUTION_LEASE_NAME = 'platformTokenAgentExecution';

const ACTIONS = Object.freeze({
  LOCK: {
    status: 'ISSUER_APPROVED', submittedStatus: 'TOKEN_LOCK_SUBMITTED', statusField: 'lockStatus',
    preparedField: 'lockPreparedAtBlock', hashField: 'lockTxHash', submittedAtField: 'lockSubmittedAt',
  },
  BURN: {
    status: 'PAYMENT_CONFIRMED', submittedStatus: 'BURN_SUBMITTED', statusField: 'burnStatus',
    preparedField: 'burnPreparedAtBlock', hashField: 'burnTxHash', submittedAtField: 'burnSubmittedAt',
  },
  UNLOCK: {
    status: ['BURN_CONFIRMED', 'CANCELLATION_PENDING'], submittedStatus: 'UNLOCK_SUBMITTED', statusField: 'unlockStatus',
    preparedField: 'unlockPreparedAtBlock', hashField: 'unlockTxHash', submittedAtField: 'unlockSubmittedAt',
  },
});

class TokenRedemptionExecutionService {
  constructor({ repository, checkpointRepository, blockchain, config = env.blockchain, transactionRunner = withTransaction }) {
    this.repository = repository;
    this.checkpointRepository = checkpointRepository;
    this.blockchain = blockchain;
    this.config = config;
    this.transactionRunner = transactionRunner;
  }

  expected(row) {
    return {
      chainId: Number(row.chainId), usdtContractAddress: row.usdtContractAddress,
      tokenAddress: row.tokenAddress, investorWalletAddress: row.investorWalletAddress,
      issuerPaymentWalletAddress: row.issuerPaymentWalletAddress,
      platformWalletAddress: row.platformWalletAddress, tokenAmountRaw: String(row.tokenAmountRaw),
      usdtAmountRaw: String(row.usdtAmountRaw), frozenBeforeRaw: String(row.frozenBeforeRaw),
      unlockAmountRaw: String(row.unlockAmountRaw || '0'),
    };
  }

  async submit(action, redemption) {
    const definition = ACTIONS[action];
    if (!definition) throw new Error(`Unsupported redemption action ${action}.`);
    let row = await this.repository.findByUid(redemption.redemptionUid);
    const allowed = Array.isArray(definition.status) ? definition.status : [definition.status];
    if (!row || !allowed.includes(row.status) || row[definition.hashField]) {
      return { row, submitted: false, idempotent: true };
    }
    if (action === 'UNLOCK' && BigInt(row.unlockAmountRaw || '0') === 0n) {
      return { row, submitted: false, idempotent: true };
    }

    const head = await this.blockchain.chainHead();
    await this.checkpointRepository.ensureCheckpoint(EXECUTION_LEASE_NAME, head.chainId, 0);
    const leaseOwner = `${process.pid}-redemption-${crypto.randomUUID()}`;
    const leaseSeconds = Math.max(30, Number(this.config.transactionTimeoutMs || 120000) / 1000 + 30);
    if (!(await this.checkpointRepository.acquireLease(EXECUTION_LEASE_NAME, head.chainId, leaseOwner, leaseSeconds))) {
      return { row, submitted: false, pending: true, idempotent: true, code: 'REDEMPTION_EXECUTION_BUSY' };
    }

    let submitted;
    try {
      row = await this.repository.findByUid(row.redemptionUid);
      if (!row || !allowed.includes(row.status) || row[definition.hashField]) {
        return { row, submitted: false, idempotent: true };
      }
      const claimed = await this.repository.transition(row.redemptionUid, allowed, {
        [definition.statusField]: 'PROCESSING', [definition.preparedField]: head.latestBlock,
        syncStatus: 'PROCESSING', syncStartedAt: new Date(), nextSyncAt: null,
      });
      if (!claimed) return { row: await this.repository.findByUid(row.redemptionUid), submitted: false, idempotent: true };
      row = await this.repository.findByUid(row.redemptionUid);
      submitted = await this.blockchain.submitAction(action, this.expected(row));
      await this.transactionRunner(async (connection) => {
        const changed = await this.repository.transition(row.redemptionUid, allowed, {
          status: definition.submittedStatus, [definition.statusField]: 'SUBMITTED',
          [definition.hashField]: submitted.txHash, [definition.submittedAtField]: new Date(),
          [definition.preparedField]: submitted.preparedAtBlock, syncStatus: 'QUEUED',
          syncRequestedAt: new Date(), nextSyncAt: new Date(Date.now() + 15000),
          errorStage: null, errorCode: null, errorMessage: null,
        }, connection);
        if (!changed) throw new RedemptionBlockchainError('REDEMPTION_STATE_CHANGED', `${action} was broadcast but the redemption state changed.`, { transient: true });
        await this.repository.recordTransaction(row.redemptionUid, action, submitted.txHash, 'SUBMITTED', {}, connection);
        await this.repository.addHistory({
          redemptionUid: row.redemptionUid, eventType: `${action}_SUBMITTED`, fromStatus: row.status,
          toStatus: definition.submittedStatus, actorRole: 'system', message: `${action} transaction submitted by the platform Token Agent.`,
          metadata: { txHash: submitted.txHash },
        }, connection);
      });
      return { row: await this.repository.findByUid(row.redemptionUid), submitted: true, idempotent: false };
    } catch (error) {
      if (!(error instanceof RedemptionBlockchainError)) throw error;
      if (submitted) {
        await this.repository.recordTransaction(row.redemptionUid, action, submitted.txHash, error.pending ? 'PENDING' : 'FAILED', {
          errorCode: error.code, errorMessage: error.message,
        });
      }
      if (error.pending || error.transient) {
        await this.repository.recordError(row.redemptionUid, action, error.code || `${action}_FAILED`, error.message, 30);
      } else {
        await this.transactionRunner(async (connection) => {
          const current = await this.repository.findForUpdate(row.redemptionUid, connection);
          if (!current || ['COMPLETED', 'CANCELLED', 'MANUAL_REVIEW'].includes(current.status)) return;
          const changed = await this.repository.transition(current.redemptionUid, current.status, {
            status: 'MANUAL_REVIEW', errorStage: action, errorCode: error.code || `${action}_FAILED`,
            errorMessage: error.message, syncStatus: 'FAILED', nextSyncAt: null,
          }, connection);
          if (changed) await this.repository.addHistory({
            redemptionUid: current.redemptionUid, eventType: 'MANUAL_REVIEW_REQUIRED',
            fromStatus: current.status, toStatus: 'MANUAL_REVIEW', actorRole: 'system',
            message: error.message,
          }, connection);
        });
      }
      return { row: await this.repository.findByUid(row.redemptionUid), submitted: Boolean(submitted), pending: true, error, code: error.code };
    } finally {
      await this.checkpointRepository.releaseLease(EXECUTION_LEASE_NAME, head.chainId, leaseOwner);
    }
  }
}

module.exports = { TokenRedemptionExecutionService, EXECUTION_LEASE_NAME, ACTIONS };
