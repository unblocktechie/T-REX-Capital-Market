import { getChainRecordById, getChainRecordByUid } from '@/config/web3';

const CONTRACT_ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

export const isTokenContractAddress = (address) =>
  typeof address === 'string' && CONTRACT_ADDRESS_PATTERN.test(address.trim());

export const shortenTokenContractAddress = (address) => {
  if (!isTokenContractAddress(address)) return '—';
  const value = address.trim();
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
};

/** Use the offering's chain, never a wallet/default-chain fallback. */
export const tokenContractExplorerUrl = ({ address, chainUid, chainId } = {}) => {
  if (!isTokenContractAddress(address)) return '';

  const uid = String(chainUid || '').trim();
  const id = chainId == null || chainId === '' ? null : Number(chainId);
  if (id != null && (!Number.isSafeInteger(id) || id <= 0)) return '';
  const byUid = uid ? getChainRecordByUid(uid) : null;
  const byId = id != null ? getChainRecordById(id) : null;

  // Fail closed if the API returned a chain not in the active catalogue,
  // or if the two identifiers disagree; do not link to another network.
  if ((uid && !byUid) || (id != null && !byId)) return '';
  if (byUid && byId && byUid.chainId !== byId.chainId) return '';
  const base = String((byUid || byId)?.explorerUrl || '').trim();
  if (!base) return '';

  try {
    const explorer = new URL(base);
    if (!['https:', 'http:'].includes(explorer.protocol) || explorer.username || explorer.password) return '';
    const path = explorer.pathname.replace(/\/+$/, '');
    return `${explorer.origin}${path}/address/${address.trim()}`;
  } catch {
    return '';
  }
};
