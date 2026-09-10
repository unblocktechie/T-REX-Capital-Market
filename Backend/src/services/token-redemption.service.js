const ethers = require('ethers');
const { ApiError } = require('../core/errors/api-error');
const { env } = require('../core/config/env');
const { withTransaction } = require('../database/connection');
const { createUid } = require('../utils/token');
const { RedemptionBlockchainError } = require('./blockchain/token-redemption-blockchain.service');

const PENDING_CODES = new Set(['TRANSACTION_NOT_FOUND', 'INSUFFICIENT_CONFIRMATIONS', 'RPC_UNAVAILABLE', 'CHAIN_REORGANIZATION']);
const TERMINAL_STATUSES = new Set(['COMPLETED', 'ISSUER_REJECTED', 'CANCELLED', 'EXPIRED', 'MANUAL_REVIEW']);

const ceilDiv = (value, divisor) => (value + divisor - 1n) / divisor;

class TokenRedemptionService {
  constructor({ repository, blockchain, executionService, config = env.blockchain, transactionRunner = withTransaction }) {
    this.repository = repository;
    this.blockchain = blockchain;
    this.executionService = executionService;
    this.config = config;
    this.transactionRunner = transactionRunner;
  }

  assertInvestor(user) {
    if (user.roleName !== 'Investor') throw ApiError.forbidden('Token redemptions are available only to investor accounts.');
  }

