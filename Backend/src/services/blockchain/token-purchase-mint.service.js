const crypto = require('node:crypto');
const { env } = require('../../core/config/env');
const { withTransaction } = require('../../database/connection');
const { PurchaseBlockchainError } = require('./token-purchase-blockchain.service');

// Purchase minting and redemption lock/burn/unlock share one signer/private key. A single
// distributed lease prevents cross-module nonce races across all API instances.
const MINT_LEASE_NAME = 'platformTokenAgentExecution';

class TokenPurchaseMintService {
  constructor({ repository, checkpointRepository, blockchain, config = env.blockchain, transactionRunner = withTransaction }) {
    this.repository = repository;
    this.checkpointRepository = checkpointRepository;
    this.blockchain = blockchain;
    this.config = config;
    this.transactionRunner = transactionRunner;
  }

  expected(row) {
    return {
      chainId: Number(row.chainId),
      usdtContractAddress: row.usdtContractAddress,
      tokenAddress: row.tokenAddress,
      investorWalletAddress: row.investorWalletAddress,
      treasuryWalletAddress: row.treasuryWalletAddress,
      platformWalletAddress: row.platformWalletAddress,
      usdtAmountRaw: String(row.usdtAmountRaw),
      tokenAmountRaw: String(row.tokenAmountRaw),
    };
  }

  async submit(purchase, { allowPreparedRetry = false, confirmImmediately = false } = {}) {
    let row = await this.repository.findByUid(purchase.purchaseUid);
    if (!row || row.status === 'COMPLETED' || row.status === 'MINT_SUBMITTED' || row.mintTxHash) {
      return { row, submitted: false, pending: false, idempotent: true };
    }
    if (row.status !== 'PAYMENT_CONFIRMED') {
      return { row, submitted: false, pending: true, idempotent: true };
    }

    const head = await this.blockchain.chainHead();
    await this.checkpointRepository.ensureCheckpoint(MINT_LEASE_NAME, head.chainId, 0);
    const leaseOwner = `${process.pid}-purchase-api-${crypto.randomUUID()}`;
    const leaseSeconds = Math.max(30, Number(this.config.transactionTimeoutMs || 120000) / 1000 + 30);
    const leaseAcquired = await this.checkpointRepository.acquireLease(
      MINT_LEASE_NAME, head.chainId, leaseOwner, leaseSeconds,
    );
    if (!leaseAcquired) {
      return { row, submitted: false, pending: true, idempotent: true, code: 'MINT_ALREADY_PROCESSING' };
    }

    let submitted = null;
    try {
      row = await this.repository.findByUid(row.purchaseUid);
      if (!row || row.status === 'COMPLETED' || row.status === 'MINT_SUBMITTED' || row.mintTxHash) {
        return { row, submitted: false, pending: false, idempotent: true };
      }
      const claimed = await this.repository.markMintPreparing(
        row.purchaseUid, head.latestBlock, allowPreparedRetry,
      );
      if (!claimed) {
        return {
          row: await this.repository.findByUid(row.purchaseUid),
          submitted: false,
          pending: true,
          idempotent: true,
          code: 'MINT_ALREADY_PROCESSING',
        };
      }

      row = await this.repository.findByUid(row.purchaseUid);
      submitted = await this.blockchain.submitMint(this.expected(row));
      await this.transactionRunner(async (connection) => {
        await this.repository.markMintSubmitted(row.purchaseUid, submitted, connection);
        await this.repository.recordTransaction(
          row.purchaseUid, 'MINT', submitted.txHash, 'SUBMITTED', {}, connection,
        );
      });
      row = await this.repository.findByUid(row.purchaseUid);
      if (confirmImmediately) {
        const verified = await this.blockchain.waitForMint(submitted.txHash, this.expected(row), {
          confirmations: Math.max(1, Number(this.config.purchaseConfirmations || 2)),
          timeoutMs: Number(this.config.transactionTimeoutMs || 120000),
        });
        await this.transactionRunner(async (connection) => {
          const finalized = await this.repository.completeMint(row.purchaseUid, verified, connection);
          if (!finalized) {
            const current = await this.repository.findByUid(row.purchaseUid, connection);
            if (current?.status !== 'COMPLETED') {
              throw new PurchaseBlockchainError(
                'PURCHASE_STATE_CHANGED',
                'Mint succeeded but the purchase could not be finalized.',
                { transient: true },
              );
            }
          }
          await this.repository.recordTransaction(
            row.purchaseUid, 'MINT', submitted.txHash, 'CONFIRMED', verified, connection,
          );
        });
        row = await this.repository.findByUid(row.purchaseUid);
      }
      return {
        row,
        submitted: true,
        confirmed: row.status === 'COMPLETED',
        pending: false,
        idempotent: false,
      };
    } catch (error) {
      if (!(error instanceof PurchaseBlockchainError)) throw error;
      if (submitted && error.pending) {
        await this.repository.recordTransaction(row.purchaseUid, 'MINT', submitted.txHash, 'PENDING');
        await this.repository.schedulePending(row.purchaseUid, 15);
        return {
          row: await this.repository.findByUid(row.purchaseUid),
          submitted: true,
          confirmed: false,
          pending: true,
          idempotent: false,
          code: error.code,
        };
      }
      const retrySeconds = error.pending || error.transient ? 30 : null;
      if (submitted) {
        await this.repository.recordTransaction(
          row.purchaseUid,
          'MINT',
          submitted.txHash,
          error.transient ? 'PENDING' : 'FAILED',
          { errorCode: error.code, errorMessage: error.message },
        );
      }
      await this.repository.recordError(
        row.purchaseUid, 'MINT', error.code || 'MINT_BROADCAST_FAILED', error.message, retrySeconds,
      );
      return {
        row: await this.repository.findByUid(row.purchaseUid),
        submitted: Boolean(submitted),
        confirmed: false,
        pending: true,
        idempotent: false,
        code: error.code,
        error,
      };
    } finally {
      await this.checkpointRepository.releaseLease(MINT_LEASE_NAME, head.chainId, leaseOwner);
    }
  }
}

module.exports = { TokenPurchaseMintService, MINT_LEASE_NAME };
