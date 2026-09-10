const ethers = require('ethers');
const { ApiError } = require('../core/errors/api-error');
const { env } = require('../core/config/env');
const { withTransaction } = require('../database/connection');
const { PurchaseBlockchainError } = require('./blockchain/token-purchase-blockchain.service');

const ceilDiv = (value, divisor) => (value + divisor - 1n) / divisor;

class TokenPurchaseService {
  constructor({ repository, blockchain, mintService, config = env.blockchain, transactionRunner = withTransaction }) {
    this.repository = repository;
    this.blockchain = blockchain;
    this.mintService = mintService;
    this.config = config;
    this.transactionRunner = transactionRunner;
  }

  assertInvestor(user) {
    if (user.roleName !== 'Investor') throw ApiError.forbidden('Token purchases are available only to investor accounts.');
  }

  present(row, transactions) {
    if (!row) return null;
    return {
      purchaseUid: row.purchaseUid, interestUid: row.interestUid, tokenUid: row.tokenUid,
      status: row.status, mintStatus: row.mintStatus, chainId: Number(row.chainId),
      tokenAddress: row.tokenAddress, investorWalletAddress: row.investorWalletAddress,
      treasuryWalletAddress: row.treasuryWalletAddress, platformWalletAddress: row.platformWalletAddress,
      tokenAmount: String(row.tokenAmount), tokenAmountRaw: String(row.tokenAmountRaw), tokenDecimals: Number(row.tokenDecimals),
      tokenPrice: String(row.tokenPrice), usdtAmount: String(row.usdtAmount), usdtAmountRaw: String(row.usdtAmountRaw),
      usdtDecimals: Number(row.usdtDecimals), usdtContractAddress: row.usdtContractAddress,
      payment: {
        txHash: row.paymentTxHash || null, receivedAt: row.paymentTxReceivedAt || null,
        blockNumber: row.paymentBlockNumber === null ? null : Number(row.paymentBlockNumber),
        blockHash: row.paymentBlockHash || null, transactionIndex: row.paymentTransactionIndex,
        logIndex: row.paymentLogIndex, gasUsed: row.paymentGasUsed || null,
        effectiveGasPrice: row.paymentEffectiveGasPrice || null, verifiedAt: row.paymentVerifiedAt || null,
      },
      mint: {
        txHash: row.mintTxHash || null, blockNumber: row.mintBlockNumber === null ? null : Number(row.mintBlockNumber),
        blockHash: row.mintBlockHash || null, transactionIndex: row.mintTransactionIndex,
        logIndex: row.mintLogIndex, gasUsed: row.mintGasUsed || null,
        effectiveGasPrice: row.mintEffectiveGasPrice || null,
        submittedAt: row.mintSubmittedAt || null, confirmedAt: row.mintConfirmedAt || null,
      },
      synchronization: { status: row.syncStatus, attempts: Number(row.syncAttempts || 0) },
      expiration: {
        expiresAt: row.expiresAt || null,
        expiredAt: row.expiredAt || null,
        reason: row.expirationReason || null,
      },
      error: row.errorCode ? { stage: row.errorStage, code: row.errorCode, message: row.errorMessage } : null,
      createdAt: row.createdAt, updatedAt: row.updatedAt,
      ...(transactions ? { transactionHistory: transactions.map((item) => ({
        stage: item.stage, txHash: item.txHash, status: item.status,
        blockNumber: item.blockNumber === null ? null : Number(item.blockNumber), blockHash: item.blockHash,
        transactionIndex: item.transactionIndex, logIndex: item.logIndex, gasUsed: item.gasUsed,
        effectiveGasPrice: item.effectiveGasPrice, errorCode: item.errorCode, errorMessage: item.errorMessage,
        confirmedAt: item.confirmedAt, createdAt: item.createdAt,
      })) } : {}),
    };
  }

  expected(row) {
    return {
      chainId: Number(row.chainId), usdtContractAddress: row.usdtContractAddress,
      tokenAddress: row.tokenAddress, investorWalletAddress: row.investorWalletAddress,
      treasuryWalletAddress: row.treasuryWalletAddress, platformWalletAddress: row.platformWalletAddress,
      usdtAmountRaw: String(row.usdtAmountRaw), tokenAmountRaw: String(row.tokenAmountRaw),
    };
  }

