import { chainsApi } from '@/api/chains';
import { supportsPaymentAction } from '@/config/payment-tokens';
import { web3Config } from '@/config/web3';

// Payment-token catalogue data is configuration, not transactional state. Keep
// a short-lived in-memory copy so rapid quote/allowance reads do not repeatedly
// call /chains/:id/config while the user is typing. Requests that provide an
// AbortSignal intentionally bypass the shared cache so cancellation semantics
// remain unchanged.
const PAYMENT_CONFIG_TTL_MS = 30_000;
const paymentConfigCache = new Map();

const resolveChainUid = ({ chainUid, chainId }) => {
  if (chainUid && chainId) throw new Error('Use chainUid or chainId when loading payment tokens, not both.');
  const direct = String(chainUid || '').trim();
  if (direct) return direct;
  const record = web3Config.getChainRecordById(chainId);
  if (!record?.chainUid) throw new Error('The selected network is unavailable.');
  return record.chainUid;
};

const loadChainPaymentConfig = async (chainUid, signal) => {
  if (signal) return chainsApi.getConfig(chainUid, { signal });

  const cached = paymentConfigCache.get(chainUid);
  if (cached?.value && Date.now() - cached.cachedAt <= PAYMENT_CONFIG_TTL_MS) {
    return cached.value;
  }
  if (cached?.promise) return cached.promise;

  const promise = chainsApi.getConfig(chainUid)
    .then((config) => {
      paymentConfigCache.set(chainUid, {
        value: config,
        cachedAt: Date.now(),
        promise: null,
      });
      return config;
    })
    .catch((error) => {
      paymentConfigCache.delete(chainUid);
      throw error;
    });

  paymentConfigCache.set(chainUid, {
    value: cached?.value || null,
    cachedAt: cached?.cachedAt || 0,
    promise,
  });
  return promise;
};

export async function getPaymentTokens({ chainUid, chainId, action = 'purchase', signal } = {}) {
  const resolvedChainUid = resolveChainUid({ chainUid, chainId });
  const config = await loadChainPaymentConfig(resolvedChainUid, signal);
  return (config.paymentTokens || []).filter((item) =>
    !action || action === 'price' || supportsPaymentAction(item, action));
}

export async function requirePaymentToken({ paymentTokenAddress, chainUid, chainId, action }) {
  const rows = await getPaymentTokens({ chainUid, chainId, action });
  const item = rows.find((row) =>
    (!chainUid || row.chainUid === String(chainUid)) &&
    (!chainId || row.chainId === Number(chainId)) &&
    row.contractAddress.toLowerCase() === String(paymentTokenAddress || '').toLowerCase());
  if (!item || (action !== 'price' && !supportsPaymentAction(item, action))) {
    throw new Error('This asset’s payment token is unavailable for this action. Refresh or contact support.');
  }
  return item;
}
