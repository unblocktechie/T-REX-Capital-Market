import {
  useBalance,
  useConnect,
  useConnection,
  useConnectors,
  useDisconnect,
  useSwitchChain,
} from 'wagmi';
import { web3Config } from '@/config/web3';
import { formatWalletBalance, shortenWalletAddress } from '@/utils/wallet';

export function useWalletConnection() {
  const connection = useConnection();
  const connectors = useConnectors();
  const connectMutation = useConnect();
  const disconnectMutation = useDisconnect();
  const switchMutation = useSwitchChain();

  const balanceQuery = useBalance({
    address: connection.address,
    chainId: connection.chainId,
    query: {
      enabled: Boolean(connection.address && connection.chainId),
      refetchInterval: 20_000,
    },
  });

  const connect = async (connector) => {
    try {
      const result = await connectMutation.mutateAsync({
        connector,
        chainId: web3Config.requiredChain.id,
      });

      if (result.chainId !== web3Config.requiredChain.id) {
        await switchMutation.mutateAsync({ chainId: web3Config.requiredChain.id });
      }

      return result;
    } finally {
      // TanStack mutations retain their last variables after they settle. Resetting
      // prevents a rejected/cancelled wallet request from leaving its option in a
      // permanent loading state when the modal stays open.
      connectMutation.reset();
    }
  };

  const switchChain = async (chainId) => switchMutation.mutateAsync({ chainId });
  const disconnect = async () => disconnectMutation.mutateAsync({
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
    isBusy:
      connectMutation.isPending ||
      disconnectMutation.isPending ||
      switchMutation.isPending,
    connectingConnectorId: connectMutation.isPending
      ? connectMutation.variables?.connector?.id
      : undefined,
    switchingChainId: switchMutation.variables?.chainId,
    balance: balanceQuery.data,
    balanceLabel: balanceQuery.isPending
      ? 'Loading balance…'
      : formatWalletBalance(balanceQuery.data),
    shortAddress: shortenWalletAddress(connection.address),
  };
}
