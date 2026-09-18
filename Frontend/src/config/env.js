import { centralizedConfig } from './app.config';
import { DEFAULT_TREX_PLATFORM_CONTROLLER_ADDRESS } from './config.factory';

const requiredChain = centralizedConfig.blockchain.requiredChain;
const walletViewChain = centralizedConfig.blockchain.walletViewChain;
const walletViewUsdc = centralizedConfig.tokens.walletViewUsdc;
const bridge = centralizedConfig.bridge;

// Backward-compatible fixed fallback retained for existing deployment-service imports.
// The active environment may override env.trex.platformController, but the exported
// DEFAULT_* constant intentionally remains the legacy default value.
export { DEFAULT_TREX_PLATFORM_CONTROLLER_ADDRESS };

export const env = Object.freeze({
  appName: centralizedConfig.application.name,
  appVersion: centralizedConfig.application.version,
  apiBaseUrl: centralizedConfig.api.baseUrl.replace(/\/$/, ''),
  apiVersion: centralizedConfig.api.version.replace(/^\/+|\/+$/g, ''),
  socketUrl: centralizedConfig.api.socketUrl,
  requestTimeout: centralizedConfig.api.requestTimeoutMs,
  firebaseApiKey: centralizedConfig.clientIntegrations.firebaseApiKey,
  sentryDsn: centralizedConfig.clientIntegrations.sentryDsn,
  privy: Object.freeze({
    appId: centralizedConfig.authentication.privy.appId.trim(),
    clientId: centralizedConfig.authentication.privy.clientId.trim(),
  }),
  web3: Object.freeze({
    defaultChain: requiredChain.key,
    enabledChains: Object.freeze([requiredChain.key]),
    rpcUrl: requiredChain.rpcHttpUrl,
    requiredChain: Object.freeze({
      key: requiredChain.key,
      chainId: requiredChain.chainId,
      name: requiredChain.displayName,
      shortName: requiredChain.shortDisplayName,
      rpcHttpUrl: requiredChain.rpcHttpUrl,
      rpcWebSocketUrl: requiredChain.rpcWebSocketUrl,
      explorerName: requiredChain.explorerName,
      explorerUrl: requiredChain.explorerUrl.replace(/\/$/, ''),
      networkIconUrl: requiredChain.networkIconUrl,
      isTestnet: requiredChain.isTestnet,
      environmentLabel: requiredChain.environmentBadgeLabel,
      nativeCurrency: Object.freeze({
        name: requiredChain.nativeCurrencyName,
        symbol: requiredChain.nativeCurrencySymbol,
        decimals: requiredChain.nativeCurrencyDecimals,
      }),
    }),
    walletViewChain: Object.freeze({
      key: walletViewChain.key,
      chainId: walletViewChain.chainId,
      name: walletViewChain.displayName,
      shortName: walletViewChain.shortDisplayName,
      isTestnet: walletViewChain.isTestnet,
      rpcHttpUrl: walletViewChain.rpcHttpUrl,
      explorerName: walletViewChain.explorerName,
      explorerUrl: walletViewChain.explorerUrl.replace(/\/$/, ''),
      explorerApiUrl: walletViewChain.explorerApiUrl,
      nativeCurrency: Object.freeze({
        name: walletViewChain.nativeCurrencyName,
        symbol: walletViewChain.nativeCurrencySymbol,
        decimals: walletViewChain.nativeCurrencyDecimals,
      }),
      multicall3Address: walletViewChain.multicall3Address,
      multicall3BlockCreated: walletViewChain.multicall3BlockCreated,
      ensUniversalResolverAddress: walletViewChain.ensUniversalResolverAddress,
      ensUniversalResolverBlockCreated: walletViewChain.ensUniversalResolverBlockCreated,
    }),
    requiredConfirmations: centralizedConfig.blockchain.requiredTransactionConfirmations,
  }),
  walletViewUsdc: Object.freeze({
    id: walletViewUsdc.id,
    address: walletViewUsdc.address,
    decimals: walletViewUsdc.decimals,
  }),
  bridge: Object.freeze({
    environment: bridge.environment,
    token: bridge.token,
    transferSpeed: bridge.transferSpeed,
    maxFee: bridge.maxFee,
    fallbackSourceGasUnits: bridge.fallbackSourceGasUnits,
    fallbackDestinationGasUnits: bridge.fallbackDestinationGasUnits,
    sourceAppKitChain: bridge.sourceAppKitChain,
    destinationAppKitChain: bridge.destinationAppKitChain,
    toArcLabel: bridge.toRequiredChainLabel,
    toWalletViewLabel: bridge.toWalletViewChainLabel,
  }),
  trex: Object.freeze({
    gateway: centralizedConfig.contracts.trexGatewayAddress,
    platformWallet: centralizedConfig.contracts.trexPlatformWalletAddress,
    platformController: centralizedConfig.contracts.trexPlatformControllerAddress,
    paymentToken: centralizedConfig.contracts.trexPaymentTokenAddress,
    identityFactory: centralizedConfig.contracts.onchainIdFactoryAddress,
    complianceModules: Object.freeze({
      countryRestrict: centralizedConfig.contracts.countryRestrictModuleAddress,
      maxBalance: centralizedConfig.contracts.maxBalanceModuleAddress,
      maxInvestors: centralizedConfig.contracts.maxInvestorsModuleAddress,
    }),
  }),
  features: Object.freeze({
    mockApi: centralizedConfig.features.useMockApi,
    darkMode: centralizedConfig.features.enableDarkMode,
    analytics: centralizedConfig.features.enableAnalytics,
  }),
});