  assertIssuer(user) {
    if (user.roleName !== 'Issuer') throw ApiError.forbidden('This action is available only to issuer accounts.');
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

  present(row, { history, transactions, includeAuthorization = true } = {}) {
    if (!row) return null;
    const payload = includeAuthorization && row.status === 'PENDING_INVESTOR_AUTHORIZATION'
      ? this.blockchain.authorizationPayload(row) : null;
    return {
      redemptionUid: row.redemptionUid, interestUid: row.interestUid, tokenUid: row.tokenUid,
      tokenName: row.tokenName || undefined, tokenSymbol: row.tokenSymbol || undefined,
      investorName: row.investorName || undefined, status: row.status, chainId: Number(row.chainId),
      tokenAddress: row.tokenAddress, usdtContractAddress: row.usdtContractAddress,
      investorWalletAddress: row.investorWalletAddress,
      issuerPaymentWalletAddress: row.issuerPaymentWalletAddress,
      platformWalletAddress: row.platformWalletAddress,
      tokenAmount: String(row.tokenAmount), tokenAmountRaw: String(row.tokenAmountRaw),
      tokenDecimals: Number(row.tokenDecimals), tokenPrice: String(row.tokenPrice),
      usdtAmount: String(row.usdtAmount), usdtAmountRaw: String(row.usdtAmountRaw),
      usdtDecimals: Number(row.usdtDecimals),
      authorization: {
        required: !row.authorizationSignature, authorizedAt: row.authorizedAt || null,
        deadline: row.authorizationDeadline, typedData: payload,
      },
      issuerDecision: {
        decidedAt: row.issuerDecisionAt || null, note: row.issuerDecisionNote || null,
        rejectionReason: row.rejectionReason || null,
      },
      lock: this.stage(row, 'lock'), payment: this.stage(row, 'payment'),
      burn: this.stage(row, 'burn'), unlock: this.stage(row, 'unlock'),
      error: row.errorCode ? { stage: row.errorStage, code: row.errorCode, message: row.errorMessage } : null,
      synchronization: { status: row.syncStatus, attempts: Number(row.syncAttempts || 0) },
      expiresAt: row.expiresAt, createdAt: row.createdAt, updatedAt: row.updatedAt,
      ...(history ? { history: history.map((item) => ({
        eventType: item.eventType, fromStatus: item.fromStatus, toStatus: item.toStatus,
        actorRole: item.actorRole, actorUserUid: item.actorUserUid, message: item.message,
        metadata: typeof item.metadata === 'string' ? JSON.parse(item.metadata) : item.metadata,
        createdAt: item.createdAt,
      })) } : {}),
      ...(transactions ? { transactionHistory: transactions.map((item) => ({
        stage: item.stage, txHash: item.txHash, status: item.status,
        blockNumber: item.blockNumber === null ? null : Number(item.blockNumber), blockHash: item.blockHash,
        transactionIndex: item.transactionIndex, logIndex: item.logIndex, gasUsed: item.gasUsed,
        effectiveGasPrice: item.effectiveGasPrice, errorCode: item.errorCode,
        errorMessage: item.errorMessage, confirmedAt: item.confirmedAt, createdAt: item.createdAt,
      })) } : {}),
    };
  }

  stage(row, prefix) {
    const txHash = row[`${prefix}TxHash`] || null;
    const result = { status: row[`${prefix}Status`], txHash };
    if (prefix === 'payment') result.requestedAtBlock = row.paymentRequestedAtBlock === null ? null : Number(row.paymentRequestedAtBlock);
    if (prefix === 'unlock') result.amountRaw = row.unlockAmountRaw || null;
    const blockNumber = row[`${prefix}BlockNumber`];
    result.blockNumber = blockNumber === null ? null : Number(blockNumber);
    result.blockHash = row[`${prefix}BlockHash`] || null;
    result.transactionIndex = row[`${prefix}TransactionIndex`] ?? null;
    result.logIndex = row[`${prefix}LogIndex`] ?? null;
    result.gasUsed = row[`${prefix}GasUsed`] || null;
    result.effectiveGasPrice = row[`${prefix}EffectiveGasPrice`] || null;
    result.submittedAt = row[`${prefix}SubmittedAt`] || row.paymentTxReceivedAt || null;
    result.confirmedAt = row[`${prefix}ConfirmedAt`] || row.paymentVerifiedAt || null;
    return result;
  }

  validateContext(context) {
    if (!context) throw new ApiError(404, 'Registered investment was not found.', undefined, 'REGISTERED_INVESTMENT_NOT_FOUND');
    if (context.interestStatus !== 'registered') throw new ApiError(409, 'Investor must be registered for this token before redeeming.', undefined, 'INVESTOR_NOT_REGISTERED');
    if (context.tokenStatus !== 'deployed' || !context.tokenActive) throw new ApiError(409, 'Token is not available for redemption.', undefined, 'TOKEN_NOT_AVAILABLE');
    if (context.investorStatus !== 'submitted' || !context.investorActive || context.investorDeleted) throw new ApiError(409, 'Investor profile is not active.', undefined, 'INVESTOR_NOT_ACTIVE');
    if (context.organizationStatus !== 'approved' || !context.organizationActive) throw new ApiError(409, 'Issuer organization is not active.', undefined, 'ISSUER_NOT_ACTIVE');
    if (context.hasActivePurchase) throw new ApiError(409, 'Complete the active token purchase before starting a redemption.', undefined, 'ACTIVE_PURCHASE_EXISTS');
    if (![context.tokenAddress, context.investorWalletAddress, context.treasuryWalletAddress, this.config.redemptionUsdtAddress].every(ethers.isAddress)) {
      throw new ApiError(409, 'Redemption wallet or contract configuration is incomplete.', undefined, 'REDEMPTION_CONFIGURATION_INVALID');
    }
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
      tokenAmountRaw: tokenAmountRaw.toString(), usdtAmountRaw: usdtAmountRaw.toString(),
      tokenAmount: ethers.formatUnits(tokenAmountRaw, tokenDecimals), usdtAmount: ethers.formatUnits(usdtAmountRaw, usdtDecimals),
    };
  }

