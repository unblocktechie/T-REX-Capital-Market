import { createConfig, createStorage, http } from 'wagmi';
import { sepolia } from 'wagmi/chains';
import { metaMask, walletConnect } from 'wagmi/connectors';
import { env } from '@/config/env';

export const supportedChains = [sepolia];
export const requiredChain = sepolia;

const connectors = [
  metaMask({
    dapp: {
      name: env.appName,
      url: typeof window !== 'undefined' ? window.location.origin : 'https://localhost',
      iconUrl:
        typeof window !== 'undefined'
          ? `${window.location.origin}/favicon-192.png`
          : 'https://localhost/favicon-192.png',
    },
  }),
];

if (env.walletConnectProjectId) {
  connectors.push(
    walletConnect({
      projectId: env.walletConnectProjectId,
      showQrModal: true,
      metadata: {
        name: env.appName,
        description: 'Connect the primary organization wallet for compliant token issuance.',
        url: typeof window !== 'undefined' ? window.location.origin : 'https://localhost',
        icons:
          typeof window !== 'undefined'
            ? [`${window.location.origin}/favicon-192.png`]
            : [],
      },
      qrModalOptions: {
        themeMode: 'light',
      },
    }),
  );
}

export const wagmiConfig = createConfig({
  chains: supportedChains,
  connectors,
  storage: createStorage({
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    key: 'trex-wallet',
  }),
  multiInjectedProviderDiscovery: true,
  transports: {
    [sepolia.id]: http(env.web3.rpcUrl),
  },
});

export const web3Config = Object.freeze({
  walletConnectConfigured: Boolean(env.walletConnectProjectId),
  requiredChain,
  supportedChains,
});
