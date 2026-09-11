const ethers = require('ethers');
const { ApiError } = require('../core/errors/api-error');
const { env } = require('../core/config/env');
const { withTransaction } = require('../database/connection');
const { TokenTransferBlockchainError } = require('./blockchain/token-transfer-blockchain.service');

class TokenTransferService {
  constructor({
    repository,
    blockchain,
    config = env.blockchain,
    transactionRunner = withTransaction,
  }) {
    this.repository = repository;
    this.blockchain = blockchain;
    this.config = config;
    this.transactionRunner = transactionRunner;
  }

  assertInvestor(user) {
    if (user.roleName !== 'Investor') throw ApiError.forbidden('Token transfers are available only to investor accounts.');
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

  present(row, transactions = null, userUid = null) {
    if (!row) return null;
    const direction = userUid
      ? (row.senderUserUid === userUid ? 'SENT' : 'RECEIVED')
      : null;
    return {
      transferUid: row.transferUid,
      tokenUid: row.tokenUid,
      organizationUid: row.organizationUid,
      senderInterestUid: row.senderInterestUid,
      recipientInterestUid: row.recipientInterestUid,
      senderInvestorUid: row.senderInvestorUid,
      recipientInvestorUid: row.recipientInvestorUid,
      direction,
      status: row.status,
      chainId: Number(row.chainId),
      tokenAddress: row.tokenAddress,
      identityRegistryAddress: row.identityRegistryAddress,
      senderWalletAddress: row.senderWalletAddress,
      recipientWalletAddress: row.recipientWalletAddress,
      senderIdentityAddress: row.senderIdentityAddress,
      recipientIdentityAddress: row.recipientIdentityAddress,
      tokenDecimals: Number(row.tokenDecimals),
      tokenPrice: String(row.tokenPrice),
      tokenAmount: String(row.tokenAmount),
      tokenAmountRaw: String(row.tokenAmountRaw),
      transactionRequest: row.status === 'PENDING_TRANSFER' ? {
        contractAddress: row.tokenAddress,
        functionName: 'transfer',
        args: [row.recipientWalletAddress, String(row.tokenAmountRaw)],
        from: row.senderWalletAddress,
        chainId: Number(row.chainId),
      } : null,
      balances: {
        senderBeforeRaw: String(row.senderBalanceBeforeRaw),
        recipientBeforeRaw: String(row.recipientBalanceBeforeRaw),
        senderFrozenBeforeRaw: String(row.senderFrozenBeforeRaw),
        senderAfterRaw: row.senderBalanceAfterRaw === null ? null : String(row.senderBalanceAfterRaw),
        recipientAfterRaw: row.recipientBalanceAfterRaw === null ? null : String(row.recipientBalanceAfterRaw),
        senderFrozenAfterRaw: row.senderFrozenAfterRaw === null ? null : String(row.senderFrozenAfterRaw),
      },
      transaction: {
        txHash: row.txHash || null,
        receivedAt: row.txHashReceivedAt || null,
        blockNumber: row.blockNumber === null ? null : Number(row.blockNumber),
        blockHash: row.blockHash || null,
        transactionIndex: row.transactionIndex,
        logIndex: row.logIndex,
        gasUsed: row.gasUsed || null,
        effectiveGasPrice: row.effectiveGasPrice || null,
        verifiedAt: row.verifiedAt || null,
      },
      expiration: {
        expiresAt: row.expiresAt || null,
        expiredAt: row.expiredAt || null,
        reason: row.expirationReason || null,
      },
      synchronization: {
        status: row.syncStatus,
        attempts: Number(row.syncAttempts || 0),
      },
      error: row.errorCode ? { code: row.errorCode, message: row.errorMessage } : null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      ...(transactions ? {
        transactionHistory: transactions.map((item) => ({
          txHash: item.txHash,
          status: item.status,
          blockNumber: item.blockNumber === null ? null : Number(item.blockNumber),
          blockHash: item.blockHash,
          transactionIndex: item.transactionIndex,
          logIndex: item.logIndex,
          gasUsed: item.gasUsed,
          effectiveGasPrice: item.effectiveGasPrice,
          errorCode: item.errorCode,
          errorMessage: item.errorMessage,
          confirmedAt: item.confirmedAt,
          createdAt: item.createdAt,
        })),
      } : {}),
    };
  }

  validateContext(context) {
    if (!context) {
      throw new ApiError(404, 'Registered sender investment was not found.', undefined, 'REGISTERED_INVESTMENT_NOT_FOUND');
    }
    if (context.senderInterestStatus !== 'registered') {
      throw new ApiError(409, 'Sender must be registered for this token.', undefined, 'SENDER_NOT_REGISTERED');
    }
    if (context.senderProfileStatus !== 'submitted' || !context.senderProfileActive) {
      throw new ApiError(409, 'Sender investor profile is not active.', undefined, 'SENDER_PROFILE_NOT_ACTIVE');
    }
    if (!context.recipientInvestorUid) {
      throw new ApiError(404, 'Recipient investor wallet was not found.', undefined, 'RECIPIENT_INVESTOR_NOT_FOUND');
    }
    if (context.recipientProfileStatus !== 'submitted' || !context.recipientProfileActive) {
      throw new ApiError(409, 'Recipient investor profile is not complete and active.', undefined, 'RECIPIENT_PROFILE_NOT_ACTIVE');
    }
    if (context.recipientInterestStatus !== 'registered') {
      throw new ApiError(409, 'Recipient must be registered for this token.', undefined, 'RECIPIENT_NOT_REGISTERED');
    }
    if (context.tokenStatus !== 'deployed' || !context.tokenActive) {
      throw new ApiError(409, 'Token is not available for transfer.', undefined, 'TOKEN_NOT_AVAILABLE');
    }
    const addresses = [context.tokenAddress, context.identityRegistryAddress,
      context.senderWalletAddress, context.recipientWalletAddress,
      context.senderIdentityAddress, context.recipientIdentityAddress];
    if (!addresses.every(ethers.isAddress)) {
      throw new ApiError(409, 'Token transfer wallet, identity, or contract configuration is incomplete.', undefined, 'TRANSFER_CONFIGURATION_INVALID');
    }
    if (ethers.getAddress(context.senderWalletAddress) === ethers.getAddress(context.recipientWalletAddress)) {
      throw new ApiError(422, 'Sender and recipient wallets must be different.', undefined, 'SELF_TRANSFER_NOT_ALLOWED');
    }
  }

  parseAmount(tokenAmount, tokenDecimals) {
    let tokenAmountRaw;
    try { tokenAmountRaw = ethers.parseUnits(tokenAmount, tokenDecimals); } catch {
      throw new ApiError(422, 'tokenAmount has more decimal places than this token supports.', undefined, 'TOKEN_AMOUNT_INVALID');
    }
    if (tokenAmountRaw <= 0n) {
      throw new ApiError(422, 'tokenAmount must be greater than zero.', undefined, 'TOKEN_AMOUNT_INVALID');
    }
    return {
      tokenAmountRaw,
      tokenAmount: ethers.formatUnits(tokenAmountRaw, tokenDecimals),
    };
  }

  async create(user, tokenUid, input) {
    this.assertInvestor(user);
    const existingByKey = await this.repository.findByIdempotency(user.userUid, input.idempotencyKey);
    if (existingByKey) return { transfer: this.present(existingByKey, null, user.userUid), existing: true };

    const normalizedRecipient = ethers.getAddress(input.recipientWalletAddress);
    const context = await this.repository.findContext(user.userUid, tokenUid, normalizedRecipient);
    this.validateContext(context);
    const active = await this.repository.findActiveBySenderToken(context.senderWalletAddress, context.tokenAddress);
    if (active) return { transfer: this.present(active, null, user.userUid), existing: true };

    const tokenDecimals = Number(context.tokenDecimals);
    const amount = this.parseAmount(input.tokenAmount, tokenDecimals);
    let preparation;
    try {
      preparation = await this.blockchain.prepare({
        tokenAddress: context.tokenAddress,
        identityRegistryAddress: context.identityRegistryAddress,
        senderWalletAddress: context.senderWalletAddress,
        recipientWalletAddress: context.recipientWalletAddress,
        senderIdentityAddress: context.senderIdentityAddress,
        recipientIdentityAddress: context.recipientIdentityAddress,
        tokenAmountRaw: amount.tokenAmountRaw.toString(),
      });
    } catch (error) {
      if (!(error instanceof TokenTransferBlockchainError)) throw error;
      throw new ApiError(error.transient ? 503 : 409, error.message, undefined, error.code);
    }
    if (Number(preparation.tokenDecimals) !== tokenDecimals) {
      throw new ApiError(409, 'On-chain token decimals do not match the backend token record.', undefined, 'TOKEN_DECIMALS_MISMATCH');
    }

    let maxBalanceRaw;
    try { maxBalanceRaw = ethers.parseUnits(String(context.maxBalancePerInvestor), tokenDecimals); } catch {
      throw new ApiError(409, 'Token maximum holder balance is not configured correctly.', undefined, 'TOKEN_BALANCE_CAP_INVALID');
    }
    const pendingIncoming = BigInt(await this.repository.sumPendingIncomingRaw(
      context.tokenAddress,
      context.recipientWalletAddress,
    ));
    if (BigInt(preparation.recipientBalanceBeforeRaw) + pendingIncoming + amount.tokenAmountRaw > maxBalanceRaw) {
      throw new ApiError(409, 'Transfer would exceed the recipient maximum token balance.', undefined, 'RECIPIENT_MAX_BALANCE_EXCEEDED');
    }

    const configuredTtl = Number(this.config.transferIntentTtlMinutes);
    const ttlMinutes = Number.isFinite(configuredTtl) && configuredTtl > 0 ? configuredTtl : 15;
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);
    try {
      const created = await this.repository.create({
        ...context,
        idempotencyKey: input.idempotencyKey,
        chainId: preparation.chainId,
        tokenAddress: ethers.getAddress(context.tokenAddress),
        identityRegistryAddress: ethers.getAddress(context.identityRegistryAddress),
        senderWalletAddress: ethers.getAddress(context.senderWalletAddress),
        recipientWalletAddress: ethers.getAddress(context.recipientWalletAddress),
        senderIdentityAddress: ethers.getAddress(context.senderIdentityAddress),
        recipientIdentityAddress: ethers.getAddress(context.recipientIdentityAddress),
        tokenDecimals,
        tokenPrice: String(context.tokenPrice),
        tokenAmount: amount.tokenAmount,
        tokenAmountRaw: amount.tokenAmountRaw.toString(),
        senderBalanceBeforeRaw: preparation.senderBalanceBeforeRaw,
        recipientBalanceBeforeRaw: preparation.recipientBalanceBeforeRaw,
        senderFrozenBeforeRaw: preparation.senderFrozenBeforeRaw,
        preparedAtBlock: preparation.preparedAtBlock,
        expiresAt,
      });
      return { transfer: this.present(created, null, user.userUid), existing: false };
    } catch (error) {
      if (error?.code !== 'ER_DUP_ENTRY') throw error;
      const raced = await this.repository.findByIdempotency(user.userUid, input.idempotencyKey)
        || await this.repository.findActiveBySenderToken(context.senderWalletAddress, context.tokenAddress);
      if (!raced) throw error;
      return { transfer: this.present(raced, null, user.userUid), existing: true };
    }
  }