  async create(user, tokenUid, input) {
    this.assertInvestor(user);
    const previous = await this.repository.findByIdempotency(user.userUid, input.idempotencyKey);
    if (previous) return { redemption: this.present(previous), existing: true };
    const context = await this.repository.findContext(user.userUid, tokenUid);
    this.validateContext(context);
    const active = await this.repository.findActiveByInterest(context.interestUid);
    if (active) return { redemption: this.present(active), existing: true };
    let preparation;
    try {
      preparation = await this.blockchain.prepare({
        usdtContractAddress: this.config.redemptionUsdtAddress,
        tokenAddress: context.tokenAddress, investorWalletAddress: context.investorWalletAddress,
      });
    } catch (error) {
      if (!(error instanceof RedemptionBlockchainError)) throw error;
      throw new ApiError(error.transient ? 503 : 409, error.message, undefined, error.code);
    }
    if (!preparation.platformIsAgent) throw new ApiError(409, 'Platform wallet is not authorized as Token Agent.', undefined, 'PLATFORM_NOT_TOKEN_AGENT');
    const amounts = this.calculate(input.tokenAmount, Number(context.tokenDecimals), context.tokenPrice, preparation.usdtDecimals);
    const freeBalance = BigInt(preparation.balanceBeforeRaw) - BigInt(preparation.frozenBeforeRaw);
    if (BigInt(amounts.tokenAmountRaw) > freeBalance) {
      throw new ApiError(409, 'Redemption amount exceeds the investor available token balance.', undefined, 'INSUFFICIENT_AVAILABLE_TOKEN_BALANCE');
    }
    const ttlMinutes = Math.max(5, Number(this.config.redemptionAuthorizationTtlMinutes || 30));
    const deadline = new Date(Date.now() + ttlMinutes * 60000);
    try {
      const created = await this.transactionRunner(async (connection) => {
        const row = await this.repository.create({
          ...context, ...preparation, ...amounts, investorUserUid: user.userUid,
          idempotencyKey: input.idempotencyKey, authorizationNonce: createUid(),
          authorizationDeadline: deadline, expiresAt: deadline,
          usdtContractAddress: ethers.getAddress(this.config.redemptionUsdtAddress),
          tokenAddress: ethers.getAddress(context.tokenAddress),
          investorWalletAddress: ethers.getAddress(context.investorWalletAddress),
          issuerPaymentWalletAddress: ethers.getAddress(context.treasuryWalletAddress),
          tokenDecimals: Number(context.tokenDecimals), tokenPrice: context.tokenPrice,
        }, connection);
        await this.repository.addHistory({
          redemptionUid: row.redemptionUid, eventType: 'CREATED', toStatus: row.status,
          actorRole: 'investor', actorUserUid: user.userUid,
          message: 'Redemption intent created; investor wallet authorization is required.',
        }, connection);
        return row;
      });
      return { redemption: this.present(created), existing: false };
    } catch (error) {
      if (error?.code !== 'ER_DUP_ENTRY') throw error;
      const raced = await this.repository.findByIdempotency(user.userUid, input.idempotencyKey)
        || await this.repository.findActiveByInterest(context.interestUid);
      if (!raced) throw error;
      return { redemption: this.present(raced), existing: true };
    }
  }

  async authorize(user, redemptionUid, signature) {
    this.assertInvestor(user);
    let row = await this.repository.findOwned(redemptionUid, user.userUid);
    if (!row) throw new ApiError(404, 'Redemption was not found.', undefined, 'REDEMPTION_NOT_FOUND');
    if (row.status === 'PENDING_ISSUER_APPROVAL' && row.authorizationSignature) return { redemption: this.present(row), idempotent: true };
    if (row.status !== 'PENDING_INVESTOR_AUTHORIZATION') throw new ApiError(409, 'Redemption can no longer be authorized.', undefined, 'REDEMPTION_NOT_AWAITING_AUTHORIZATION');
    let verified;
    try { verified = this.blockchain.verifyAuthorization(row, signature); } catch (error) {
      if (!(error instanceof RedemptionBlockchainError)) throw error;
      throw new ApiError(422, error.message, undefined, error.code);
    }
    await this.transactionRunner(async (connection) => {
      const current = await this.repository.findForUpdate(redemptionUid, connection);
      if (current.status === 'PENDING_ISSUER_APPROVAL' && current.authorizationSignature) return;
      const changed = await this.repository.transition(redemptionUid, 'PENDING_INVESTOR_AUTHORIZATION', {
        status: 'PENDING_ISSUER_APPROVAL', authorizationSignature: verified.signature,
        authorizedAt: new Date(), errorStage: null, errorCode: null, errorMessage: null,
      }, connection);
      if (!changed) throw new ApiError(409, 'Redemption state changed during authorization.', undefined, 'REDEMPTION_STATE_CHANGED');
      await this.repository.addHistory({
        redemptionUid, eventType: 'INVESTOR_AUTHORIZED', fromStatus: 'PENDING_INVESTOR_AUTHORIZATION',
        toStatus: 'PENDING_ISSUER_APPROVAL', actorRole: 'investor', actorUserUid: user.userUid,
        message: 'Investor wallet authorization verified.', metadata: { signer: verified.signer },
      }, connection);
    });
    row = await this.repository.findByUid(redemptionUid);
    return { redemption: this.present(row), idempotent: false };
  }

