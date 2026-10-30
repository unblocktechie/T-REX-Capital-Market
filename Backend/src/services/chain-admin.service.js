const { ethers } = require('ethers');
const { ApiError } = require('../core/errors/api-error');
const { withTransaction } = require('../database/connection');
const { encryptSecret } = require('../utils/secret-crypto');
const { logger } = require('./common/log.service');

const normalizeAddress = (value) => (value ? ethers.getAddress(value) : null);
const contractAddressFields = [
  'trexImplementationAuthorityAddress', 'trexGatewayAddress',
  'identityImplementationAuthorityAddress', 'identityFactoryAddress',
  'platformControllerAddress', 'trexFactoryAddress', 'countryRestrictModuleAddress',
  'maxBalanceModuleAddress', 'maxInvestorsModuleAddress', 'platformControllerOwnerAddress',
  'idFactoryAccessManagerAddress', 'idFactoryAccessManagerAdminAddress',
  'tokenImplementationAddress', 'claimTopicsRegistryImplementationAddress',
  'identityRegistryImplementationAddress', 'identityRegistryStorageImplementationAddress',
  'trustedIssuersRegistryImplementationAddress', 'modularComplianceImplementationAddress',
  'identityImplementationAddress',
];
const deployedContractAddressFields = contractAddressFields.filter(
  (field) => !['platformControllerOwnerAddress', 'idFactoryAccessManagerAdminAddress'].includes(field),
);
const controllerAbi = ['function paymentTokens() view returns (address[])'];
const erc20MetadataAbi = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
];
const editableNetworkFields = new Set(['publicRpcUrl', 'explorerUrl', 'fallbackRpcUrls', 'isActive']);
const ignoredAuditFields = new Set(['defaultSlot', 'updatedAt']);

