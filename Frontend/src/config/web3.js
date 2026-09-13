import { defineChain } from 'viem';
import { sepolia } from 'viem/chains';
import { env } from '@/config/env';

// Arc Testnet uses USDC as the native gas asset. eth_getBalance and native value
// accounting use 18 internal decimals, while the USDC ERC-20 interface uses 6.
export const arcTestnet = defineChain({
  id: 5_042_002,
  name: 'Arc Testnet',
  nativeCurrency: {
    name: 'USD Coin',
    symbol: 'USDC',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [env.web3.rpcUrl],
      webSocket: ['wss://rpc.testnet.arc.network'],
    },
  },
  blockExplorers: {
    default: {
      name: 'ArcScan',
      url: 'https://testnet.arcscan.app',
    },
  },
  testnet: true,
});

// Wallet Management can read balances from Ethereum Sepolia without changing
// the transaction network used by the rest of the T-REX application.
export const ethereumSepolia = defineChain({
  ...sepolia,
  name: 'Ethereum Sepolia',
});

// Transaction-critical application flows remain Arc Testnet only.
export const supportedChains = [arcTestnet];
export const requiredChain = arcTestnet;

// Read-only balance networks exposed by Wallet Management. Keeping this list
// separate from supportedChains prevents a balance-view selection from changing
// token creation, investment, transfer, or redemption network requirements.
export const walletViewChains = [arcTestnet, ethereumSepolia];

// Privy must know both EVM chains used by the bridge so its embedded wallet can
// approve the Sepolia burn and the Arc mint. Transaction-critical T-REX flows
// still use `supportedChains` above (Arc only).
export const privySupportedChains = [arcTestnet, ethereumSepolia];

// ERC-20 assets that Wallet Management knows how to read on each optional
// balance-view network. Standard EVM RPCs cannot enumerate every token held by a
// wallet, so this registry intentionally contains trusted/known assets. Circle's
// official Ethereum Sepolia USDC contract is included so a Privy wallet's test
// USDC is visible alongside native Sepolia ETH.
export const walletViewTokenAssets = Object.freeze({
  [ethereumSepolia.id]: Object.freeze([
    Object.freeze({
      id: 'ethereum-sepolia-usdc',
      kind: 'network-token',
      name: 'USD Coin',
      symbol: 'USDC',
      tokenAddress: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
      chainId: ethereumSepolia.id,
      decimals: 6,
    }),
  ]),
});

// Circle App Kit USDC bridge configuration. Both testnet directions are
// modeled explicitly so Wallet Management can bridge the same Privy wallet
// between Ethereum Sepolia and Arc Testnet. For mainnet, the UI and bridge
// service can stay unchanged while these route definitions are replaced with
// their production chain identifiers and token metadata.
export const usdcBridge = Object.freeze({
  environment: 'testnet',
  token: 'USDC',
  transferSpeed: 'FAST',
  maxFee: '0.10',
  routes: Object.freeze({
    toArc: Object.freeze({
      id: 'toArc',
      label: 'Bridge to Arc',
      source: Object.freeze({
        chainId: ethereumSepolia.id,
        appKitChain: 'Ethereum_Sepolia',
        networkName: ethereumSepolia.name,
        nativeSymbol: ethereumSepolia.nativeCurrency.symbol,
        usdcAddress: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
        usdcIsNative: false,
      }),
      destination: Object.freeze({
        chainId: arcTestnet.id,
        appKitChain: 'Arc_Testnet',
        networkName: arcTestnet.name,
        nativeSymbol: arcTestnet.nativeCurrency.symbol,
        usdcIsNative: true,
      }),
    }),
    toSepolia: Object.freeze({
      id: 'toSepolia',
      label: 'Bridge to Sepolia',
      source: Object.freeze({
        chainId: arcTestnet.id,
        appKitChain: 'Arc_Testnet',
        networkName: arcTestnet.name,
        nativeSymbol: arcTestnet.nativeCurrency.symbol,
        usdcIsNative: true,
      }),
      destination: Object.freeze({
        chainId: ethereumSepolia.id,
        appKitChain: 'Ethereum_Sepolia',
        networkName: ethereumSepolia.name,
        nativeSymbol: ethereumSepolia.nativeCurrency.symbol,
        usdcAddress: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
        usdcIsNative: false,
      }),
    }),
  }),
});

// Privy's add-funds flow uses Ethereum Mainnet as its funding destination.
// The asset below is Circle's official USDC contract on Ethereum Mainnet.
// This funding destination is intentionally independent from the app's Arc
// Testnet execution chain; changing it must not change token/deployment logic.
export const walletFunding = Object.freeze({
  chain: 'eip155:1',
  chainId: 1,
  networkName: 'Ethereum Mainnet',
  symbol: 'USDC',
  asset: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
});

export const web3Config = Object.freeze({
  requiredChain,
  supportedChains,
  walletViewChains,
  walletViewTokenAssets,
  privySupportedChains,
  usdcBridge,
  requiredConfirmations: 1,
  walletFunding,
});
