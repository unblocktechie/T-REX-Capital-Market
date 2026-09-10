import { useMemo } from 'react';
import { useWalletConnection } from '@/hooks/useWalletConnection';

const normalizeAddress = (value) => String(value || '').trim().toLowerCase();
const isAddress = (value) => /^0x[a-fA-F0-9]{40}$/.test(String(value || '').trim());

export function useRegisteredInvestorWalletGuard(registeredWalletAddress, configuredChainId) {
  const wallet = useWalletConnection();

  const registeredAddress = String(registeredWalletAddress || '').trim();
  const requestedChainId = Number(configuredChainId);
  const targetChainId = Number.isInteger(requestedChainId) && requestedChainId > 0
    ? requestedChainId
    : wallet.requiredChain.id;
  const targetChain = useMemo(
    () => wallet.supportedChains.find((chain) => chain.id === targetChainId) || null,
    [targetChainId, wallet.supportedChains],
  );

  const hasRegisteredWallet = isAddress(registeredAddress);
  const isRegisteredWalletConnected = Boolean(
    wallet.isConnected
      && hasRegisteredWallet
      && normalizeAddress(wallet.address) === normalizeAddress(registeredAddress),
  );
  const isCorrectNetwork = Boolean(wallet.isConnected && wallet.chainId === targetChainId);
  const isSupportedNetwork = Boolean(targetChain);
  const ready = Boolean(
    wallet.isConnected
      && hasRegisteredWallet
      && isRegisteredWalletConnected
      && isSupportedNetwork
      && isCorrectNetwork,
  );

  return {
    wallet,
    registeredAddress,
    hasRegisteredWallet,
    targetChainId,
    targetChain,
    targetNetworkLabel: targetChain?.name || `Chain ${targetChainId}`,
    isRegisteredWalletConnected,
    isCorrectNetwork,
    isSupportedNetwork,
    ready,
    switchToRequiredNetwork: () => wallet.switchChain(targetChainId),
  };
}
