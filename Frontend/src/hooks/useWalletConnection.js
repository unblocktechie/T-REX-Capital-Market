import {
  useBalance,
  useConnect,
  useConnection,
  useConnectors,
  useDisconnect,
  useSwitchChain,
} from 'wagmi';
import { useState } from 'react';
import { web3Config } from '@/config/web3';
import { formatWalletBalance, shortenWalletAddress } from '@/utils/wallet';

const getErrorCode = (error) =>
  error?.code ??
  error?.cause?.code ??
  error?.details?.code ??
  error?.data?.originalError?.code;

const getErrorText = (error) =>
  `${error?.shortMessage || ''} ${error?.details || ''} ${error?.message || ''}`.toLowerCase();

const isRejectedWalletRequest = (error) =>
  getErrorCode(error) === 4001 ||
  /user rejected|user denied|request rejected/.test(getErrorText(error));

const isPendingWalletRequest = (error) =>
  getErrorCode(error) === -32002 ||
  /already pending|request of type.*already pending/.test(getErrorText(error));

const toHexChainId = (chainId) => `0x${Number(chainId).toString(16)}`;

async function requestProviderChainSwitch(connector, chain) {
  const provider = await connector?.getProvider?.();

  if (!provider?.request) {
    throw new Error('The connected wallet does not support automatic network switching.');
  }

  const chainId = toHexChainId(chain.id);

  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId }],
    });
  } catch (error) {
    if (isRejectedWalletRequest(error)) throw error;

    const shouldAddChain =
      getErrorCode(error) === 4902 ||
      /unknown chain|unrecognized chain/.test(getErrorText(error));
    if (!shouldAddChain) throw error;

    const rpcUrls = chain.rpcUrls?.default?.http || chain.rpcUrls?.public?.http || [];
    const explorerUrl = chain.blockExplorers?.default?.url;

    await provider.request({
      method: 'wallet_addEthereumChain',
      params: [
        {
          chainId,
          chainName: chain.name,
          nativeCurrency: chain.nativeCurrency,
          rpcUrls,
          ...(explorerUrl ? { blockExplorerUrls: [explorerUrl] } : {}),
        },
      ],
    });

    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId }],
    });
  }

  return chain;
}

export function useWalletConnection() {
  const connection = useConnection();
  const connectors = useConnectors();
  const connectMutation = useConnect({ mutation: { meta: { silent: true } } });
  const disconnectMutation = useDisconnect({ mutation: { meta: { silent: true } } });
  const switchMutation = useSwitchChain({ mutation: { meta: { silent: true } } });
  const [providerSwitchingChainId, setProviderSwitchingChainId] = useState();
  const isSupportedChain = web3Config.supportedChains.some(
    (chain) => chain.id === connection.chainId,
  );

  const balanceQuery = useBalance({
    address: connection.address,
    chainId: isSupportedChain ? connection.chainId : undefined,
    query: {
      // Wagmi throws a technical ChainNotConfiguredError when a connected wallet
      // is on a chain that is not registered in the app config. Avoid making the
      // balance request until the wallet is on one of the supported chains.
      enabled: Boolean(connection.address && connection.chainId && isSupportedChain),
      refetchInterval: 20_000,
      meta: { silent: true },
    },
  });

  const switchChain = async (chainId, connectorOverride) => {
    const targetChain = web3Config.supportedChains.find((chain) => chain.id === chainId);
    const activeConnector = connectorOverride || connection.connector;

    if (!targetChain) {
      throw new Error('The requested wallet network is not configured in this application.');
    }

    if (!activeConnector) {
      throw new Error('Connect a wallet before switching the network.');
    }

    try {
      return await switchMutation.mutateAsync({ chainId });
    } catch (error) {
      if (isRejectedWalletRequest(error) || isPendingWalletRequest(error)) throw error;

      setProviderSwitchingChainId(chainId);
      try {
        return await requestProviderChainSwitch(activeConnector, targetChain);
      } finally {
        setProviderSwitchingChainId(undefined);
      }
    } finally {
      switchMutation.reset();
    }
  };

  const connect = async (connector) => {
    try {
      const result = await connectMutation.mutateAsync({
        connector,
        chainId: web3Config.requiredChain.id,
      });

      if (result.chainId !== web3Config.requiredChain.id) {
        await requestProviderChainSwitch(connector, web3Config.requiredChain);
      }

      return result;
    } finally {
      // TanStack mutations retain their last variables after they settle. Resetting
      // prevents a rejected/cancelled wallet request from leaving its option in a
      // permanent loading state when the modal stays open.
      connectMutation.reset();
    }
  };

  const disconnect = async () =>
    disconnectMutation.mutateAsync({
      connector: connection.connector,
    });

  const isCorrectNetwork =
    connection.isConnected && connection.chainId === web3Config.requiredChain.id;

  return {
    ...connection,
    connectors,
    connect,
    disconnect,
    switchChain,
    requiredChain: web3Config.requiredChain,
    supportedChains: web3Config.supportedChains,
    walletConnectConfigured: web3Config.walletConnectConfigured,
    isCorrectNetwork,
    isSupportedChain,
    isUnsupportedNetwork: connection.isConnected && !isSupportedChain,
    isBusy:
      connectMutation.isPending ||
      disconnectMutation.isPending ||
      switchMutation.isPending ||
      Boolean(providerSwitchingChainId),
    connectingConnectorId: connectMutation.isPending
      ? connectMutation.variables?.connector?.id
      : undefined,
    switchingChainId: switchMutation.variables?.chainId || providerSwitchingChainId,
    balance: balanceQuery.data,
    balanceLabel:
      !isSupportedChain && connection.isConnected
        ? 'Unavailable on this network'
        : balanceQuery.isPending
          ? 'Loading balance…'
          : formatWalletBalance(balanceQuery.data),
    shortAddress: shortenWalletAddress(connection.address),
  };
}
