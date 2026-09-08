import { createConfig, createStorage, http } from 'wagmi';
import { sepolia } from 'wagmi/chains';
import { injected, walletConnect } from 'wagmi/connectors';
import { env } from '@/config/env';

export const supportedChains = [sepolia];
export const requiredChain = sepolia;

// Use MetaMask's injected EIP-1193 browser provider directly. The MetaMask Connect
// connector can fall back to a metamask:// mobile deep link on desktop and leave a
// contract request waiting until its transport times out. Deployment must never use
// that fallback when the browser extension is already installed and connected.
const connectors = [
  injected({
    target: 'metaMask',
    shimDisconnect: true,
    unstable_shimAsyncInject: 2_000,
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
  // Only expose the explicitly configured MetaMask and WalletConnect connectors.
  // This also prevents an EIP-6963 discovery entry from replacing the injected
  // MetaMask connector with a different transport during a deployment.
  multiInjectedProviderDiscovery: false,
  storage: createStorage({
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    // Start a clean connection session after moving away from MetaMask Connect.
    // Users reconnect once, after which normal persisted reconnect behavior resumes.
    key: 'trex-wallet-v2',
  }),
  transports: {
    [sepolia.id]: http(env.web3.rpcUrl),
  },
});

export const web3Config = Object.freeze({
  walletConnectConfigured: Boolean(env.walletConnectProjectId),
  requiredChain,
  supportedChains,
});
