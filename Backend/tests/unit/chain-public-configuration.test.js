const test = require('node:test');
const assert = require('node:assert/strict');
const { ChainPublicConfigurationService } = require('../../src/services/chain-public-configuration.service');

const chain = {
  chainUid: '60000000-0000-4000-8000-000000000001', chainCode: 'SEPOLIA',
  chainName: 'Ethereum Sepolia', chainId: 11155111, networkName: 'sepolia',
  nativeCurrencyName: 'Sepolia Ether', nativeCurrencySymbol: 'ETH', nativeCurrencyDecimals: 18,
  publicRpcUrl: 'https://public.example', explorerUrl: 'https://explorer.example', imageUrl: null,
  confirmations: 2, registryConfirmations: 2, deploymentStartBlock: 11755758,
  contractSuiteDeployedAt: '2026-09-22T05:10:28.254Z', isTestnet: true, isDefault: true, isActive: true,
  trexImplementationAuthorityAddress: 'authority', trexFactoryAddress: 'factory', trexGatewayAddress: 'gateway',
  identityImplementationAuthorityAddress: 'identity-authority', identityFactoryAddress: 'identity-factory',
  countryRestrictModuleAddress: 'country', maxBalanceModuleAddress: 'balance', maxInvestorsModuleAddress: 'investors',
  platformControllerAddress: 'controller', platformControllerOwnerAddress: 'owner',
  idFactoryAccessManagerAddress: 'manager', idFactoryAccessManagerAdminAddress: 'manager-admin',
  tokenImplementationAddress: 'token-implementation', claimTopicsRegistryImplementationAddress: 'claim-topics',
  identityRegistryImplementationAddress: 'identity-registry',
  identityRegistryStorageImplementationAddress: 'identity-storage',
  trustedIssuersRegistryImplementationAddress: 'trusted-issuers',
  modularComplianceImplementationAddress: 'compliance', identityImplementationAddress: 'identity',
};

test('selected-chain configuration is complete and never exposes backend RPC or signer secrets', async () => {
  const service = new ChainPublicConfigurationService({
    chainRepository: { findByUid: async () => ({ ...chain, rpcUrl: 'internal', fallbackRpcUrls: ['secret'], deployerPrivateKey: 'secret' }) },
    paymentTokenRegistryService: { listEnabled: async () => [{ symbol: 'USDT' }] },
  });
  const result = await service.get(chain.chainUid);
  assert.equal(result.contracts.platform.trexGateway, 'gateway');
  assert.equal(result.contracts.implementations.identity, 'identity');
  assert.deepEqual(result.paymentTokens, [{ symbol: 'USDT' }]);
  assert.deepEqual(result.rpcUrls, { public: 'https://public.example' });
  assert.equal(result.rpcUrl, undefined);
  assert.equal(result.fallbackRpcUrls, undefined);
  assert.equal(result.deployerPrivateKey, undefined);
});

test('inactive selected chain is not publicly available', async () => {
  const service = new ChainPublicConfigurationService({
    chainRepository: { findByUid: async () => ({ ...chain, isActive: false }) },
    paymentTokenRegistryService: { listEnabled: async () => [] },
  });
  await assert.rejects(() => service.get(chain.chainUid), (error) => error.code === 'CHAIN_NOT_FOUND');
});