  async get(user, transferUid) {
    this.assertInvestor(user);
    const row = await this.repository.findAccessibleByUid(transferUid, user.userUid);
    if (!row) throw new ApiError(404, 'Token transfer was not found.', undefined, 'TOKEN_TRANSFER_NOT_FOUND');
    return this.present(row, await this.repository.listTransactions(transferUid), user.userUid);
  }

  async list(user, tokenUid, query = {}) {
    this.assertInvestor(user);
    const page = Number(query.page || 1);
    const limit = Number(query.limit || 20);
    const result = await this.repository.listAccessibleByToken(user.userUid, tokenUid, {
      page,
      limit,
      search: query.search || '',
      status: query.status || 'all',
      direction: query.direction || 'all',
    });
    return {
      items: result.rows.map((row) => this.present(row, null, user.userUid)),
      pagination: {
        page,
        limit,
        total: result.total,
        totalPages: result.total === 0 ? 0 : Math.ceil(result.total / limit),
      },
    };
  }

  async confirm(user, transferUid, txHash) {
    this.assertInvestor(user);
    let row = await this.repository.findSenderOwnedByUid(transferUid, user.userUid);
    if (!row) throw new ApiError(404, 'Token transfer was not found.', undefined, 'TOKEN_TRANSFER_NOT_FOUND');
    const normalized = txHash.toLowerCase();
    if (row.status === 'COMPLETED') {
      if (String(row.txHash || '').toLowerCase() !== normalized) {
        throw new ApiError(409, 'Transfer is already confirmed with another transaction.', undefined, 'TRANSFER_ALREADY_CONFIRMED');
      }
      return { transfer: this.present(row, null, user.userUid), idempotent: true };
    }
    if (row.status === 'EXPIRED') return { transfer: this.present(row, null, user.userUid), expired: true };
    if (row.status === 'MANUAL_REVIEW') {
      throw new ApiError(409, 'Transfer requires manual review.', undefined, 'TRANSFER_MANUAL_REVIEW');
    }

    const used = await this.repository.findByTxHash(normalized);
    if (used && used.transferUid !== transferUid) {
      throw new ApiError(409, 'Transaction hash is already assigned to another transfer.', undefined, 'TRANSFER_TRANSACTION_ALREADY_USED');
    }
    const allowReplacement = Boolean(row.txHash && row.errorCode && row.nextSyncAt === null);
    try { row = await this.repository.assignHash(transferUid, normalized, allowReplacement); } catch (error) {
      if (error?.code === 'ER_DUP_ENTRY') {
        throw new ApiError(409, 'Transaction hash is already assigned to another transfer.', undefined, 'TRANSFER_TRANSACTION_ALREADY_USED');
      }
      throw error;
    }
    if (String(row.txHash || '').toLowerCase() !== normalized) {
      throw new ApiError(409, 'Transfer is awaiting another transaction.', undefined, 'TRANSFER_TRANSACTION_ALREADY_ASSIGNED');
    }

    await this.repository.recordTransaction(transferUid, normalized, 'RECEIVED');
    try {
      const verified = await this.blockchain.verify(normalized, this.expected(row), {
        confirmations: Math.max(1, Number(this.config.transferConfirmations || 12)),
      });
      await this.transactionRunner(async (connection) => {
        const changed = await this.repository.confirm(transferUid, verified, connection);
        if (!changed) throw new ApiError(409, 'Transfer changed while it was being verified.', undefined, 'TRANSFER_STATE_CHANGED');
        await this.repository.recordTransaction(transferUid, normalized, 'CONFIRMED', verified, connection);
      });
      row = await this.repository.findByUid(transferUid);
      return { transfer: this.present(row, null, user.userUid), idempotent: false };
    } catch (error) {
      if (!(error instanceof TokenTransferBlockchainError)) throw error;
      await this.repository.recordTransaction(transferUid, normalized, error.pending ? 'PENDING' : 'FAILED', {
        errorCode: error.pending ? null : error.code,
        errorMessage: error.pending ? null : error.message,
      });
      if (error.pending || error.transient) {
        await this.repository.schedulePending(transferUid, 30);
        row = await this.repository.findByUid(transferUid);
        return { transfer: this.present(row, null, user.userUid), pendingVerification: true };
      }
      await this.repository.recordError(transferUid, error.code, error.message, null);
      throw new ApiError(422, 'Token transfer could not be verified.', [{ field: 'txHash', message: error.message }], error.code);
    }
  }

  async retry(user, transferUid) {
    this.assertInvestor(user);
    const row = await this.repository.findSenderOwnedByUid(transferUid, user.userUid);
    if (!row) throw new ApiError(404, 'Token transfer was not found.', undefined, 'TOKEN_TRANSFER_NOT_FOUND');
    if (row.status === 'COMPLETED') {
      return { transfer: this.present(row, null, user.userUid), alreadyCompleted: true };
    }
    if (row.status === 'EXPIRED') {
      throw new ApiError(409, 'Transfer intent expired. Create a new transfer intent.', undefined, 'TRANSFER_EXPIRED');
    }
    if (row.status === 'MANUAL_REVIEW') {
      throw new ApiError(409, 'Transfer requires manual review.', undefined, 'TRANSFER_MANUAL_REVIEW');
    }
    if (row.errorCode && row.nextSyncAt === null) {
      return { transfer: this.present(row, null, user.userUid), transactionRequired: true };
    }
    return {
      transfer: this.present(await this.repository.queue(transferUid), null, user.userUid),
      syncing: true,
    };
  }
}

module.exports = { TokenTransferService };