const auditValue = (value) => {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' && (value.startsWith('[') || value.startsWith('{'))) {
    try { return JSON.parse(value); } catch { return value; }
  }
  return value;
};

const auditSnapshot = (row) => {
  if (!row) return null;
  const snapshot = {};
  for (const [field, value] of Object.entries(row)) {
    if (ignoredAuditFields.has(field)) continue;
    if (field === 'deployerPrivateKeyEncrypted') {
      snapshot.hasDeployerPrivateKey = Boolean(value);
    } else {
      snapshot[field] = auditValue(value);
    }
  }
  return snapshot;
};

const changedFields = (before, after) => Object.keys(after || {}).filter(
  (field) => JSON.stringify(before?.[field]) !== JSON.stringify(after?.[field]),
);

class ChainAdminService {
  constructor({ repository, auditRepository, paymentTokenRepository = null, runtimeService, imageService, transactionRunner = withTransaction, dependencies = {} }) {
    this.repository = repository;
    this.auditRepository = auditRepository;
    this.runtimeService = runtimeService;
    this.imageService = imageService;
    this.paymentTokenRepository = paymentTokenRepository;
    this.transactionRunner = transactionRunner;
    this.providerFactory = dependencies.providerFactory || ((rpcUrl) => new ethers.JsonRpcProvider(rpcUrl));
    this.contractFactory = dependencies.contractFactory || ((address, abi, provider) => new ethers.Contract(address, abi, provider));
  }

  list(query) { return this.repository.listAdmin(query); }

  async get(chainUid) {
    const row = await this.repository.findRawByUid(chainUid);
    if (!row) throw ApiError.notFound('Chain configuration was not found.');
    const result = await this.repository.findByUid(chainUid, undefined, { admin: true });
    return result;
  }

  async listAudits(chainUid, query) {
    await this.get(chainUid);
    return this.auditRepository.list(chainUid, query);
  }

  prepare(input, existing = null) {
    const data = { ...input };
    for (const field of [...contractAddressFields, 'deployerAddress']) {
      if (data[field] !== undefined && data[field] !== null && data[field] !== '') data[field] = normalizeAddress(data[field]);
    }
    if (data.deployerPrivateKey !== undefined) {
      if (data.deployerPrivateKey === null || data.deployerPrivateKey === '') {
        data.deployerPrivateKeyEncrypted = null;
      } else {
        const normalizedPrivateKey = String(data.deployerPrivateKey).startsWith('0x')
          ? String(data.deployerPrivateKey) : `0x${data.deployerPrivateKey}`;
        const wallet = new ethers.Wallet(normalizedPrivateKey);
        const expected = data.deployerAddress || existing?.deployerAddress;
        if (expected && wallet.address.toLowerCase() !== String(expected).toLowerCase()) {
          throw new ApiError(422, 'deployerPrivateKey does not match deployerAddress.', [{ field: 'deployerPrivateKey', message: 'Signer address mismatch.' }], 'CHAIN_SIGNER_MISMATCH');
        }
        data.deployerAddress = wallet.address;
        data.deployerPrivateKeyEncrypted = encryptSecret(normalizedPrivateKey);
      }
      delete data.deployerPrivateKey;
    }
    return data;
  }

  assertContractAddresses(data) {
    for (const field of contractAddressFields) {
      if (data[field] && ethers.getAddress(data[field]) === ethers.ZeroAddress) {
        throw new ApiError(422, `${field} cannot be the zero address.`, [{ field, message: 'Zero address is not allowed.' }], 'INVALID_CHAIN_CONTRACT');
      }
    }
  }

  async inspectContractSuite(data) {
    const provider = this.providerFactory(data.rpcUrl);
    try {
      for (const field of deployedContractAddressFields) {
        if (!data[field]) continue;
        // eslint-disable-next-line no-await-in-loop
        const code = await provider.getCode(data[field]);
        if (!code || code === '0x') {
          throw new ApiError(422, `${field} is not a deployed contract on the selected chain.`, [
            { field, message: 'No contract bytecode was found at this address.' },
          ], 'CHAIN_CONTRACT_NOT_DEPLOYED');
        }
      }

      const expected = (data.paymentTokenAddresses || []).map(normalizeAddress);
      const controller = this.contractFactory(data.platformControllerAddress, controllerAbi, provider);
      const registered = (await controller.paymentTokens()).map(normalizeAddress);
      const registeredSet = new Set(registered.map((address) => address.toLowerCase()));
      const expectedSet = new Set(expected.map((address) => address.toLowerCase()));
      const missing = expected.filter((address) => !registeredSet.has(address.toLowerCase()));
      const omitted = registered.filter((address) => !expectedSet.has(address.toLowerCase()));
      if (missing.length || omitted.length) {
        throw new ApiError(422, 'paymentTokenAddresses must exactly match the Platform Controller registry.', [
          { field: 'paymentTokenAddresses', message: `Missing from controller: ${missing.join(', ') || 'none'}; omitted from request: ${omitted.join(', ') || 'none'}.` },
        ], 'PAYMENT_TOKEN_REGISTRY_MISMATCH');
      }

      const metadata = [];
      for (const [index, address] of expected.entries()) {
        // eslint-disable-next-line no-await-in-loop
        const code = await provider.getCode(address);
        if (!code || code === '0x') {
          throw new ApiError(422, 'A payment token is not a deployed contract.', [
            { field: `paymentTokenAddresses.${index}`, message: `No contract bytecode was found at ${address}.` },
          ], 'PAYMENT_TOKEN_NOT_DEPLOYED');
        }
        const token = this.contractFactory(address, erc20MetadataAbi, provider);
        // eslint-disable-next-line no-await-in-loop
        const [name, symbol, decimals] = await Promise.all([token.name(), token.symbol(), token.decimals()]);
        metadata.push({ address, name: String(name), symbol: String(symbol).toUpperCase(), decimals: Number(decimals) });
      }
      return metadata;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(422, 'The supplied contract suite could not be verified on-chain.', [
        { field: 'contracts', message: error.message },
      ], 'CHAIN_CONTRACT_VALIDATION_FAILED');
    } finally {
      if (typeof provider.destroy === 'function') provider.destroy();
    }
  }

  async validateRpc(data) {
    const provider = this.providerFactory(data.rpcUrl);
    try {
      const network = await Promise.race([
        provider.getNetwork(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('RPC validation timed out.')), 15000)),
      ]);
      if (Number(network.chainId) !== Number(data.chainId)) {
        throw new ApiError(422, 'rpcUrl is connected to a different chain.', [{
          field: 'rpcUrl', message: `Expected chainId ${data.chainId}, received ${network.chainId}.`,
        }], 'CHAIN_RPC_MISMATCH');
      }
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(422, 'rpcUrl could not be validated.', [{ field: 'rpcUrl', message: error.message }], 'CHAIN_RPC_UNAVAILABLE');
    } finally {
      if (typeof provider.destroy === 'function') provider.destroy();
    }
  }

  duplicateError(error) {
    if (error?.code !== 'ER_DUP_ENTRY') return error;
    return new ApiError(409, 'A chain with the same chainId or chainCode already exists.', undefined, 'CHAIN_ALREADY_EXISTS');
  }

  async create(input, actor, file = null) {
    const data = this.prepare(input);
    this.assertContractAddresses(data);
    await this.validateRpc(data);
    const paymentTokenAddresses = data.paymentTokenAddresses.map(normalizeAddress);
    data.paymentTokenAddresses = paymentTokenAddresses;
    const paymentTokens = await this.inspectContractSuite(data);
    delete data.paymentTokenAddresses;
    let processed;
    try {
      if (file) {
        processed = await this.imageService.process(file);
        Object.assign(data, processed.fields);
      }
      return await this.transactionRunner(async (connection) => {
        if (data.isDefault) await this.repository.clearDefault('', connection);
        const created = await this.repository.create(data, connection);
        if (this.paymentTokenRepository) {
          const usedCodes = new Set();
          for (const [index, token] of paymentTokens.entries()) {
            let paymentTokenCode = token.symbol.replace(/[^A-Z0-9]/g, '').slice(0, 45) || `TOKEN${index + 1}`;
            if (usedCodes.has(paymentTokenCode)) paymentTokenCode = `${paymentTokenCode}_${index + 1}`;
            usedCodes.add(paymentTokenCode);
            // eslint-disable-next-line no-await-in-loop
            await this.paymentTokenRepository.create({
              chainUid: created.chainUid,
              paymentTokenCode,
              paymentTokenName: token.name,
              paymentTokenSymbol: token.symbol,
              contractAddress: token.address,
              decimals: token.decimals,
              chainId: Number(data.chainId),
              networkName: data.networkName,
              explorerUrl: data.explorerUrl ? `${String(data.explorerUrl).replace(/\/$/, '')}/token/${token.address}` : null,
              supportsPurchase: true,
              supportsRedemption: true,
              isDefault: index === 0,
              displayOrder: (index + 1) * 10,
              isActive: true,
            }, connection);
          }
        }
        const after = await this.repository.findRawByUid(created.chainUid, connection);
        const afterData = auditSnapshot(after);
        await this.auditRepository.record({
          chainUid: created.chainUid,
          changedByUserUid: actor.userUid,
          operation: 'CREATE',
          changedFields: Object.keys(afterData),
          beforeData: null,
          afterData,
        }, connection);
        return this.repository.findByUid(created.chainUid, connection, { admin: true });
      });
    } catch (error) {
      if (processed) await this.imageService.remove(processed.fields.imageStorageKey).catch(() => {});
      throw this.duplicateError(error);
    }
  }

  async update(chainUid, input, actor) {
    const existing = await this.repository.findRawByUid(chainUid);
    if (!existing) throw ApiError.notFound('Chain configuration was not found.');
    const forbidden = Object.keys(input).filter((field) => !editableNetworkFields.has(field));
    if (forbidden.length) {
      throw new ApiError(422, 'Only publicRpcUrl, explorerUrl, fallbackRpcUrls, and isActive can be edited.',
        forbidden.map((field) => ({ field, message: 'This network field is immutable.' })), 'IMMUTABLE_NETWORK_FIELD');
    }
    const data = this.prepare(input, existing);
    try {
      return await this.transactionRunner(async (connection) => {
        const before = await this.repository.findRawByUid(chainUid, connection);
        await this.repository.update(chainUid, data, connection);
        const after = await this.repository.findRawByUid(chainUid, connection);
        const beforeData = auditSnapshot(before);
        const afterData = auditSnapshot(after);
        const fields = changedFields(beforeData, afterData);
        if (fields.length) {
          await this.auditRepository.record({
            chainUid,
            changedByUserUid: actor.userUid,
            operation: 'UPDATE',
            changedFields: fields,
            beforeData,
            afterData,
          }, connection);
        }
        return this.repository.findByUid(chainUid, connection, { admin: true });
      });
    } catch (error) {
      throw this.duplicateError(error);
    }
  }

  async updateImage(chainUid, file, actor) {
    const existing = await this.repository.findRawByUid(chainUid);
    if (!existing) throw ApiError.notFound('Chain configuration was not found.');
    if (!file) throw new ApiError(422, 'An image is required.', [{ field: 'image', message: 'image is required.' }], 'MASTER_IMAGE_REQUIRED');
    const processed = await this.imageService.process(file);
    try {
      const updated = await this.transactionRunner(async (connection) => {
        const before = await this.repository.findRawByUid(chainUid, connection);
        await this.repository.update(chainUid, processed.fields, connection);
        const after = await this.repository.findRawByUid(chainUid, connection);
        const beforeData = auditSnapshot(before);
        const afterData = auditSnapshot(after);
        await this.auditRepository.record({
          chainUid,
          changedByUserUid: actor.userUid,
          operation: 'UPDATE',
          changedFields: changedFields(beforeData, afterData),
          beforeData,
          afterData,
        }, connection);
        return this.repository.findByUid(chainUid, connection, { admin: true });
      });
      if (existing.imageStorageKey && existing.imageStorageKey !== processed.fields.imageStorageKey) {
        await this.imageService.remove(existing.imageStorageKey).catch((error) => {
          logger.warn('Old network image could not be removed after replacement', { chainUid, error: error.message });
        });
      }
      return updated;
    } catch (error) {
      await this.imageService.remove(processed.fields.imageStorageKey).catch(() => {});
      throw error;
    }
  }

  async getImage(chainUid) {
    const chain = await this.repository.findRawByUid(chainUid);
    if (!chain?.imageStorageKey) throw ApiError.notFound('Network image was not found.');
    return { chain, filePath: this.imageService.resolve(chain.imageStorageKey) };
  }
}

module.exports = { ChainAdminService, auditSnapshot, changedFields };
