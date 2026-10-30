const { ethers } = require('ethers');
const { ApiError } = require('../core/errors/api-error');
const { decryptSecret } = require('../utils/secret-crypto');
const { parseJsonArray } = require('../repositories/chain.repository');

class ChainRuntimeService {
  constructor({ repository }) {
    this.repository = repository;
  }

  runtime(row) {
    if (!row) return null;
    let deployerPrivateKey = null;
    if (row.deployerPrivateKeyEncrypted) deployerPrivateKey = decryptSecret(row.deployerPrivateKeyEncrypted);
    return {
      chainUid: row.chainUid,
      chainCode: row.chainCode,
      chainName: row.chainName,
      chainId: Number(row.chainId),
      supportedChainIds: [Number(row.chainId)],
      networkName: row.networkName,
      sepoliaRpcUrl: row.rpcUrl,
      rpcUrl: row.rpcUrl,
      sepoliaFallbackRpcUrls: parseJsonArray(row.fallbackRpcUrls),
      fallbackRpcUrls: parseJsonArray(row.fallbackRpcUrls),
      publicRpcUrl: row.publicRpcUrl || null,
      explorerUrl: row.explorerUrl || null,
      contractSuiteDeployedAt: row.contractSuiteDeployedAt || null,
      trexImplementationAuthorityAddress: row.trexImplementationAuthorityAddress,
      trexGatewayAddress: row.trexGatewayAddress,
      identityImplementationAuthorityAddress: row.identityImplementationAuthorityAddress,
      identityFactoryAddress: row.identityFactoryAddress,
      platformControllerAddress: row.platformControllerAddress,
      trexFactoryAddress: row.trexFactoryAddress,
      countryRestrictModuleAddress: row.countryRestrictModuleAddress,
      maxBalanceModuleAddress: row.maxBalanceModuleAddress,
      maxInvestorsModuleAddress: row.maxInvestorsModuleAddress,
      platformControllerOwnerAddress: row.platformControllerOwnerAddress,
      idFactoryAccessManagerAddress: row.idFactoryAccessManagerAddress || null,
      idFactoryAccessManagerAdminAddress: row.idFactoryAccessManagerAdminAddress || null,
      tokenImplementationAddress: row.tokenImplementationAddress,
      claimTopicsRegistryImplementationAddress: row.claimTopicsRegistryImplementationAddress,
      identityRegistryImplementationAddress: row.identityRegistryImplementationAddress,
      identityRegistryStorageImplementationAddress: row.identityRegistryStorageImplementationAddress,
      trustedIssuersRegistryImplementationAddress: row.trustedIssuersRegistryImplementationAddress,
      modularComplianceImplementationAddress: row.modularComplianceImplementationAddress,
      identityImplementationAddress: row.identityImplementationAddress,
      deployerPrivateKey,
      deployerAddress: row.deployerAddress,
      confirmations: Number(row.confirmations || 2),
      registryConfirmations: Number(row.registryConfirmations || row.confirmations || 2),
      transactionIndexerConfirmations: Number(row.confirmations || 2),
      purchasePaymentConfirmations: Number(row.confirmations || 2),
      purchaseConfirmations: Number(row.confirmations || 2),
      redemptionConfirmations: Number(row.confirmations || 2),
      transferConfirmations: Number(row.confirmations || 2),
      transferIndexerConfirmations: Number(row.confirmations || 2),
      transactionTimeoutMs: Number(row.transactionTimeoutMs || 120000),
      trexFactoryStartBlock: Number(row.deploymentStartBlock || 0),
      claimIndexerStartBlock: Number(row.claimIndexerStartBlock || 0),
      registryIndexerStartBlock: Number(row.registryIndexerStartBlock || 0),
      transactionIndexerStartBlock: Number(row.transactionIndexerStartBlock || 0),
      purchaseIndexerStartBlock: Number(row.transactionIndexerStartBlock || 0),
      redemptionIndexerStartBlock: Number(row.transactionIndexerStartBlock || 0),
      transferIndexerStartBlock: Number(row.transactionIndexerStartBlock || 0),
      registryRecoveryLookbackBlocks: Number(row.registryRecoveryLookbackBlocks || 200000),
      registryRecoveryBlockOffset: Number(row.registryRecoveryBlockOffset || 20000),
      registryRpcEvidenceAttempts: 5,
      reconcileBlockOffset: Number(row.reconcileBlockOffset || 9000),
      reconcileMaxLookbackBlocks: Number(row.reconcileMaxLookbackBlocks || 1000000),
      deploymentAttemptTtlMinutes: Number(row.deploymentAttemptTtlMinutes || 20),
      registryDelegationManagerAddresses: parseJsonArray(row.delegationManagerAddresses),
      transactionDelegationManagerAddresses: parseJsonArray(row.delegationManagerAddresses),
      deploymentSyncEnabled: Boolean(row.indexersEnabled),
      transactionIndexerEnabled: Boolean(row.indexersEnabled),
      purchaseWorkerEnabled: false,
      redemptionWorkerEnabled: false,
      transferWorkerEnabled: false,
      isTestnet: Boolean(row.isTestnet),
      isDefault: Boolean(row.isDefault),
      isActive: Boolean(row.isActive),
    };
  }

  async byUid(chainUid, { requireActive = true } = {}) {
    const row = await this.repository.findRawByUid(chainUid);
    if (!row || (requireActive && (!row.isActive || row.isDeleted))) {
      throw new ApiError(404, 'Supported chain was not found.', undefined, 'CHAIN_NOT_FOUND');
    }
    return this.runtime(row);
  }

  async byChainId(chainId, { requireActive = true } = {}) {
    const row = await this.repository.findRawByChainId(chainId);
    if (!row || (requireActive && (!row.isActive || row.isDeleted))) {
      throw new ApiError(400, `Chain ${chainId} is not supported.`, undefined, 'UNSUPPORTED_CHAIN');
    }
    return this.runtime(row);
  }

  async default() {
    const chain = await this.repository.findDefault();
    if (!chain) throw new ApiError(503, 'No active blockchain network is configured.', undefined, 'CHAIN_NOT_CONFIGURED');
    return this.byUid(chain.chainUid);
  }

  async listActiveRuntime() {
    const chains = await this.repository.listActive();
    const result = [];
    for (const chain of chains) {
      // eslint-disable-next-line no-await-in-loop
      result.push(await this.byUid(chain.chainUid));
    }
    return result;
  }

  async listPublic() {
    return this.repository.listActive();
  }

  requireSigner(config) {
    if (!config.deployerPrivateKey) {
      throw new ApiError(503, 'The selected chain signer is not configured.', undefined, 'CHAIN_SIGNER_NOT_CONFIGURED');
    }
    const wallet = new ethers.Wallet(config.deployerPrivateKey);
    if (config.deployerAddress && wallet.address.toLowerCase() !== config.deployerAddress.toLowerCase()) {
      throw new ApiError(500, 'The selected chain signer does not match deployerAddress.', undefined, 'CHAIN_SIGNER_MISMATCH');
    }
    return config;
  }
}

module.exports = { ChainRuntimeService };
