import { useEffect, useRef } from 'react';
import { investorApi } from '@/api/investor';
import { ROLES } from '@/config/permissions';
import { useAuth } from '@/hooks/useAuth';
import { investorClaimRecoveryStore } from '@/services/investor/investorClaimRecoveryStore';

const RETRY_INTERVAL_MS = 20_000;

const normalize = (value) => String(value || '').trim().toUpperCase();
const errorCode = (error) => normalize(
  error?.response?.data?.code || error?.response?.data?.error?.code || error?.code,
);

const isRetryable = (error) => {
  const status = Number(error?.response?.status || 0);
  if (!error?.response) return true;
  if (status >= 500 || status === 408 || status === 429) return true;
  return ['TRANSACTION_NOT_FOUND', 'TRANSACTION_PENDING', 'RPC_UNAVAILABLE'].includes(errorCode(error));
};

const backendClaimStatus = (response) => normalize(response?.claim?.status);

export function InvestorClaimRecoveryBootstrap() {
  const { user, isAuthenticated } = useAuth();
  const inFlightRef = useRef(new Set());

  useEffect(() => {
    if (!isAuthenticated || user?.role !== ROLES.investor) return undefined;

    const retryPending = async () => {
      // The Submit Claim page owns visible recovery state while it is open. Avoid a
      // second UI-independent retry loop on the same route.
      if (window.location.pathname.includes('/submit-claim')) return;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

      const records = investorClaimRecoveryStore.listAll();
      await Promise.all(records.map(async (record) => {
        const key = `${record.interestId}:${record.claimId}`;
        if (inFlightRef.current.has(key)) return;
        inFlightRef.current.add(key);

        try {
          // Confirm this pending record belongs to the currently authenticated investor
          // before replaying it. This prevents a shared browser from submitting another
          // investor's local recovery record after an account switch.
          try {
            await investorApi.getClaims(record.interestId);
          } catch {
            return;
          }

          try {
            const response = await investorApi.submitClaim(record.claimId, {
              interestId: record.interestId,
              txHash: record.txHash,
            });
            const status = backendClaimStatus(response);
            if (status === 'CONFIRMED' || status === 'FAILED') {
              investorClaimRecoveryStore.remove(record.interestId, record.claimId);
            }
            // Any other successful-but-non-confirmed response remains recoverable.
          } catch (error) {
            if (!isRetryable(error)) {
              // A definitive backend/business validation answer means this exact
              // transaction should not be retried automatically again.
              investorClaimRecoveryStore.remove(record.interestId, record.claimId);
            }
          }
        } finally {
          inFlightRef.current.delete(key);
        }
      }));
    };

    void retryPending();
    const timer = window.setInterval(() => void retryPending(), RETRY_INTERVAL_MS);
    window.addEventListener('online', retryPending);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener('online', retryPending);
    };
  }, [isAuthenticated, user?.role]);

  return null;
}
