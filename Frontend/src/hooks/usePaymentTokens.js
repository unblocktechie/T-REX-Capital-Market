import { useMemo } from 'react';
import { supportsPaymentAction } from '@/config/payment-tokens';
import { web3Config } from '@/config/web3';
import { useChainConfig } from '@/hooks/useChains';

export function usePaymentTokens({ chainUid, chainId, action = 'purchase', enabled = true } = {}) {
  const resolvedChainUid = String(
    chainUid || web3Config.getChainRecordById(chainId)?.chainUid || '',
  ).trim();
  const query = useChainConfig(resolvedChainUid, {
    enabled: Boolean(enabled && resolvedChainUid),
  });

  const data = useMemo(
    () => (query.data?.paymentTokens || []).filter((item) =>
      !action || action === 'price' || supportsPaymentAction(item, action)),
    [action, query.data?.paymentTokens],
  );

  return { ...query, data };
}
