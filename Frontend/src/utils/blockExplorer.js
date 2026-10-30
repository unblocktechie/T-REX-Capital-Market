import { web3Config } from '@/config/web3';
import { isValidTransactionHash, normalizeTransactionHash } from '@/utils/transactionHash';

const clean = (value) => String(value ?? '').trim();

const configuredChain = (chainId) => {
  const rawChainId = clean(chainId);
  if (rawChainId) {
    const parsedChainId = Number(rawChainId);
    if (!Number.isSafeInteger(parsedChainId)) return null;
    return web3Config.supportedChains.find((chain) => chain.id === parsedChainId) || null;
  }

  return web3Config.requiredChain || null;
};

export const transactionExplorerUrl = (txHash, chainId) => {
  const normalizedHash = normalizeTransactionHash(txHash);
  if (!isValidTransactionHash(normalizedHash)) return '';

  const baseUrl = clean(configuredChain(chainId)?.blockExplorers?.default?.url).replace(/\/$/, '');
  return baseUrl ? `${baseUrl}/tx/${normalizedHash}` : '';
};

export const transactionExplorerName = (chainId) => {
  const name = clean(configuredChain(chainId)?.blockExplorers?.default?.name);
  return name || 'block explorer';
};