  validateContext(context) {
    if (!context) throw new ApiError(404, 'Registered investment was not found.', undefined, 'REGISTERED_INVESTMENT_NOT_FOUND');
    if (context.interestStatus !== 'registered') throw new ApiError(409, 'Investor must be registered for this token before purchasing.', undefined, 'INVESTOR_NOT_REGISTERED');
    if (context.tokenStatus !== 'deployed' || !context.tokenActive) throw new ApiError(409, 'Token is not available for purchase.', undefined, 'TOKEN_NOT_AVAILABLE');
    if (context.investorStatus !== 'submitted' || !context.investorActive || context.investorDeleted) throw new ApiError(409, 'Investor profile is not active.', undefined, 'INVESTOR_NOT_ACTIVE');
    const addresses = [context.tokenAddress, context.treasuryWalletAddress, context.investorWalletAddress, this.config.purchaseUsdtAddress];
    if (!addresses.every(ethers.isAddress)) throw new ApiError(409, 'Purchase wallet or contract configuration is incomplete.', undefined, 'PURCHASE_CONFIGURATION_INVALID');
  }

  calculate(tokenAmount, tokenDecimals, tokenPrice, usdtDecimals) {
    let tokenAmountRaw; let priceRaw;
    try {
      tokenAmountRaw = ethers.parseUnits(tokenAmount, tokenDecimals);
      priceRaw = ethers.parseUnits(String(tokenPrice), usdtDecimals);
    } catch {
      throw new ApiError(422, 'tokenAmount has more decimal places than this token supports.', undefined, 'TOKEN_AMOUNT_INVALID');
    }
    if (tokenAmountRaw <= 0n || priceRaw <= 0n) throw new ApiError(422, 'Token amount and configured price must be greater than zero.', undefined, 'TOKEN_AMOUNT_INVALID');
    const usdtAmountRaw = ceilDiv(tokenAmountRaw * priceRaw, 10n ** BigInt(tokenDecimals));
    return {
      tokenAmountRaw, usdtAmountRaw,
      tokenAmount: ethers.formatUnits(tokenAmountRaw, tokenDecimals),
      usdtAmount: ethers.formatUnits(usdtAmountRaw, usdtDecimals),
    };
  }

