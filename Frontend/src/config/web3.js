import { defineChain } from 'viem';
import { env } from '@/config/env';
import { centralizedConfig } from '@/config/app.config';

const requiredChainConfig = env.web3.requiredChain;
const walletViewChainConfig = env.web3.walletViewChain;
const walletViewUsdcConfig = {
  ...centralizedConfig.tokens.walletViewUsdc,
  ...env.walletViewUsdc,
};
const bridgeConfig = env.bridge;
const walletFundingConfig = centralizedConfig.walletFunding;

// Arc publishes one network mark for both Testnet and Mainnet. Keep an official
// brand fallback so UI icons do not disappear when an environment leaves the
// optional icon override empty. Environment-specific URLs still take priority.
const ARC_NETWORK_ICON_FALLBACK_URL =
  'https://cdn.prod.website-files.com/685311a976e7c248b5dfde95/699e21e934a48439675361dc_arc-icon.svg';

// Single Arc chain implementation. The actual Arc network is selected entirely
// by VITE_ARC_* values (or the centralized defaults) rather than code branches.
export const arcChain = defineChain({
  id: requiredChainConfig.chainId,
  name: requiredChainConfig.name,
  nativeCurrency: requiredChainConfig.nativeCurrency,
  rpcUrls: {
    default: {
      http: [requiredChainConfig.rpcHttpUrl],
      ...(requiredChainConfig.rpcWebSocketUrl
        ? { webSocket: [requiredChainConfig.rpcWebSocketUrl] }
        : {}),
    },
  },
  blockExplorers: requiredChainConfig.explorerUrl
    ? {
        default: {
          name: requiredChainConfig.explorerName,
          url: requiredChainConfig.explorerUrl,
        },
      }
    : undefined,
  testnet: requiredChainConfig.isTestnet,
});

// Secondary read-only / bridge chain is also environment-driven so an Arc
// production build can use a production counterpart without another code path.
export const walletViewChain = defineChain({
  id: walletViewChainConfig.chainId,
  name: walletViewChainConfig.name,
  nativeCurrency: walletViewChainConfig.nativeCurrency,
  rpcUrls: {
    default: {
      http: [walletViewChainConfig.rpcHttpUrl],
    },
  },
  blockExplorers: walletViewChainConfig.explorerUrl
    ? {
        default: {
          name: walletViewChainConfig.explorerName,
          url: walletViewChainConfig.explorerUrl,
          ...(walletViewChainConfig.explorerApiUrl
            ? { apiUrl: walletViewChainConfig.explorerApiUrl }
            : {}),
        },
      }
    : undefined,
  contracts:
    walletViewChainConfig.multicall3Address || walletViewChainConfig.ensUniversalResolverAddress
      ? {
          ...(walletViewChainConfig.multicall3Address
            ? {
                multicall3: {
                  address: walletViewChainConfig.multicall3Address,
                  blockCreated: walletViewChainConfig.multicall3BlockCreated,
                },
              }
            : {}),
          ...(walletViewChainConfig.ensUniversalResolverAddress
            ? {
                ensUniversalResolver: {
                  address: walletViewChainConfig.ensUniversalResolverAddress,
                  blockCreated: walletViewChainConfig.ensUniversalResolverBlockCreated,
                },
              }
            : {}),
        }
      : undefined,
  testnet: walletViewChainConfig.isTestnet,
});

export const supportedChains = [arcChain];
export const requiredChain = arcChain;
export const walletViewChains = [arcChain, walletViewChain];
export const privySupportedChains = [arcChain, walletViewChain];

export const walletViewTokenAssets = Object.freeze({
  [walletViewChain.id]: Object.freeze([
    Object.freeze({
      id: walletViewUsdcConfig.id,
      kind: walletViewUsdcConfig.kind,
      name: walletViewUsdcConfig.name,
      symbol: walletViewUsdcConfig.symbol,
      tokenAddress: walletViewUsdcConfig.address,
      chainId: walletViewChain.id,
      decimals: walletViewUsdcConfig.decimals,
    }),
  ]),
});

export const usdcBridge = Object.freeze({
  environment: bridgeConfig.environment,
  token: bridgeConfig.token,
  transferSpeed: bridgeConfig.transferSpeed,
  maxFee: bridgeConfig.maxFee,
  fallbackSourceGasUnits: bridgeConfig.fallbackSourceGasUnits,
  fallbackDestinationGasUnits: bridgeConfig.fallbackDestinationGasUnits,
  routes: Object.freeze({
    // Route keys remain unchanged to preserve the existing bridge UI/API flow.
    toArc: Object.freeze({
      id: 'toArc',
      label: bridgeConfig.toArcLabel,
      source: Object.freeze({
        chainId: walletViewChain.id,
        appKitChain: bridgeConfig.sourceAppKitChain,
        networkName: walletViewChain.name,
        nativeSymbol: walletViewChain.nativeCurrency.symbol,
        nativeDecimals: walletViewChain.nativeCurrency.decimals,
        usdcAddress: walletViewUsdcConfig.address,
        usdcIsNative: false,
      }),
      destination: Object.freeze({
        chainId: arcChain.id,
        appKitChain: bridgeConfig.destinationAppKitChain,
        networkName: arcChain.name,
        nativeSymbol: arcChain.nativeCurrency.symbol,
        nativeDecimals: arcChain.nativeCurrency.decimals,
        usdcIsNative: true,
      }),
    }),
    toSepolia: Object.freeze({
      id: 'toSepolia',
      label: bridgeConfig.toWalletViewLabel,
      source: Object.freeze({
        chainId: arcChain.id,
        appKitChain: bridgeConfig.destinationAppKitChain,
        networkName: arcChain.name,
        nativeSymbol: arcChain.nativeCurrency.symbol,
        nativeDecimals: arcChain.nativeCurrency.decimals,
        usdcIsNative: true,
      }),
      destination: Object.freeze({
        chainId: walletViewChain.id,
        appKitChain: bridgeConfig.sourceAppKitChain,
        networkName: walletViewChain.name,
        nativeSymbol: walletViewChain.nativeCurrency.symbol,
        nativeDecimals: walletViewChain.nativeCurrency.decimals,
        usdcAddress: walletViewUsdcConfig.address,
        usdcIsNative: false,
      }),
    }),
  }),
});

export const walletFunding = Object.freeze({
  chain: walletFundingConfig.chain,
  chainId: walletFundingConfig.chainId,
  networkName: walletFundingConfig.networkName,
  symbol: walletFundingConfig.symbol,
  asset: walletFundingConfig.assetAddress,
  fiatEnvironment: walletFundingConfig.fiatEnvironment,
  cryptoSlippageBps: walletFundingConfig.cryptoSlippageBps,
});

export const web3Config = Object.freeze({
  requiredChain,
  supportedChains,
  walletViewChains,
  walletViewTokenAssets,
  privySupportedChains,
  usdcBridge,
  requiredConfirmations: env.web3.requiredConfirmations,
  walletFunding,
  ui: Object.freeze({
    requiredChainShortName: requiredChainConfig.shortName,
    requiredChainEnvironmentBadgeLabel: requiredChainConfig.environmentLabel,
    walletViewChainShortName: walletViewChainConfig.shortName,
    requiredChainIconUrl:
      requiredChainConfig.networkIconUrl || ARC_NETWORK_ICON_FALLBACK_URL,
  }),
});