  async getInvestor(user, redemptionUid) {
    this.assertInvestor(user);
    const row = await this.repository.findOwned(redemptionUid, user.userUid);
    if (!row) throw new ApiError(404, 'Redemption was not found.', undefined, 'REDEMPTION_NOT_FOUND');
    return this.present(row, {
      history: await this.repository.listHistory(redemptionUid),
      transactions: await this.repository.listTransactions(redemptionUid),
    });
  }

  async listInvestor(user, tokenUid, query) {
    this.assertInvestor(user);
    const result = await this.repository.listInvestor(user.userUid, tokenUid, query);
    return { items: result.rows.map((row) => this.present(row)), pagination: this.pagination(result) };
  }

  async listIssuer(user, query) {
    this.assertIssuer(user);
    const result = await this.repository.listIssuer(user.userUid, query);
    return { items: result.rows.map((row) => this.present(row, { includeAuthorization: false })), pagination: this.pagination(result) };
  }

  pagination(result) {
    return { page: result.page, limit: result.limit, total: result.total, totalPages: result.total ? Math.ceil(result.total / result.limit) : 0 };
  }

  async getIssuer(user, redemptionUid) {
    this.assertIssuer(user);
    const row = await this.repository.findIssuerOwned(redemptionUid, user.userUid);
    if (!row) throw new ApiError(404, 'Redemption was not found.', undefined, 'REDEMPTION_NOT_FOUND');
    return this.present(row, {
      history: await this.repository.listHistory(redemptionUid),
      transactions: await this.repository.listTransactions(redemptionUid), includeAuthorization: false,
    });
  }

  async approve(user, redemptionUid, note) {
    this.assertIssuer(user);
    let row = await this.repository.findIssuerOwned(redemptionUid, user.userUid);
    if (!row) throw new ApiError(404, 'Redemption was not found.', undefined, 'REDEMPTION_NOT_FOUND');
    if (!['PENDING_ISSUER_APPROVAL', 'ISSUER_APPROVED', 'TOKEN_LOCK_SUBMITTED'].includes(row.status)) {
      throw new ApiError(409, 'Redemption is not awaiting issuer approval.', undefined, 'REDEMPTION_NOT_AWAITING_APPROVAL');
    }
    if (row.status === 'PENDING_ISSUER_APPROVAL') {
      await this.transactionRunner(async (connection) => {
        const changed = await this.repository.transition(redemptionUid, 'PENDING_ISSUER_APPROVAL', {
          status: 'ISSUER_APPROVED', issuerDecisionAt: new Date(), issuerDecisionNote: note || null,
          lockStatus: 'QUEUED', syncStatus: 'QUEUED', syncRequestedAt: new Date(), nextSyncAt: new Date(),
        }, connection);
        if (!changed) throw new ApiError(409, 'Redemption state changed during approval.', undefined, 'REDEMPTION_STATE_CHANGED');
        await this.repository.addHistory({
          redemptionUid, eventType: 'ISSUER_APPROVED', fromStatus: 'PENDING_ISSUER_APPROVAL',
          toStatus: 'ISSUER_APPROVED', actorRole: 'issuer', actorUserUid: user.userUid,
          message: note || 'Issuer approved the redemption request.',
        }, connection);
      });
      row = await this.repository.findByUid(redemptionUid);
    }
    const execution = row.status === 'ISSUER_APPROVED' ? await this.executionService.submit('LOCK', row) : { row, idempotent: true };
    return { redemption: this.present(execution.row || row, { includeAuthorization: false }), lockSubmitted: Boolean(execution.submitted), idempotent: execution.idempotent };
  }

