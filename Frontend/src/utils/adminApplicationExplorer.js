import { getChainRecordById, getChainRecordByUid } from '@/config/web3';
import { resolveChainExplorerUrl } from '@/utils/chainExplorerOverrides';
import { isValidTransactionHash } from '@/utils/transactionHash';
import { adminTokenAddressExplorerUrl } from '@/utils/adminTokenDisplay';

const text = (value) => String(value ?? '').trim();

/** Find the application chain from the backend record or the selected application's network. */
export const getApplicationExplorerBase = (history = {}, application = {}, chains = []) => {
  const record = application || {};
  const chainId = history.chainId || history.chain?.chainId || history.network?.chainId || history.summary?.chainId || record.chainId || record.chain?.chainId || record.network?.chainId;
  const chainUid = history.chainUid || history.chain?.chainUid || history.network?.chainUid || history.summary?.chainUid || record.chainUid || record.network?.chainUid;
  const chainName = text(history.chainName || history.chain?.chainName || history.network?.chainName || record.chainName || record.network?.chainName).toLowerCase();
  const matchingChain = chains.find((chain) => chainId && Number(chain.chainId) === Number(chainId))
    || chains.find((chain) => chainUid && chain.chainUid === chainUid)
    || chains.find((chain) => chainName && text(chain.chainName).toLowerCase() === chainName)
    || getChainRecordById(chainId)
    || getChainRecordByUid(chainUid);
  if (!matchingChain || !matchingChain.chainId) return '';
  // Prefer the recorded chain's explorer; special networks use canonical overrides.
  return resolveChainExplorerUrl(matchingChain.chainId, matchingChain.explorerUrl || matchingChain.blockExplorers?.default?.url);
};

/** Refuse invalid transaction hashes and untrusted/non-HTTP explorer URLs. */
export const getAdminApplicationTransactionUrl = (hash, explorerBase) => {
  if (!isValidTransactionHash(hash)) return '';
  try {
    const url = new URL(text(explorerBase));
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return '';
    return `${url.origin}${url.pathname.replace(/\/+$/, '')}/tx/${text(hash)}`;
  } catch {
    return '';
  }
};


/** Display the token symbol alongside its name without duplicating a name that is already a symbol. */
export const getApplicationTokenLabel = (history = {}, application = {}, token = {}) => {
  const name = text(history.tokenName || history.token?.tokenName || application?.tokenName || application?.token?.tokenName || token.tokenName || 'Investment application');
  const symbol = text(history.tokenSymbol || history.token?.tokenSymbol || application?.tokenSymbol || application?.token?.tokenSymbol || token.tokenSymbol);
  return symbol && name.toLowerCase() !== symbol.toLowerCase() ? `${name} (${symbol})` : name;
};

/** Use only verified EVM addresses and the application chain's explorer. Never infer the current wallet chain. */
export const getApplicationTokenContractUrl = (history = {}, application = {}, token = {}, explorerBase = '') => {
  const address = history.tokenAddress || history.token?.tokenAddress
    || application?.tokenAddress || application?.token?.tokenAddress || token.tokenAddress;
  return adminTokenAddressExplorerUrl(address, explorerBase);
};
