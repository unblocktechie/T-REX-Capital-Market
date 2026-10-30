const { ethers } = require('ethers');
const { ApiError } = require('../core/errors/api-error');
const { withTransaction } = require('../database/connection');
const { logger } = require('./common/log.service');

class PaymentTokenAdminService {
  constructor({ repository, chainRuntimeService, imageService, transactionRunner = withTransaction }) {
    this.repository = repository;
    this.chainRuntimeService = chainRuntimeService;
    this.imageService = imageService;
    this.transactionRunner = transactionRunner;
  }

  list(query) { return this.repository.listAdmin(query); }

  async get(paymentTokenUid) {
    const token = await this.repository.findByUid(paymentTokenUid);
    if (!token) throw ApiError.notFound('Payment token was not found.');
    return token;
  }

  async normalized(input, existing = null) {
    const chainUid = input.chainUid || existing?.chainUid;
    const chain = await this.chainRuntimeService.byUid(chainUid);
    const contractAddress = input.contractAddress ? ethers.getAddress(input.contractAddress) : existing?.contractAddress;
    if (contractAddress === ethers.ZeroAddress) {
      throw new ApiError(422, 'contractAddress cannot be the zero address.', [{ field: 'contractAddress', message: 'Zero address is not allowed.' }], 'INVALID_PAYMENT_TOKEN_ADDRESS');
    }
    return {
      ...input,
      chainUid,
      chainId: chain.chainId,
      networkName: chain.networkName,
      contractAddress,
      paymentTokenCode: input.paymentTokenCode?.toUpperCase(),
      paymentTokenSymbol: input.paymentTokenSymbol?.toUpperCase(),
      explorerUrl: input.explorerUrl === undefined ? existing?.explorerUrl : input.explorerUrl,
    };
  }

  duplicateError(error) {
    if (error?.code !== 'ER_DUP_ENTRY') return error;
    return new ApiError(409, 'This payment token code or contract address already exists on the selected chain.', undefined, 'PAYMENT_TOKEN_ALREADY_EXISTS');
  }

  async create(input, file = null) {
    const data = await this.normalized({
      supportsPurchase: true, supportsRedemption: true, isDefault: false,
      displayOrder: 0, isActive: true, ...input,
    });
    let processed;
    try {
      if (file) {
        processed = await this.imageService.process(file);
        Object.assign(data, processed.fields);
      }
      return await this.transactionRunner(async (connection) => {
        if (data.isDefault) await this.repository.clearDefault(data.chainUid, '', connection);
        return this.repository.create(data, connection);
      });
    } catch (error) {
      if (processed) await this.imageService.remove(processed.fields.imageStorageKey).catch(() => {});
      throw this.duplicateError(error);
    }
  }

  async update(paymentTokenUid, input) {
    const existing = await this.get(paymentTokenUid);
    const hasPurchaseCapability = Object.prototype.hasOwnProperty.call(input, 'supportsPurchase');
    const hasRedemptionCapability = Object.prototype.hasOwnProperty.call(input, 'supportsRedemption');
    if (hasPurchaseCapability || hasRedemptionCapability) {
      throw new ApiError(422, 'Payment-token purchase and redemption capabilities cannot be edited after creation.', [
        ...(hasPurchaseCapability ? [{ field: 'supportsPurchase', message: 'This field is immutable.' }] : []),
        ...(hasRedemptionCapability ? [{ field: 'supportsRedemption', message: 'This field is immutable.' }] : []),
      ], 'IMMUTABLE_PAYMENT_TOKEN_CAPABILITY');
    }
    const data = await this.normalized(input, existing);
    if (data.chainUid !== existing.chainUid) {
      if (existing.isDefault) {
        throw new ApiError(409, 'A default payment token cannot be moved to another chain. Assign another default first.', undefined, 'DEFAULT_PAYMENT_TOKEN_CHAIN_IMMUTABLE');
      }
      const counts = await this.repository.dependencyCounts(paymentTokenUid);
      if (Number(counts.configuredTokens) || Number(counts.transactions)) {
        throw new ApiError(409, 'A payment token cannot be moved to another chain after it is in use.', counts, 'PAYMENT_TOKEN_CHAIN_IMMUTABLE');
      }
    }
    if (existing.isDefault && data.isDefault === false) {
      throw ApiError.conflict('Assign another default payment token before removing the current default.');
    }
    try {
      return await this.transactionRunner(async (connection) => {
        if (data.isDefault) await this.repository.clearDefault(data.chainUid, paymentTokenUid, connection);
        return this.repository.update(paymentTokenUid, data, connection);
      });
    } catch (error) {
      throw this.duplicateError(error);
    }
  }

  async remove(paymentTokenUid) {
    const existing = await this.get(paymentTokenUid);
    if (existing.isDefault) throw ApiError.conflict('A default payment token cannot be deleted. Assign another default first.');
    const counts = await this.repository.dependencyCounts(paymentTokenUid);
    if (Number(counts.configuredTokens) || Number(counts.transactions)) {
      throw new ApiError(409, 'Payment token is in use and cannot be deleted. Disable it instead.', counts, 'PAYMENT_TOKEN_IN_USE');
    }
    await this.repository.update(paymentTokenUid, { isDeleted: true, isActive: false });
  }

  async updateImage(paymentTokenUid, file) {
    const existing = await this.repository.findRawByUid(paymentTokenUid);
    if (!existing) throw ApiError.notFound('Payment token was not found.');
    if (!file) throw new ApiError(422, 'An image is required.', [{ field: 'image', message: 'image is required.' }], 'MASTER_IMAGE_REQUIRED');
    const processed = await this.imageService.process(file);
    try {
      const updated = await this.repository.update(paymentTokenUid, processed.fields);
      if (existing.imageStorageKey && existing.imageStorageKey !== processed.fields.imageStorageKey) {
        await this.imageService.remove(existing.imageStorageKey).catch((error) => {
          logger.warn('Old payment-token image could not be removed after replacement', { paymentTokenUid, error: error.message });
        });
      }
      return updated;
    } catch (error) {
      await this.imageService.remove(processed.fields.imageStorageKey).catch(() => {});
      throw error;
    }
  }

  async getImage(paymentTokenUid) {
    const rows = await this.repository.findRawByUid(paymentTokenUid);
    if (!rows?.imageStorageKey) throw ApiError.notFound('Payment-token image was not found.');
    return { token: rows, filePath: this.imageService.resolve(rows.imageStorageKey) };
  }
}

module.exports = { PaymentTokenAdminService };
