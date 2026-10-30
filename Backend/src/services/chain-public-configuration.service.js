const { ApiError } = require('../core/errors/api-error');

class ChainPublicConfigurationService {
  constructor({ chainRepository, paymentTokenRegistryService }) {
    this.chainRepository = chainRepository;
    this.paymentTokenRegistryService = paymentTokenRegistryService;
  }

  async get(chainUid) {
    const chain = await this.chainRepository.findByUid(chainUid);
    if (!chain || !chain.isActive) {
      throw new ApiError(404, 'Supported chain was not found.', undefined, 'CHAIN_NOT_FOUND');
    }

    const paymentTokens = await this.paymentTokenRegistryService.listEnabled({ chainUid });
    return {
      chainUid: chain.chainUid,
      chainCode: chain.chainCode,
      chainName: chain.chainName,
      chainId: chain.chainId,
      networkName: chain.networkName,
      isTestnet: chain.isTestnet,
      isDefault: chain.isDefault,
      imageUrl: chain.imageUrl,
      updatedAt: chain.updatedAt,
      nativeCurrency: {
        name: chain.nativeCurrencyName,
        symbol: chain.nativeCurrencySymbol,
        decimals: chain.nativeCurrencyDecimals,
      },
      rpcUrls: {
        public: chain.publicRpcUrl,
      },
      explorerUrl: chain.explorerUrl,
      confirmations: {
        transactions: chain.confirmations,
        registry: chain.registryConfirmations,
      },
      deployment: {
        deployedAt: chain.contractSuiteDeployedAt,
        startBlock: chain.deploymentStartBlock,
      },
      contracts: {
        platform: {
          trexImplementationAuthority: chain.trexImplementationAuthorityAddress,
          trexFactory: chain.trexFactoryAddress,
          trexGateway: chain.trexGatewayAddress,
          identityImplementationAuthority: chain.identityImplementationAuthorityAddress,
          identityFactory: chain.identityFactoryAddress,
          complianceModules: {
            countryRestrict: chain.countryRestrictModuleAddress,
            maxBalance: chain.maxBalanceModuleAddress,
            maxInvestors: chain.maxInvestorsModuleAddress,
          },
          platformController: chain.platformControllerAddress,
          platformControllerOwner: chain.platformControllerOwnerAddress,
          idFactoryAccessManager: chain.idFactoryAccessManagerAddress,
          idFactoryAccessManagerAdmin: chain.idFactoryAccessManagerAdminAddress,
        },
        implementations: {
          token: chain.tokenImplementationAddress,
          claimTopicsRegistry: chain.claimTopicsRegistryImplementationAddress,
          identityRegistry: chain.identityRegistryImplementationAddress,
          identityRegistryStorage: chain.identityRegistryStorageImplementationAddress,
          trustedIssuersRegistry: chain.trustedIssuersRegistryImplementationAddress,
          modularCompliance: chain.modularComplianceImplementationAddress,
          identity: chain.identityImplementationAddress,
        },
      },
      paymentTokens,
    };
  }
}

module.exports = { ChainPublicConfigurationService };
