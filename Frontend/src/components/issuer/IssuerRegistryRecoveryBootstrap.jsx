import { useEffect, useRef } from 'react';
import { ROLES } from '@/config/permissions';
import { useAuth } from '@/hooks/useAuth';
import { issuerInvestorSubscriptionsService } from '@/services/issuer/issuerInvestorSubscriptionsService';
import { issuerRegistryRecoveryStore } from '@/services/issuer/issuerRegistryRecoveryStore';
import { isValidTransactionHash } from '@/utils/transactionHash';

const normalizeStatus = (value) => String(value || '').trim().toUpperCase();
const isConfirmed = (registration) => normalizeStatus(registration?.status) === 'CONFIRMED';
const hasTransaction = (registration) => isValidTransactionHash(registration?.txHash);

export function IssuerRegistryRecoveryBootstrap() {
  const { user, isAuthenticated } = useAuth();
  const inFlightRef = useRef(new Set());

  useEffect(() => {
    if (!isAuthenticated || user?.role !== ROLES.issuer) return undefined;

    const reconcileOnce = async () => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

      const records = issuerRegistryRecoveryStore.listForUser(user);
      await Promise.all(records.map(async (record) => {
        const key = `${record.interestUid}:${record.txHash.toLowerCase()}`;
        if (inFlightRef.current.has(key)) return;
        inFlightRef.current.add(key);

        try {
          let latest = null;
          try {
            latest = await issuerInvestorSubscriptionsService.getRegistryRegistration(
              record.interestUid,
            );
          } catch (error) {
            // A missing or temporarily unavailable read must not discard a transaction that
            // was already signed and broadcast. The confirm call below is idempotent.
            if (error?.response?.status === 403) {
              issuerRegistryRecoveryStore.removeForUser(user, record.interestUid, record.txHash);
              return;
            }
          }

          if (isConfirmed(latest)) {
            issuerRegistryRecoveryStore.removeForUser(user, record.interestUid, record.txHash);
            return;
          }

          if (hasTransaction(latest)) {
            // If the backend already stores this hash, synchronization has completed. If it
            // stores another hash, this local pointer is stale and must never overwrite it.
            issuerRegistryRecoveryStore.removeForUser(user, record.interestUid, record.txHash);
            return;
          }

          await issuerInvestorSubscriptionsService.confirmRegistryRegistration(
            record.interestUid,
            latest?.registryOperationId || record.registryOperationId,
            record.txHash,
          );
          issuerRegistryRecoveryStore.removeForUser(user, record.interestUid, record.txHash);
        } catch (error) {
          if (error?.response?.status === 403 || error?.response?.status === 422) {
            issuerRegistryRecoveryStore.removeForUser(user, record.interestUid, record.txHash);
          }
          // Network/server failures intentionally keep the local record. It is retried after
          // the next sign-in, reload, or browser online event without reopening MetaMask.
        } finally {
          inFlightRef.current.delete(key);
        }
      }));
    };

    void reconcileOnce();
    window.addEventListener('online', reconcileOnce);
    return () => window.removeEventListener('online', reconcileOnce);
  }, [isAuthenticated, user]);

  return null;
}
