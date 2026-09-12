import { usePrivy, useWallets } from '@privy-io/react-auth';
import { createPublicClient, http } from 'viem';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { env } from '@/config/env';
import { web3Config } from '@/config/web3';
import { isTransientError, retryAsync } from '@/utils/retry';
import { formatWalletBalance, shortenWalletAddress } from '@/utils/wallet';

const publicClient = createPublicClient({
  chain: web3Config.requiredChain,
  transport: http(env.web3.rpcUrl),
});

const WALLET_REFRESH_TTL = 12_000;
const WALLET_REFRESH_INTERVAL = 30_000;
let walletSnapshotCache = null;
let walletRefreshFlight = null;

const parseHexChainId = (value) => {
  if (!value) return undefined;
  const numeric = Number.parseInt(String(value), 16);
  return Number.isFinite(numeric) ? numeric : undefined;
};

const invalidateWalletSnapshot = () => {
  walletSnapshotCache = null;
};

const loadWalletSnapshot = async (embeddedWallet, { force = false } = {}) => {
  const address = embeddedWallet?.address;
  if (!address) return { chainId: undefined, balance: undefined };

  const normalizedAddress = String(address).toLowerCase();
  const cacheIsFresh =
    !force &&
    walletSnapshotCache?.address === normalizedAddress &&
    Date.now() - walletSnapshotCache.updatedAt < WALLET_REFRESH_TTL;
  if (cacheIsFresh) return walletSnapshotCache.snapshot;

  if (walletRefreshFlight?.address === normalizedAddress) return walletRefreshFlight.promise;

  const promise = (async () => {
    const provider = await retryAsync(() => embeddedWallet.getEthereumProvider(), {
      maxAttempts: 3,
      baseDelayMs: 500,
      maxDelayMs: 4_000,
      shouldRetry: isTransientError,
    });

    // Both calls are read-only. Retry transient/rate-limit failures and share this
    // single in-flight refresh across every WalletControl mounted on the page.
    const [providerChainId, value] = await Promise.all([
      retryAsync(() => provider.request({ method: 'eth_chainId' }), {
        maxAttempts: 3,
        baseDelayMs: 650,
        maxDelayMs: 5_000,
        shouldRetry: isTransientError,
      }),
      retryAsync(() => publicClient.getBalance({ address }), {
        maxAttempts: 3,
        baseDelayMs: 650,
        maxDelayMs: 5_000,
        shouldRetry: isTransientError,
      }),
    ]);

    const snapshot = {
      chainId: parseHexChainId(providerChainId),
      balance: {
        value,
        decimals: 18,
        symbol: web3Config.requiredChain.nativeCurrency.symbol,
      },
    };
    walletSnapshotCache = { address: normalizedAddress, updatedAt: Date.now(), snapshot };
    return snapshot;
  })().finally(() => {
    if (walletRefreshFlight?.promise === promise) walletRefreshFlight = null;
  });

  walletRefreshFlight = { address: normalizedAddress, promise };
  return promise;
};

export function useWalletConnection() {
  const { ready: privyReady, authenticated } = usePrivy();
  const { ready: walletsReady, wallets } = useWallets();
  const embeddedWallet = useMemo(
    () => wallets.find((wallet) => wallet.walletClientType === 'privy'),
    [wallets],
  );
  const [chainId, setChainId] = useState();
  const [balance, setBalance] = useState();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const connector = useMemo(
    () =>
      embeddedWallet
        ? {
            id: 'privy-embedded-wallet',
            name: 'Privy Embedded Wallet',
            type: 'privy',
            getProvider: () => embeddedWallet.getEthereumProvider(),
          }
        : null,
    [embeddedWallet],
  );

  const refreshWalletState = useCallback(
    async ({ force = false } = {}) => {
      if (!embeddedWallet?.address) {
        setChainId(undefined);
        setBalance(undefined);
        return { chainId: undefined, balance: undefined };
      }

      setIsRefreshing(true);
      try {
        const snapshot = await loadWalletSnapshot(embeddedWallet, { force });
        setChainId(snapshot.chainId);
        setBalance(snapshot.balance);
        return snapshot;
      } finally {
        setIsRefreshing(false);
      }
    },
    [embeddedWallet],
  );

  useEffect(() => {
    refreshWalletState().catch(() => undefined);
    if (!embeddedWallet?.address) return undefined;

    const timer = window.setInterval(
      () => refreshWalletState().catch(() => undefined),
      WALLET_REFRESH_INTERVAL,
    );
    return () => window.clearInterval(timer);
  }, [embeddedWallet?.address, refreshWalletState]);

  const switchChain = useCallback(
    async (targetChainId) => {
      const target = web3Config.supportedChains.find(
        (chain) => chain.id === Number(targetChainId),
      );
      if (!target)
        throw new Error('The requested network is not configured in this application.');
      if (!embeddedWallet)
        throw new Error('Your Privy secure account is not available. Sign in again.');

      await embeddedWallet.switchChain(target.id);
      invalidateWalletSnapshot();
      await refreshWalletState({ force: true });
      return target;
    },
    [embeddedWallet, refreshWalletState],
  );

  const connect = useCallback(async () => {
    if (!embeddedWallet) {
      throw new Error(
        'Your Privy secure account is prepared when you sign in. Sign in again to restore access.',
      );
    }

    const snapshot = await refreshWalletState();
    return {
      address: embeddedWallet.address,
      addresses: [embeddedWallet.address],
      chainId: snapshot?.chainId ?? chainId,
    };
  }, [chainId, embeddedWallet, refreshWalletState]);

  // Kept only as a compatibility surface for legacy callers. Wallet account switching is
  // intentionally disabled in V2 because the wallet is bound to the authenticated Privy user.
  const disconnect = useCallback(async () => undefined, []);

  const address = embeddedWallet?.address || undefined;
  const isConnected = Boolean(
    privyReady && walletsReady && authenticated && embeddedWallet?.address,
  );
  const isSupportedChain = web3Config.supportedChains.some((chain) => chain.id === chainId);
  const isCorrectNetwork = isConnected && chainId === web3Config.requiredChain.id;
  const chain = web3Config.supportedChains.find((item) => item.id === chainId);

  return {
    status: isConnected ? 'connected' : 'disconnected',
    isConnected,
    isConnecting: false,
    isDisconnected: !isConnected,
    address,
    addresses: address ? [address] : [],
    chainId,
    chain,
    connector,
    connectors: connector ? [connector] : [],
    connect,
    disconnect,
    switchChain,
    requiredChain: web3Config.requiredChain,
    supportedChains: web3Config.supportedChains,
    walletConnectConfigured: false,
    isCorrectNetwork,
    isSupportedChain,
    isUnsupportedNetwork: isConnected && !isSupportedChain,
    isBusy: isRefreshing,
    connectingConnectorId: undefined,
    switchingChainId: undefined,
    balance,
    balanceLabel: isRefreshing && !balance ? 'Loading balance…' : formatWalletBalance(balance),
    shortAddress: shortenWalletAddress(address),
    walletSource: 'privy',
  };
}
