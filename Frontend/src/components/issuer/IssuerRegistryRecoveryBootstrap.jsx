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

          const hashToConfirm = hasTransaction(latest) ? latest.txHash : record.txHash;
          const operationId = latest?.registryOperationId || record.registryOperationId;

          // Always resume the existing operation with its stored hash. This is important for
          // registrations that previously returned a verification error before a server fix:
          // sign-in/reload retries Confirm and never opens Privy wallet or broadcasts a new tx.
          await issuerInvestorSubscriptionsService.confirmRegistryRegistration(
            record.interestUid,
            operationId,
            hashToConfirm,
          );
          // A successful 200/202 response means the API now owns the durable hash and can
          // finish a PENDING operation asynchronously. Browser recovery is no longer needed.
          issuerRegistryRecoveryStore.removeForUser(user, record.interestUid, record.txHash);
        } catch (error) {
          if (error?.response?.status === 403) {
            issuerRegistryRecoveryStore.removeForUser(user, record.interestUid, record.txHash);
          }
          // Keep recovery for 422, 503, and network failures. A 422 must never cause an
          // automatic replacement Privy wallet transaction; a later reload/sign-in retries the
          // same hash after the verification issue is resolved.
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