  async create(user, tokenUid, input) {
    this.assertInvestor(user);
    const previous = await this.repository.findByIdempotency(user.userUid, input.idempotencyKey);
    if (previous) return { purchase: this.present(previous), existing: true };
    const context = await this.repository.findContext(user.userUid, tokenUid);
    this.validateContext(context);
    const active = await this.repository.findActiveByInterest(context.interestUid);
    if (active) return { purchase: this.present(active), existing: true };
    const investorActive = await this.repository.findActiveByInvestor(context.investorUid);
    if (investorActive) {
      throw new ApiError(409, 'Complete the existing token purchase before starting another one.', undefined, 'ACTIVE_PURCHASE_EXISTS');
    }

    let preparation;
    try {
      preparation = await this.blockchain.prepare({
        usdtContractAddress: this.config.purchaseUsdtAddress,
        tokenAddress: context.tokenAddress,
        investorWalletAddress: context.investorWalletAddress,
      });
    } catch (error) {
      if (!(error instanceof PurchaseBlockchainError)) throw error;
      throw new ApiError(error.transient ? 503 : 409, error.message, undefined, error.code);
    }
    if (!preparation.platformIsAgent) throw new ApiError(409, 'Platform wallet is not authorized as Token Agent.', undefined, 'PLATFORM_NOT_TOKEN_AGENT');
    const amounts = this.calculate(input.tokenAmount, Number(context.tokenDecimals), context.tokenPrice, preparation.usdtDecimals);
    const configuredTtl = Number(this.config.purchaseIntentTtlMinutes);
    const ttlMinutes = Number.isFinite(configuredTtl) && configuredTtl > 0 ? configuredTtl : 15;
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);
    let maxRaw;
    try { maxRaw = ethers.parseUnits(String(context.maxBalancePerInvestor), Number(context.tokenDecimals)); } catch {
      throw new ApiError(409, 'Token maximum holder balance is not configured correctly.', undefined, 'TOKEN_BALANCE_CAP_INVALID');
    }
    const reservedRaw = BigInt(await this.repository.sumOpenTokenAmountRaw(context.interestUid));
    if (BigInt(preparation.balanceBeforeRaw) + reservedRaw + amounts.tokenAmountRaw > maxRaw) {
      throw new ApiError(409, 'Purchase would exceed the maximum token balance per investor.', undefined, 'MAX_BALANCE_EXCEEDED');
    }
    try {
      const created = await this.repository.create({
        ...context, ...amounts, idempotencyKey: input.idempotencyKey,
        chainId: preparation.chainId, usdtContractAddress: ethers.getAddress(this.config.purchaseUsdtAddress),
        tokenAddress: ethers.getAddress(context.tokenAddress), investorWalletAddress: ethers.getAddress(context.investorWalletAddress),
        treasuryWalletAddress: ethers.getAddress(context.treasuryWalletAddress), platformWalletAddress: preparation.platformWalletAddress,
        usdtDecimals: preparation.usdtDecimals, tokenDecimals: Number(context.tokenDecimals),
        balanceBeforeRaw: preparation.balanceBeforeRaw, preparedAtBlock: preparation.preparedAtBlock,
        expiresAt,
        tokenAmountRaw: amounts.tokenAmountRaw.toString(), usdtAmountRaw: amounts.usdtAmountRaw.toString(),
      });
      return { purchase: this.present(created), existing: false };
    } catch (error) {
      if (error?.code !== 'ER_DUP_ENTRY') throw error;
      const raced = await this.repository.findByIdempotency(user.userUid, input.idempotencyKey)
        || await this.repository.findActiveByInterest(context.interestUid)
        || await this.repository.findActiveByInvestor(context.investorUid);
      if (!raced) throw error;
      return { purchase: this.present(raced), existing: true };
    }
  }

  async get(user, purchaseUid) {
    this.assertInvestor(user);
    const row = await this.repository.findOwnedByUid(purchaseUid, user.userUid);
    if (!row) throw new ApiError(404, 'Purchase was not found.', undefined, 'PURCHASE_NOT_FOUND');
    return this.present(row, await this.repository.listTransactions(purchaseUid));
  }

  async listByToken(user, tokenUid, query = {}) {
    this.assertInvestor(user);
    const page = Number(query.page || 1);
    const limit = Number(query.limit || 20);
    const result = await this.repository.listOwnedByToken(user.userUid, tokenUid, {
      page,
      limit,
      search: query.search || '',
      status: query.status || 'all',
    });
    return {
      items: result.rows.map((row) => this.present(row)),
      pagination: {
        page,
        limit,
        total: result.total,
        totalPages: result.total === 0 ? 0 : Math.ceil(result.total / limit),
      },
    };
  }

  async confirm(user, purchaseUid, txHash) {
    this.assertInvestor(user);
    let row = await this.repository.findOwnedByUid(purchaseUid, user.userUid);
    if (!row) throw new ApiError(404, 'Purchase was not found.', undefined, 'PURCHASE_NOT_FOUND');
    if (row.status === 'EXPIRED') {
      return { purchase: this.present(row), idempotent: true, expired: true };
    }
    const normalized = txHash.toLowerCase();
    if (row.status !== 'PENDING_PAYMENT') {
      if (String(row.paymentTxHash || '').toLowerCase() === normalized) {
        const mintResult = row.status === 'PAYMENT_CONFIRMED'
          ? await this.mintService.submit(row, { confirmImmediately: true })
          : { row, submitted: false, pending: false };
        return {
          purchase: this.present(mintResult.row || row),
          idempotent: true,
          mintSubmitted: Boolean(mintResult.submitted),
          mintConfirmed: Boolean(mintResult.confirmed),
          mintPending: Boolean(mintResult.pending),
        };
      }
      throw new ApiError(409, 'Purchase payment is already confirmed with another transaction.', undefined, 'PAYMENT_ALREADY_CONFIRMED');
    }
    const used = await this.repository.findByPaymentTxHash(normalized);
    if (used && used.purchaseUid !== purchaseUid) throw new ApiError(409, 'Payment transaction is already used.', undefined, 'PAYMENT_TRANSACTION_ALREADY_USED');
    const allowReplacement = Boolean(row.paymentTxHash && row.errorStage === 'PAYMENT' && row.nextSyncAt === null);
    row = await this.repository.assignPaymentHash(purchaseUid, normalized, allowReplacement);
    if (row.status === 'EXPIRED') {
      throw new ApiError(409, 'This payment intent expired before a transaction was submitted. Create a new purchase intent.', undefined, 'PURCHASE_EXPIRED');
    }
    if (String(row.paymentTxHash || '').toLowerCase() !== normalized) throw new ApiError(409, 'Purchase is awaiting another payment transaction.', undefined, 'PAYMENT_TRANSACTION_ALREADY_ASSIGNED');
    try {
      await this.repository.recordTransaction(purchaseUid, 'PAYMENT', normalized, 'RECEIVED');
      const verified = await this.blockchain.verifyPayment(normalized, this.expected(row), {
        confirmations: Math.max(1, Number(this.config.purchasePaymentConfirmations || 1)),
      });
      await this.transactionRunner(async (connection) => {
        const changed = await this.repository.confirmPayment(purchaseUid, verified, connection);
        if (!changed) throw new ApiError(409, 'Purchase changed while payment was being verified.', undefined, 'PURCHASE_STATE_CHANGED');
        await this.repository.recordTransaction(purchaseUid, 'PAYMENT', normalized, 'CONFIRMED', verified, connection);
      });
      row = await this.repository.findByUid(purchaseUid);
      const mintResult = await this.mintService.submit(row, { confirmImmediately: true });
      return {
        purchase: this.present(mintResult.row || row),
        idempotent: false,
        mintSubmitted: Boolean(mintResult.submitted),
        mintConfirmed: Boolean(mintResult.confirmed),
        mintPending: Boolean(mintResult.pending),
      };
    } catch (error) {
      if (!(error instanceof PurchaseBlockchainError)) throw error;
      await this.repository.recordTransaction(purchaseUid, 'PAYMENT', normalized, error.pending ? 'PENDING' : 'FAILED', error.pending ? {} : {
        errorCode: error.code, errorMessage: error.message,
      });
      if (error.pending) await this.repository.schedulePending(purchaseUid, 30);
      else await this.repository.recordError(purchaseUid, 'PAYMENT', error.code, error.message, error.transient ? 30 : null);
      if (error.pending || error.transient) {
        row = await this.repository.findByUid(purchaseUid);
        return { purchase: this.present(row), idempotent: false, pendingVerification: true };
      }
      throw new ApiError(422, 'USDT payment could not be verified.', [{ field: 'txHash', message: error.message }], error.code);
    }
  }

  async retry(user, purchaseUid) {
    this.assertInvestor(user);
    const row = await this.repository.findOwnedByUid(purchaseUid, user.userUid);
    if (!row) throw new ApiError(404, 'Purchase was not found.', undefined, 'PURCHASE_NOT_FOUND');
    if (row.status === 'EXPIRED') {
      throw new ApiError(409, 'This payment intent expired and cannot be retried. Create a new purchase intent.', undefined, 'PURCHASE_EXPIRED');
    }
    if (row.status === 'COMPLETED') return { purchase: this.present(row), alreadyCompleted: true };
    if (row.status === 'MINT_SUBMITTED' && row.errorStage === 'MINT' && row.nextSyncAt === null) {
      await this.repository.resetFailedMint(purchaseUid);
    }
    return { purchase: this.present(await this.repository.queue(purchaseUid)), alreadyCompleted: false };
  }
}

module.exports = { TokenPurchaseService, ceilDiv };
