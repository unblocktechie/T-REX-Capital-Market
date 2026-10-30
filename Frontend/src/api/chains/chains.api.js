import { apiClient } from '@/api/axios';
import { normalizePaymentTokens } from '@/config/payment-tokens';
import { normalizeChainRecord } from '@/config/web3';
import { CHAIN_ENDPOINTS } from './chains.endpoints';

const unwrap = (response) => response.data?.data ?? response.data;
const rowsOf = (payload) => {
  if (Array.isArray(payload)) return payload;
  return payload?.chains || payload?.items || [];
};

export const normalizeUserChain = (row = {}) => {
  const base = normalizeChainRecord(row);
  if (!base) return null;
  return {
    ...base,
    isUnlocked: Boolean(row.isUnlocked),
    identityStatus: String(row.identityStatus || (row.isUnlocked ? 'CREATED' : 'LOCKED')).toUpperCase(),
    identityAddress: String(row.identityAddress || '').trim(),
    identityTransactionHash: String(row.identityTransactionHash || '').trim(),
    identityErrorCode: String(row.identityErrorCode || '').trim(),
    identityErrorMessage: String(row.identityErrorMessage || '').trim(),
  };
};

export const normalizeChainConfig = (payload = {}) => {
  const data = payload?.data ?? payload;
  const base = normalizeChainRecord(data);
  if (!base) throw new Error('The selected network configuration is incomplete.');

  const contracts = data.contracts && typeof data.contracts === 'object' ? data.contracts : {};
  const platformControllerAddress = String(contracts.platform?.platformController || '').trim();
  const paymentTokens = normalizePaymentTokens(
    (Array.isArray(data.paymentTokens) ? data.paymentTokens : []).map((item) => ({
      ...item,
      chainUid: item.chainUid || base.chainUid,
      chainId: item.chainId || base.chainId,
      platformControllerAddress:
        item.platformControllerAddress || item.controllerAddress || platformControllerAddress,
    })),
  );

  return {
    ...base,
    contracts,
    confirmations: {
      transactions: Number(data.confirmations?.transactions || base.requiredConfirmations || 1),
      registry: Number(data.confirmations?.registry || base.registryConfirmations || 1),
    },
    paymentTokens,
  };
};

export const chainsApi = Object.freeze({
  listPublic: () => apiClient.get(CHAIN_ENDPOINTS.public, { skipGlobalLoader: true })
    .then(unwrap)
    .then((payload) => rowsOf(payload).map(normalizeChainRecord).filter(Boolean)),
  listMine: () => apiClient.get(CHAIN_ENDPOINTS.mine, { skipGlobalLoader: true })
    .then(unwrap)
    .then((payload) => rowsOf(payload).map(normalizeUserChain).filter(Boolean)),
  getConfig: (chainUid, options = {}) => apiClient
    .get(CHAIN_ENDPOINTS.config(chainUid), { skipGlobalLoader: true, ...options })
    .then(unwrap)
    .then(normalizeChainConfig),
  unlock: (chainUid) => apiClient.post(CHAIN_ENDPOINTS.unlock(chainUid), undefined, { skipGlobalLoader: true }).then(unwrap),
});
