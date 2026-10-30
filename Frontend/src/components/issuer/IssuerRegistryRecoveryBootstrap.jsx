import { useEffect, useRef } from 'react';
import { ROLES } from '@/config/permissions';
import { useAuth } from '@/hooks/useAuth';
import { issuerInvestorSubscriptionsService } from '@/services/issuer/issuerInvestorSubscriptionsService';
import { issuerRegistryRecoveryStore } from '@/services/issuer/issuerRegistryRecoveryStore';
import { networkUserKey, useNetworkStore } from '@/store/network.store';
import { isValidTransactionHash } from '@/utils/transactionHash';

const normalizeStatus = (value) => String(value || '').trim().toUpperCase();
const isConfirmed = (registration) => normalizeStatus(registration?.status) === 'CONFIRMED';
const hasTransaction = (registration) => isValidTransactionHash(registration?.txHash);
const TERMINAL_REGISTRY_ERROR_CODES = new Set([
  'TRANSACTION_FAILED',
  'INVALID_REGISTRY_CONTRACT',
  'UNAUTHORIZED_TRANSACTION_SENDER',
  'REGISTRY_PARAMETERS_MISMATCH',
]);
const isTerminalFailure = (registration) => TERMINAL_REGISTRY_ERROR_CODES.has(
  normalizeStatus(
    registration?.errorCode
      || registration?.verificationCode
      || registration?.code
      || registration?.status,
  ),
);
const terminalErrorFromResponse = (error) => TERMINAL_REGISTRY_ERROR_CODES.has(normalizeStatus(
  error?.response?.data?.error?.code
    || error?.response?.data?.data?.error?.code
    || error?.response?.data?.errorCode
    || error?.response?.data?.code,
));

export function IssuerRegistryRecoveryBootstrap() {
  const { user, isAuthenticated } = useAuth();
  const inFlightRef = useRef(new Set());
  const userKey = networkUserKey(user);
  const selectedChainUid = useNetworkStore(
    (state) => state.activeChainUidByUser[userKey] || '',
  );

  useEffect(() => {
    if (!isAuthenticated || user?.role !== ROLES.issuer || !selectedChainUid) return undefined;

    const reconcileOnce = async () => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

      // Registry operations and their transaction hashes are chain scoped.
      // Never try to reconcile a saved operation against a different selected chain.
      const activeChainId = useNetworkStore.getState().getActiveChainId(user);
      const records = issuerRegistryRecoveryStore.listForUser(user)
        .filter((record) => record.chainId === activeChainId);
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

          if (isTerminalFailure(latest)) {
            // The backend already owns the failed hash and operation. A terminal failure
            // must wait for the issuer's explicit Retry Registration action, which will
            // broadcast a new transaction using the same operation's authoritative args.
            issuerRegistryRecoveryStore.removeForUser(user, record.interestUid, record.txHash);
            return;
          }

          const hashToConfirm = hasTransaction(latest) ? latest.txHash : record.txHash;
          const operationId = latest?.registryOperationId || record.registryOperationId;

          // Resume temporary/incomplete verification with the existing hash. Terminal
          // failures are handled above and never re-confirmed automatically.
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
          } else if (terminalErrorFromResponse(error)) {
            issuerRegistryRecoveryStore.removeForUser(user, record.interestUid, record.txHash);
          }
          // Keep recovery for temporary 422 verification states, 503, and network failures.
          // No recovery path ever opens MetaMask or broadcasts a replacement transaction.
        } finally {
          inFlightRef.current.delete(key);
        }
      }));
    };

    void reconcileOnce();
    window.addEventListener('online', reconcileOnce);
    return () => window.removeEventListener('online', reconcileOnce);
  }, [isAuthenticated, selectedChainUid, user]);

  return null;
}
