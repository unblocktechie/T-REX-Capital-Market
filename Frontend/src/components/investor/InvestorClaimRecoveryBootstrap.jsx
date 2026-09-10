import { useEffect, useRef } from 'react';
import { investorApi } from '@/api/investor';
import { ROLES } from '@/config/permissions';
import { useAuth } from '@/hooks/useAuth';
import { investorClaimRecoveryStore } from '@/services/investor/investorClaimRecoveryStore';

const normalize = (value) => String(value || '').trim().toUpperCase();

export function InvestorClaimRecoveryBootstrap() {
  const { user, isAuthenticated } = useAuth();
  const inFlightRef = useRef(new Set());

  useEffect(() => {
    if (!isAuthenticated || user?.role !== ROLES.investor) return undefined;

    const reconcileOnce = async () => {
      // The Submit Claim page owns visible finite polling. Outside that page this
      // helper reconciles only on mount/online, never opens a wallet, and never starts
      // an endless background retry loop.
      if (window.location.pathname.includes('/submit-claim')) return;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

      const records = investorClaimRecoveryStore.listAll();
      await Promise.all(records.map(async (record) => {
        const key = `${record.interestId}:${record.claimId}`;
        if (inFlightRef.current.has(key)) return;
        inFlightRef.current.add(key);

        try {
          // Confirm this application belongs to the current investor before using a
          // locally remembered recovery pointer from a shared browser.
          await investorApi.getClaims(record.interestId);
          const response = await investorApi.retryClaim(record.claimId, {
            interestId: record.interestId,
          });
          const workflowStatus = normalize(response?.status);
          if (workflowStatus === 'CONFIRMED' || workflowStatus === 'TRANSACTION_REQUIRED') {
            investorClaimRecoveryStore.remove(record.interestId, record.claimId);
          }
        } catch {
          // Best-effort only. Detailed errors/request IDs remain owned by the claim UI.
        } finally {
          inFlightRef.current.delete(key);
        }
      }));
    };

    void reconcileOnce();
    window.addEventListener('online', reconcileOnce);
    return () => window.removeEventListener('online', reconcileOnce);
  }, [isAuthenticated, user?.role]);

  return null;
}
