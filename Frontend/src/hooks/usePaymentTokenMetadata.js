import { useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { usePaymentTokens } from '@/hooks/usePaymentTokens';
import { web3Config } from '@/config/web3';
import { networkUserKey, useNetworkStore } from '@/store/network.store';
import { resolveMasterImageUrl } from '@/utils/masterImage';

const text = (value) => String(value || '').trim();
const normalizeAddress = (value) => text(value).toLowerCase();
const positiveChainId = (value) => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

/**
 * Resolve an asset's settlement/payment-token presentation from the selected
 * chain catalogue. The payment-token contract address is authoritative; the
 * symbol carried by an investment response is only a display fallback.
 */
export function usePaymentTokenMetadata({
  paymentTokenAddress = '',
  paymentTokenSymbol = '',
  chainUid = '',
  chainId = null,
  enabled = true,
} = {}) {
  const { user } = useAuth();
  const userKey = networkUserKey(user);
  const selectedChainUid = useNetworkStore(
    (state) => state.activeChainUidByUser[userKey] || '',
  );

  const normalizedChainId = positiveChainId(chainId);
  const resolvedChainUid = text(
    chainUid
      || web3Config.getChainRecordById(normalizedChainId)?.chainUid
      || selectedChainUid,
  );

  const catalogue = usePaymentTokens({
    chainUid: resolvedChainUid,
    action: 'price',
    enabled: Boolean(enabled && resolvedChainUid),
  });

  const normalizedAddress = normalizeAddress(paymentTokenAddress);
  const normalizedFallbackSymbol = text(paymentTokenSymbol).toUpperCase();

  const paymentToken = useMemo(() => {
    if (!normalizedAddress) return null;
    return (catalogue.data || []).find(
      (item) => normalizeAddress(item?.contractAddress) === normalizedAddress,
    ) || null;
  }, [catalogue.data, normalizedAddress]);

  return {
    ...catalogue,
    chainUid: resolvedChainUid,
    paymentToken,
    symbol: text(paymentToken?.symbol).toUpperCase() || normalizedFallbackSymbol,
    name: text(paymentToken?.name) || text(paymentToken?.symbol) || normalizedFallbackSymbol,
    imageUrl: paymentToken ? resolveMasterImageUrl(paymentToken) : '',
    contractAddress: text(paymentToken?.contractAddress) || text(paymentTokenAddress),
    decimals: Number.isInteger(paymentToken?.decimals) ? paymentToken.decimals : null,
    fromCatalogue: Boolean(paymentToken),
  };
}

export default usePaymentTokenMetadata;
