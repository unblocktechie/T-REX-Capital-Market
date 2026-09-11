import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatUnits } from 'viem';
import { getInvestorPurchaseTokenBalance } from '@/services/investor/investorTokenPurchaseTransaction.service';

const supportedTokenDecimals = (value) => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= 36 ? parsed : 18;
};

/**
 * Read-only balance helper shared by investor asset actions.
 * Balance visibility is informational and never blocks an action if the RPC
 * cannot be reached or the token deployment details are not available yet.
 */
export function useInvestorTokenWalletBalance({
  tokenAddress,
  investorWalletAddress,
  chainId,
  tokenDecimals,
}) {
  const [rawBalance, setRawBalance] = useState(null);
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;

    if (!tokenAddress || !investorWalletAddress || !chainId) {
      setRawBalance(null);
      setLoading(false);
      return () => {
        active = false;
      };
    }

    setLoading(true);
    getInvestorPurchaseTokenBalance({
      tokenAddress,
      investorWalletAddress,
      chainId,
    })
      .then((balance) => {
        if (active) setRawBalance(balance);
      })
      .catch(() => {
        if (active) setRawBalance(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [chainId, investorWalletAddress, refreshKey, tokenAddress]);

  const balance = useMemo(() => {
    if (typeof rawBalance !== 'bigint') return '';
    try {
      return formatUnits(rawBalance, supportedTokenDecimals(tokenDecimals));
    } catch {
      return '';
    }
  }, [rawBalance, tokenDecimals]);

  const refresh = useCallback(() => setRefreshKey((value) => value + 1), []);

  return { balance, rawBalance, loading, refresh };
}