  async reject(user, redemptionUid, reason) {
    this.assertIssuer(user);
    const row = await this.repository.findIssuerOwned(redemptionUid, user.userUid);
    if (!row) throw new ApiError(404, 'Redemption was not found.', undefined, 'REDEMPTION_NOT_FOUND');
    if (row.status === 'ISSUER_REJECTED') return { redemption: this.present(row), idempotent: true };
    await this.transactionRunner(async (connection) => {
      const changed = await this.repository.transition(redemptionUid, 'PENDING_ISSUER_APPROVAL', {
        status: 'ISSUER_REJECTED', issuerDecisionAt: new Date(), rejectionReason: reason,
        lockStatus: 'NOT_REQUIRED', paymentStatus: 'NOT_REQUIRED', burnStatus: 'NOT_REQUIRED',
        unlockStatus: 'NOT_REQUIRED', syncStatus: 'IDLE', nextSyncAt: null,
      }, connection);
      if (!changed) throw new ApiError(409, 'Only a request awaiting issuer approval can be rejected.', undefined, 'REDEMPTION_NOT_AWAITING_APPROVAL');
      await this.repository.addHistory({
        redemptionUid, eventType: 'ISSUER_REJECTED', fromStatus: 'PENDING_ISSUER_APPROVAL',
        toStatus: 'ISSUER_REJECTED', actorRole: 'issuer', actorUserUid: user.userUid, message: reason,
      }, connection);
    });
    return { redemption: this.present(await this.repository.findByUid(redemptionUid)), idempotent: false };
  }

  async confirmPayment(user, redemptionUid, txHash) {
    this.assertIssuer(user);
    let row = await this.repository.findIssuerOwned(redemptionUid, user.userUid);
    if (!row) throw new ApiError(404, 'Redemption was not found.', undefined, 'REDEMPTION_NOT_FOUND');
    const normalized = txHash.toLowerCase();
    if (['PAYMENT_CONFIRMED', 'BURN_SUBMITTED', 'BURN_CONFIRMED', 'UNLOCK_SUBMITTED', 'COMPLETED'].includes(row.status)) {
      if (String(row.paymentTxHash || '').toLowerCase() !== normalized) throw new ApiError(409, 'Redemption is already linked to another payment transaction.', undefined, 'PAYMENT_ALREADY_CONFIRMED');
      return { redemption: this.present(row, { includeAuthorization: false }), idempotent: true, pending: false };
    }
    if (!['TOKENS_LOCKED', 'PAYMENT_SUBMITTED'].includes(row.status)) throw new ApiError(409, 'Tokens must be locked before issuer payment can be verified.', undefined, 'TOKENS_NOT_LOCKED');
    const used = await this.repository.findByTransactionHash(normalized);
    if (used && used.redemptionUid !== redemptionUid) throw new ApiError(409, 'Transaction is already associated with another redemption.', undefined, 'TRANSACTION_ALREADY_USED');
    if (row.paymentTxHash && String(row.paymentTxHash).toLowerCase() !== normalized) {
      throw new ApiError(409, 'A different payment transaction is already being verified.', undefined, 'PAYMENT_TRANSACTION_ALREADY_ASSIGNED');
    }
    if (!row.paymentTxHash) {
      await this.transactionRunner(async (connection) => {
        const changed = await this.repository.transition(redemptionUid, 'TOKENS_LOCKED', {
          status: 'PAYMENT_SUBMITTED', paymentStatus: 'SUBMITTED', paymentTxHash: normalized,
          paymentTxReceivedAt: new Date(), syncStatus: 'QUEUED', syncRequestedAt: new Date(), nextSyncAt: new Date(),
        }, connection);
        if (!changed) throw new ApiError(409, 'Redemption changed before payment verification.', undefined, 'REDEMPTION_STATE_CHANGED');
        await this.repository.recordTransaction(redemptionUid, 'PAYMENT', normalized, 'RECEIVED', {}, connection);
        await this.repository.addHistory({
          redemptionUid, eventType: 'PAYMENT_RECEIVED', fromStatus: 'TOKENS_LOCKED',
          toStatus: 'PAYMENT_SUBMITTED', actorRole: 'issuer', actorUserUid: user.userUid,
          message: 'Issuer submitted a USDT payment transaction hash.', metadata: { txHash: normalized },
        }, connection);
      });
      row = await this.repository.findByUid(redemptionUid);
    }
    try {
      const verified = await this.blockchain.verifyPayment(normalized, this.expected(row));
      await this.finalizePayment(row, verified, user.userUid);
    } catch (error) {
      if (!(error instanceof RedemptionBlockchainError)) throw error;
      await this.repository.recordTransaction(redemptionUid, 'PAYMENT', normalized,
        (error.pending || error.transient) ? 'PENDING' : 'FAILED', { errorCode: error.code, errorMessage: error.message });
      if (error.pending || error.transient || PENDING_CODES.has(error.code)) {
        await this.repository.recordError(redemptionUid, 'PAYMENT', error.code, error.message, 30);
        return { redemption: this.present(await this.repository.findByUid(redemptionUid), { includeAuthorization: false }), pending: true, idempotent: false };
      }
      await this.transactionRunner(async (connection) => {
        await this.repository.transition(redemptionUid, 'PAYMENT_SUBMITTED', {
          status: 'TOKENS_LOCKED', paymentStatus: 'AWAITING_ISSUER', paymentTxHash: null,
          paymentTxReceivedAt: null, errorStage: 'PAYMENT', errorCode: error.code,
          errorMessage: error.message, syncStatus: 'IDLE', nextSyncAt: null,
        }, connection);
      });
      throw new ApiError(422, 'Redemption payment could not be verified.', [{ field: 'txHash', message: error.message }], error.code);
    }
    row = await this.repository.findByUid(redemptionUid);
    const execution = await this.executionService.submit('BURN', row);
    return { redemption: this.present(execution.row || row, { includeAuthorization: false }), pending: false, burnSubmitted: Boolean(execution.submitted), idempotent: false };
  }

