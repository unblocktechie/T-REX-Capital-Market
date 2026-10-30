import { env } from '@/config/env';

const MAINNET_ETHEREUM = Object.freeze({
  chainId: 1,
  chainUid: 'bridge-ethereum-mainnet',
  chainCode: 'ETH',
  chainName: 'Ethereum',
  networkName: 'Ethereum',
  nativeCurrencyName: 'Ether',
  nativeCurrencySymbol: 'ETH',
  nativeCurrencyDecimals: 18,
  isTestnet: false,
});

const TESTNET_ETHEREUM = Object.freeze({
  chainId: 11155111,
  chainUid: 'bridge-ethereum-sepolia',
  chainCode: 'ETH-SEPOLIA',
  chainName: 'Ethereum Sepolia',
  networkName: 'Ethereum Sepolia',
  nativeCurrencyName: 'Sepolia Ether',
  nativeCurrencySymbol: 'ETH',
  nativeCurrencyDecimals: 18,
  isTestnet: true,
});

const buildEthereumBridgeRecord = () => {
  const profile = env.deploymentEnvironment === 'mainnet' ? MAINNET_ETHEREUM : TESTNET_ETHEREUM;

  return Object.freeze({
    ...profile,
    publicRpcUrl: env.bridgeEthereum.rpcUrl,
    explorerUrl: env.bridgeEthereum.explorerUrl,
    imageUrl: '',
    nativeCurrencyImageUrl: '',
    isActive: true,
    isDefault: false,
    bridgeOnly: true,
    bridgeProvider: 'circle',
    paymentTokens: Object.freeze([
      Object.freeze({
        paymentTokenUid: `${profile.chainUid}-usdc`,
        chainId: profile.chainId,
        name: 'USD Coin',
        symbol: 'USDC',
        contractAddress: env.bridgeEthereum.usdcAddress,
        decimals: 6,
        imageUrl: '',
        active: true,
        supportedActions: Object.freeze(['BRIDGE']),
      }),
    ]),
  });
};

// These networks are intentionally separate from the platform chain catalogue.
// They are available only to wallet-management balance reads and Circle bridge
// flows, so adding Ethereum here never makes it an investment/deployment network.
export const bridgeOnlyChainRecords = Object.freeze([buildEthereumBridgeRecord()]);

export const getBridgeOnlyChainRecordById = (chainId) =>
  bridgeOnlyChainRecords.find((record) => record.chainId === Number(chainId)) || null;