  async finalizePayment(row, verified, actorUserUid = null) {
    await this.transactionRunner(async (connection) => {
      const current = await this.repository.findForUpdate(row.redemptionUid, connection);
      if (['PAYMENT_CONFIRMED', 'BURN_SUBMITTED', 'BURN_CONFIRMED', 'UNLOCK_SUBMITTED', 'COMPLETED'].includes(current.status)) return;
      const changed = await this.repository.transition(row.redemptionUid, ['PAYMENT_SUBMITTED', 'TOKENS_LOCKED'], {
        status: 'PAYMENT_CONFIRMED', paymentStatus: 'CONFIRMED', paymentTxHash: verified.txHash,
        paymentBlockNumber: verified.blockNumber, paymentBlockHash: verified.blockHash,
        paymentTransactionIndex: verified.transactionIndex, paymentLogIndex: verified.logIndex,
        paymentGasUsed: verified.gasUsed, paymentEffectiveGasPrice: verified.effectiveGasPrice,
        paymentVerifiedAt: new Date(), burnStatus: 'QUEUED', syncStatus: 'QUEUED',
        syncRequestedAt: new Date(), nextSyncAt: new Date(), errorStage: null, errorCode: null, errorMessage: null,
      }, connection);
      if (!changed) throw new RedemptionBlockchainError('REDEMPTION_STATE_CHANGED', 'Redemption changed during payment finalization.', { transient: true });
      await this.repository.recordTransaction(row.redemptionUid, 'PAYMENT', verified.txHash, 'CONFIRMED', verified, connection);
      await this.repository.addHistory({
        redemptionUid: row.redemptionUid, eventType: 'PAYMENT_CONFIRMED', fromStatus: current.status,
        toStatus: 'PAYMENT_CONFIRMED', actorRole: actorUserUid ? 'issuer' : 'system', actorUserUid,
        message: 'Issuer USDT payment independently verified on-chain.', metadata: { txHash: verified.txHash },
      }, connection);
    });
  }

  async cancel(user, redemptionUid) {
    this.assertInvestor(user);
    const row = await this.repository.findOwned(redemptionUid, user.userUid);
    if (!row) throw new ApiError(404, 'Redemption was not found.', undefined, 'REDEMPTION_NOT_FOUND');
    if (row.status === 'CANCELLED') return { redemption: this.present(row), idempotent: true };
    if (['PENDING_INVESTOR_AUTHORIZATION', 'PENDING_ISSUER_APPROVAL'].includes(row.status)) {
      await this.transactionRunner(async (connection) => {
        const changed = await this.repository.transition(redemptionUid, row.status, {
          status: 'CANCELLED', lockStatus: 'NOT_REQUIRED', paymentStatus: 'NOT_REQUIRED',
          burnStatus: 'NOT_REQUIRED', unlockStatus: 'NOT_REQUIRED', syncStatus: 'IDLE', nextSyncAt: null,
        }, connection);
        if (!changed) throw new ApiError(409, 'Redemption changed during cancellation.', undefined, 'REDEMPTION_STATE_CHANGED');
        await this.repository.addHistory({
          redemptionUid, eventType: 'CANCELLED', fromStatus: row.status, toStatus: 'CANCELLED',
          actorRole: 'investor', actorUserUid: user.userUid, message: 'Investor cancelled the redemption request.',
        }, connection);
      });
      return { redemption: this.present(await this.repository.findByUid(redemptionUid)), idempotent: false };
    }
    if (['ISSUER_APPROVED', 'TOKEN_LOCK_SUBMITTED', 'TOKENS_LOCKED'].includes(row.status)) {
      await this.transactionRunner(async (connection) => {
        const changed = await this.repository.transition(redemptionUid, row.status, {
          status: 'CANCELLATION_PENDING', paymentStatus: 'NOT_REQUIRED', burnStatus: 'NOT_REQUIRED',
          unlockStatus: row.lockStatus === 'CONFIRMED' ? 'QUEUED' : 'NOT_STARTED',
          unlockAmountRaw: row.lockStatus === 'CONFIRMED' ? String(row.tokenAmountRaw) : null,
          syncStatus: 'QUEUED', syncRequestedAt: new Date(), nextSyncAt: new Date(),
        }, connection);
        if (!changed) throw new ApiError(409, 'Redemption changed during cancellation.', undefined, 'REDEMPTION_STATE_CHANGED');
        await this.repository.addHistory({
          redemptionUid, eventType: 'CANCELLATION_REQUESTED', fromStatus: row.status,
          toStatus: 'CANCELLATION_PENDING', actorRole: 'investor', actorUserUid: user.userUid,
          message: 'Cancellation queued; any confirmed token lock will be released first.',
        }, connection);
      });
      const current = await this.repository.findByUid(redemptionUid);
      if (current.unlockStatus === 'QUEUED') await this.executionService.submit('UNLOCK', current);
      return { redemption: this.present(await this.repository.findByUid(redemptionUid)), idempotent: false };
    }
    throw new ApiError(409, 'Redemption cannot be cancelled after issuer payment submission.', undefined, 'REDEMPTION_CANCELLATION_NOT_ALLOWED');
  }

  async retry(user, redemptionUid) {
    if (!['Investor', 'Issuer'].includes(user.roleName)) throw ApiError.forbidden();
    const row = user.roleName === 'Investor'
      ? await this.repository.findOwned(redemptionUid, user.userUid)
      : await this.repository.findIssuerOwned(redemptionUid, user.userUid);
    if (!row) throw new ApiError(404, 'Redemption was not found.', undefined, 'REDEMPTION_NOT_FOUND');
    if (!TERMINAL_STATUSES.has(row.status)) await this.repository.queue(redemptionUid);
    return { redemption: this.present(await this.repository.findByUid(redemptionUid)), terminal: TERMINAL_STATUSES.has(row.status) };
  }
}

module.exports = { TokenRedemptionService, PENDING_CODES, TERMINAL_STATUSES };
