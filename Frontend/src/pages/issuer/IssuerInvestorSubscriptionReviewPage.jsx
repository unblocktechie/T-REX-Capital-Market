import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Mail,
  RefreshCw,
  WalletCards,
  ShieldCheck,
  UserPlus,
  XCircle,
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { getAddress, isAddress } from 'viem';
import { toast } from 'sonner';
import { ApplicationHistory } from '@/components/application-history/ApplicationHistory';
import { buildApplicationHistoryEntries } from '@/utils/applicationHistoryEntries';
import { ContactSupportDialog } from '@/components/application-history/ContactSupportDialog';
import { InvestmentJourneyTracker } from '@/components/application-history/InvestmentJourneyTracker';
import { CompactAddress } from '@/components/common/CompactAddress';
import { SecureDocumentPreviewModal } from '@/components/common/SecureDocumentPreviewModal';
import { AppStatusBadge } from '@/components/common/AppStatusBadge';
import { RejectInterestModal, VerifyIdentityClaimsModal } from '@/components/issuer/IssuerInterestDecisionModals';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { featureFlags } from '@/config/featureFlags';
import { ROUTES } from '@/config/routes';
import { useAuth } from '@/hooks/useAuth';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useOrganization } from '@/hooks/useOrganization';
import { useWalletConnection } from '@/hooks/useWalletConnection';
import { issuerInvestorSubscriptionsService } from '@/services/issuer/issuerInvestorSubscriptionsService';
import { issuerRegistryRecoveryStore } from '@/services/issuer/issuerRegistryRecoveryStore';
import {
  getIssuerRegistryTransactionConfirmationProgress,
  isIssuerRegistryWalletRejection,
  submitIssuerRegistryRegistrationTransaction,
} from '@/services/issuer/issuerIdentityRegistryTransaction.service';
import { formatDate } from '@/utils/date';
import { getErrorMessage } from '@/utils/error';
import { isValidTransactionHash } from '@/utils/transactionHash';
import { getInvestmentJourney } from '@/utils/investmentJourney';
import { readApplicationProgress, isApplicationCompleted } from '@/utils/applicationProgress';
import { useNetworkStore } from '@/store/network.store';

const normalizeStatus = (status) => String(status || '')
  .trim()
  .toLowerCase()
  .replace(/[\s_-]+/g, '');

const isClaimVerifiedStatus = (status) => ['verifiedbyissuer', 'verified'].includes(normalizeStatus(status));
const isClaimSubmittedStatus = (status) => normalizeStatus(status) === 'claimsubmitted';

const filenameFromDisposition = (value, fallback) => {
  const match = String(value || '').match(/filename\*?=(?:UTF-8''|\")?([^\";]+)/i);
  if (!match?.[1]) return fallback;
  try { return decodeURIComponent(match[1].replace(/^\"|\"$/g, '')); } catch { return match[1].replace(/^\"|\"$/g, ''); }
};

const REGISTRY_STATUS_POLL_INTERVAL_MS = 5_000;
const REGISTRY_REQUIRED_CONFIRMATIONS = 12;
const REGISTRY_SUCCESS_MESSAGE = 'Issuer steps complete — awaiting investor claims. No further issuer approval is needed.';
const REGISTRY_PENDING_MESSAGE = 'Investor registration is being verified on-chain. Do not send another transaction.';
const REGISTRY_INVITE_TOOLTIP = 'Open Contact Us with this investor and application context attached.';
const REGISTRY_TEMPORARY_ERROR_CODES = new Set([
  'TRANSACTION_NOT_FOUND',
  'INSUFFICIENT_CONFIRMATIONS',
  'RPC_UNAVAILABLE',
  'SYNCING',
]);
const REGISTRY_TERMINAL_ERROR_CODES = new Set([
  'TRANSACTION_FAILED',
  'INVALID_REGISTRY_CONTRACT',
  'UNAUTHORIZED_TRANSACTION_SENDER',
  'REGISTRY_PARAMETERS_MISMATCH',
]);

const normalizeRegistryStatus = (status) => String(status || '').trim().toUpperCase();
const isRegistryConfirmed = (registration) => normalizeRegistryStatus(registration?.status) === 'CONFIRMED';
const hasRegistryTransaction = (registration) => isValidTransactionHash(registration?.txHash);
const registryErrorCode = (registration) => {
  const explicitCode = normalizeRegistryStatus(
    registration?.errorCode || registration?.verificationCode || registration?.code,
  );
  if (explicitCode) return explicitCode;

  const statusCode = normalizeRegistryStatus(registration?.status);
  if (
    REGISTRY_TEMPORARY_ERROR_CODES.has(statusCode)
    || REGISTRY_TERMINAL_ERROR_CODES.has(statusCode)
  ) {
    return statusCode;
  }
  return '';
};
const isRegistryTerminalFailure = (registration) =>
  REGISTRY_TERMINAL_ERROR_CODES.has(registryErrorCode(registration));
const registryFailureMessage = (code, fallback = '') => {
  switch (normalizeRegistryStatus(code)) {
    case 'TRANSACTION_FAILED':
      return 'We could not complete investor registration. Please try again.';
    case 'INVALID_REGISTRY_CONTRACT':
      return 'Investor registration could not be completed. Please try again or contact support if the issue continues.';
    case 'UNAUTHORIZED_TRANSACTION_SENDER':
      return 'Connect the approved organization account and try investor registration again.';
    case 'REGISTRY_PARAMETERS_MISMATCH':
      return 'Investor registration could not be completed. Refresh the application and try again.';
    case 'TRANSACTION_NOT_FOUND':
    case 'INSUFFICIENT_CONFIRMATIONS':
    case 'RPC_UNAVAILABLE':
    case 'SYNCING':
      return REGISTRY_PENDING_MESSAGE;
    default:
      return String(fallback || '').trim();
  }
};
const registryVerificationMessage = (registration) => registryFailureMessage(
  registryErrorCode(registration),
  registration?.verificationMessage || registration?.errorMessage || registration?.message,
);
const hasRegistryVerificationFailure = (registration) =>
  hasRegistryTransaction(registration) && isRegistryTerminalFailure(registration);

const registryErrorDetails = (error) =>
  error?.response?.data?.error
  || error?.response?.data?.data?.error
  || {};

const registryErrorCodeFromError = (error) => normalizeRegistryStatus(
  registryErrorDetails(error)?.code
    || error?.response?.data?.errorCode
    || error?.response?.data?.code,
);
const isRegistryVerificationError = (error) => {
  const code = registryErrorCodeFromError(error);
  return error?.response?.status === 422
    || REGISTRY_TEMPORARY_ERROR_CODES.has(code)
    || REGISTRY_TERMINAL_ERROR_CODES.has(code);
};

const friendlyRegistryError = (error) => {
  const code = registryErrorCodeFromError(error);
  const codedMessage = registryFailureMessage(
    code,
    registryErrorDetails(error)?.message || error?.response?.data?.message,
  );
  if (codedMessage) return codedMessage;

  const status = error?.response?.status;
  if (status === 403) return 'You do not have permission to approve this investor.';
  if (status === 409) return registryErrorCodeFromError(error) === 'ISSUER_CLAIMS_NOT_VERIFIED'
    ? 'All required issuer claims must be signed and verified before registration.'
    : 'This application is not ready for registry registration. Refresh and try again.';
  if (status === 422) return REGISTRY_PENDING_MESSAGE;
  if (status === 503 || error?.code === 'ERR_NETWORK') {
    return 'Investor registration is taking a little longer than usual. We will keep checking automatically.';
  }
  return 'Unable to complete investor registration right now. Please try again.';
};


export default function IssuerInvestorSubscriptionReviewPage() {
  const { requestId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const selectedChainId = useNetworkStore((state) => state.getActiveChainId(user));
  const [request, setRequest] = useState(null);
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [downloadingDocumentUid, setDownloadingDocumentUid] = useState('');
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [decisionModal, setDecisionModal] = useState(null);
  const [decisionLoading, setDecisionLoading] = useState(false);
  const [contactSupportOpen, setContactSupportOpen] = useState(false);
  const [registryRegistration, setRegistryRegistration] = useState(null);
  const [registryStatusLoading, setRegistryStatusLoading] = useState(false);
  const [registryActionLoading, setRegistryActionLoading] = useState(false);
  const [registryMessage, setRegistryMessage] = useState('');
  const [, setRegistryConfirmationProgress] = useState({
    txHash: '',
    current: 0,
  });
  const registryPollTimeoutRef = useRef(null);
  const registryActionInFlightRef = useRef(false);
  const wallet = useWalletConnection(request?.chainId || registryRegistration?.chainId);
  const {
    organization,
    isLoading: organizationLoading,
    isFetching: organizationFetching,
    refresh: refreshOrganization,
  } = useOrganization();

  useDocumentTitle(request ? `${request.investorName} · Investment Request` : 'Investment Request');

  const loadData = useCallback(async ({ silent = false } = {}) => {
    if (!requestId) return null;
    if (!silent) {
      setLoading(true);
      setRegistryRegistration(null);
      setRegistryMessage('');
    }
    else setRefreshing(true);

    const [requestResult, historyResult] = await Promise.allSettled([
      issuerInvestorSubscriptionsService.getRequest(requestId),
      issuerInvestorSubscriptionsService.getRequestHistory(requestId),
    ]);

    if (requestResult.status === 'fulfilled') setRequest(requestResult.value || null);
    else if (!silent) {
      setRequest(null);
      toast.error(getErrorMessage(requestResult.reason, 'Unable to load this investment request.'));
    }

    if (historyResult.status === 'fulfilled') setHistory(historyResult.value || null);
    else if (!silent) {
      setHistory({ interestUid: requestId, summary: {}, timeline: [] });
      toast.error(getErrorMessage(historyResult.reason, 'Unable to load the application activity history.'));
    }

    if (!silent) setLoading(false);
    else setRefreshing(false);

    return {
      request: requestResult.status === 'fulfilled' ? requestResult.value : null,
      history: historyResult.status === 'fulfilled' ? historyResult.value : null,
    };
  }, [requestId, selectedChainId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const requestStatus = String(request?.status || '').toLowerCase();
  const historyHasClaimSubmitted = Boolean(history?.timeline?.some((event) => isClaimSubmittedStatus(event?.eventType)));
  const claimSubmitted = isClaimSubmittedStatus(request?.status)
    || isClaimSubmittedStatus(history?.status)
    || isClaimSubmittedStatus(history?.summary?.status)
    || historyHasClaimSubmitted;
  const issuerVerified = request?.issuerVerificationConfirmed === true || isClaimVerifiedStatus(request?.status) || claimSubmitted
    || ['registered', 'approved'].includes(normalizeStatus(request?.status));
  const claimVerified = !claimSubmitted && issuerVerified;
  const registryInterestUid = request?.interestUid || requestId;
  const organizationWalletAddress = String(organization?.walletAddress || '').trim();
  const organizationWalletIsAvailable = isAddress(organizationWalletAddress, { strict: false });
  const connectedWalletIsOrganizationWallet = Boolean(
    organizationWalletIsAvailable
      && wallet.isConnected
      && Boolean(wallet.connector)
      && isAddress(wallet.address || '', { strict: false })
      && getAddress(wallet.address) === getAddress(organizationWalletAddress),
  );
  const registryWalletGateMessage = organizationLoading
    ? 'Checking your approved organization account…'
    : !organizationWalletIsAvailable
      ? 'We could not verify the approved organization account. Refresh your organization details before continuing.'
      : !wallet.isConnected
        ? 'Connect the approved organization account to complete investor registration.'
        : !connectedWalletIsOrganizationWallet
          ? 'The connected account is not the approved organization account. Switch accounts to continue.'
          : '';

  const openOrganizationWalletControl = useCallback(async () => {
    if (wallet.isConnected && !connectedWalletIsOrganizationWallet) {
      try {
        await wallet.disconnect();
      } catch (error) {
        toast.error(getErrorMessage(error, 'Unable to change accounts right now. Please try again.'));
        return;
      }
    }

    window.dispatchEvent(new CustomEvent('trex:open-wallet-control', {
      detail: { context: 'organization' },
    }));
  }, [connectedWalletIsOrganizationWallet, wallet]);

  const handleRefreshOrganizationWallet = useCallback(async () => {
    try {
      await refreshOrganization();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Unable to refresh the organization details right now. Please try again.'));
    }
  }, [refreshOrganization]);

  const getRecoveredRegistryRegistration = useCallback((interestUid, baseRegistration = null) => {
    const recovery = issuerRegistryRecoveryStore.getForUser(user, interestUid);
    if (!recovery) return baseRegistration;

    return {
      ...(baseRegistration || {}),
      registryOperationId: baseRegistration?.registryOperationId || recovery.registryOperationId,
      chainId: Number(baseRegistration?.chainId) || recovery.chainId,
      txHash: recovery.txHash,
      status: 'PENDING',
      confirmationRetryNeeded: true,
    };
  }, [user]);

  const reconcileRegistryRecovery = useCallback(async (interestUid, serverRegistration = null) => {
    const recovery = issuerRegistryRecoveryStore.getForUser(user, interestUid);
    if (!recovery) return serverRegistration;

    if (isRegistryConfirmed(serverRegistration)) {
      issuerRegistryRecoveryStore.removeForUser(user, interestUid, recovery.txHash);
      return serverRegistration;
    }

    if (isRegistryTerminalFailure(serverRegistration)) {
      issuerRegistryRecoveryStore.removeForUser(user, interestUid, recovery.txHash);
      return serverRegistration;
    }

    if (hasRegistryTransaction(serverRegistration)) {
      // Once the API exposes a transaction hash, it has the durable pointer needed to
      // continue verification. Never replace it with an older browser recovery hash.
      issuerRegistryRecoveryStore.removeForUser(user, interestUid, recovery.txHash);
      return serverRegistration;
    }

    try {
      const result = await issuerInvestorSubscriptionsService.confirmRegistryRegistration(
        interestUid,
        serverRegistration?.registryOperationId || recovery.registryOperationId,
        recovery.txHash,
      );
      // A 200/202 response means the API accepted the exact hash. PENDING is a normal
      // verification state, so MetaMask must not be opened again.
      issuerRegistryRecoveryStore.removeForUser(user, interestUid, recovery.txHash);
      return {
        ...(serverRegistration || {}),
        registryOperationId: serverRegistration?.registryOperationId || recovery.registryOperationId,
        chainId: Number(serverRegistration?.chainId) || recovery.chainId,
        txHash: recovery.txHash,
        ...(result || {}),
        confirmationRetryNeeded: false,
        verificationMessage: '',
      };
    } catch (error) {
      if (error?.response?.status === 403) {
        issuerRegistryRecoveryStore.removeForUser(user, interestUid, recovery.txHash);
        return serverRegistration;
      }

      if (isRegistryVerificationError(error)) {
        const errorCode = registryErrorCodeFromError(error) || 'REGISTRATION_VERIFICATION_FAILED';
        // Keep the exact signed hash. Temporary verification failures continue using
        // Keep using the same submitted approval while automatic status checks continue.
        // Only a terminal failure exposes the explicit retry action.
        return {
          ...(serverRegistration || {}),
          registryOperationId: serverRegistration?.registryOperationId || recovery.registryOperationId,
          chainId: Number(serverRegistration?.chainId) || recovery.chainId,
          txHash: recovery.txHash,
          status: 'PENDING',
          confirmationRetryNeeded: false,
          errorCode,
          verificationMessage: friendlyRegistryError(error),
        };
      }

      // Keep the signed hash locally for 503/network failures. The same Confirm request
      // is retried after reload, sign-in, or when connectivity returns.
      return getRecoveredRegistryRegistration(interestUid, serverRegistration);
    }
  }, [getRecoveredRegistryRegistration, user]);


  const stopRegistryPolling = useCallback(() => {
    if (registryPollTimeoutRef.current) {
      window.clearTimeout(registryPollTimeoutRef.current);
      registryPollTimeoutRef.current = null;
    }
  }, []);

  const startRegistryPolling = useCallback((interestUid, initialRegistration = null) => {
    stopRegistryPolling();
    let activeRegistration = initialRegistration;

    const poll = async () => {
      try {
        const serverLatest = await issuerInvestorSubscriptionsService.getRegistryRegistration(interestUid);
        const latest = await reconcileRegistryRecovery(interestUid, serverLatest);
        activeRegistration = latest
          ? { ...(activeRegistration || {}), ...latest }
          : activeRegistration;
        setRegistryRegistration(activeRegistration || null);

        if (isRegistryConfirmed(activeRegistration)) {
          if (hasRegistryTransaction(activeRegistration)) {
            setRegistryConfirmationProgress({
              txHash: activeRegistration.txHash,
              current: REGISTRY_REQUIRED_CONFIRMATIONS,
            });
          }
          setRegistryMessage(REGISTRY_SUCCESS_MESSAGE);
          toast.success('Investor access enabled.');
          await loadData({ silent: true });
          return;
        }

        if (isRegistryTerminalFailure(activeRegistration)) {
          setRegistryMessage(
            registryVerificationMessage(activeRegistration)
              || 'Investor registration could not be completed. Please try again.',
          );
          return;
        }
      } catch {
        const recovered = getRecoveredRegistryRegistration(interestUid, activeRegistration);
        if (recovered) {
          activeRegistration = recovered;
          setRegistryRegistration(recovered);
        }
        // Keep the current pending state. A locally recovered hash is retried below.
      }

      if (hasRegistryTransaction(activeRegistration) && activeRegistration?.confirmationRetryNeeded) {
        try {
          const result = await issuerInvestorSubscriptionsService.confirmRegistryRegistration(
            interestUid,
            activeRegistration.registryOperationId,
            activeRegistration.txHash,
          );
          issuerRegistryRecoveryStore.removeForUser(
            user,
            interestUid,
            activeRegistration.txHash,
          );
          activeRegistration = {
            ...activeRegistration,
            ...(result || {}),
            confirmationRetryNeeded: false,
            verificationMessage: '',
          };
          if (!isRegistryConfirmed(activeRegistration) && !result?.errorCode) {
            delete activeRegistration.errorCode;
            delete activeRegistration.errorMessage;
          }
          setRegistryRegistration(activeRegistration);

          if (isRegistryConfirmed(activeRegistration)) {
            setRegistryConfirmationProgress({
              txHash: activeRegistration.txHash,
              current: REGISTRY_REQUIRED_CONFIRMATIONS,
            });
            setRegistryMessage(REGISTRY_SUCCESS_MESSAGE);
            toast.success('Investor access enabled.');
            await loadData({ silent: true });
            return;
          }

          if (isRegistryTerminalFailure(activeRegistration)) {
            setRegistryMessage(
              registryVerificationMessage(activeRegistration)
                || 'Investor registration could not be completed. Please try again.',
            );
            return;
          }
        } catch (confirmError) {
          if (isRegistryVerificationError(confirmError)) {
            const verificationMessage = friendlyRegistryError(confirmError);
            const errorCode = registryErrorCodeFromError(confirmError)
              || 'REGISTRATION_VERIFICATION_FAILED';
            activeRegistration = {
              ...activeRegistration,
              status: 'PENDING',
              confirmationRetryNeeded: false,
              errorCode,
              verificationMessage,
            };
            setRegistryRegistration(activeRegistration);
            setRegistryMessage(verificationMessage);
            if (isRegistryTerminalFailure(activeRegistration)) {
              issuerRegistryRecoveryStore.removeForUser(
                user,
                interestUid,
                activeRegistration.txHash,
              );
              return;
            }
          }
          // 503/network errors retain confirmationRetryNeeded so the next controlled
          // poll retries Confirm with this exact transaction hash.
        }
      }

      if (hasRegistryTransaction(activeRegistration)) {
        setRegistryMessage(
          registryVerificationMessage(activeRegistration) || REGISTRY_PENDING_MESSAGE,
        );
        try {
          const progress = await getIssuerRegistryTransactionConfirmationProgress({
            chainId: activeRegistration.chainId,
            txHash: activeRegistration.txHash,
            requiredConfirmations: REGISTRY_REQUIRED_CONFIRMATIONS,
          });
          setRegistryConfirmationProgress({
            txHash: activeRegistration.txHash,
            current: progress.current,
          });
          // The progress bar is informational. Final completion remains API-authoritative,
          // so keep polling GET even after the visual 12-confirmation target reaches 100%.
        } catch {
          // Preserve the last known block confirmation count and retry. Block time and RPC
          // availability are variable, so progress is never estimated from elapsed time.
        }
      }

      registryPollTimeoutRef.current = window.setTimeout(
        poll,
        REGISTRY_STATUS_POLL_INTERVAL_MS,
      );
    };

    void poll();
  }, [
    getRecoveredRegistryRegistration,
    loadData,
    reconcileRegistryRecovery,
    stopRegistryPolling,
    user,
  ]);


  const loadRegistryRegistration = useCallback(async ({ silent = false } = {}) => {
    if (!issuerVerified || !registryInterestUid) return null;
    if (!silent) setRegistryStatusLoading(true);

    const recoveredRegistration = getRecoveredRegistryRegistration(registryInterestUid);
    if (recoveredRegistration) {
      setRegistryRegistration(recoveredRegistration);
      setRegistryMessage(REGISTRY_PENDING_MESSAGE);
    }

    try {
      const backendLatest = await issuerInvestorSubscriptionsService.getRegistryRegistration(
        registryInterestUid,
      );
      const latest = await reconcileRegistryRecovery(registryInterestUid, backendLatest);
      setRegistryRegistration(latest || null);
      if (isRegistryConfirmed(latest)) {
        stopRegistryPolling();
        if (hasRegistryTransaction(latest)) {
          setRegistryConfirmationProgress({
            txHash: latest.txHash,
            current: REGISTRY_REQUIRED_CONFIRMATIONS,
          });
        }
        setRegistryMessage(REGISTRY_SUCCESS_MESSAGE);
      } else if (isRegistryTerminalFailure(latest)) {
        stopRegistryPolling();
        setRegistryMessage(
          registryVerificationMessage(latest)
            || 'Investor registration could not be completed. Please try again.',
        );
        return latest;
      } else if (hasRegistryTransaction(latest)) {
        // A hash returned by GET belongs to the existing operation. Retry Confirm once
        // on page load so older failed production operations can be reconciled after a
        // server-side fix without asking the issuer to register the investor again.
        let resumed = latest;
        try {
          const result = await issuerInvestorSubscriptionsService.confirmRegistryRegistration(
            registryInterestUid,
            latest.registryOperationId,
            latest.txHash,
          );
          resumed = { ...latest, ...(result || {}) };
          setRegistryRegistration(resumed);
          if (isRegistryConfirmed(resumed)) {
            stopRegistryPolling();
            setRegistryConfirmationProgress({
              txHash: resumed.txHash,
              current: REGISTRY_REQUIRED_CONFIRMATIONS,
            });
            setRegistryMessage(REGISTRY_SUCCESS_MESSAGE);
            await loadData({ silent: true });
            return resumed;
          }
          if (isRegistryTerminalFailure(resumed)) {
            stopRegistryPolling();
            setRegistryMessage(
              registryVerificationMessage(resumed)
                || 'Investor registration could not be completed. Please try again.',
            );
            return resumed;
          }
        } catch (confirmError) {
          if (isRegistryVerificationError(confirmError)) {
            const errorCode = registryErrorCodeFromError(confirmError)
              || 'REGISTRATION_VERIFICATION_FAILED';
            resumed = {
              ...latest,
              status: 'PENDING',
              errorCode,
              verificationMessage: friendlyRegistryError(confirmError),
            };
            setRegistryRegistration(resumed);
            setRegistryMessage(resumed.verificationMessage);
            if (isRegistryTerminalFailure(resumed)) {
              issuerRegistryRecoveryStore.removeForUser(
                user,
                registryInterestUid,
                resumed.txHash,
              );
              stopRegistryPolling();
              return resumed;
            }
            startRegistryPolling(registryInterestUid, resumed);
            return resumed;
          }
          // 503/network errors keep the same hash pending and schedule Confirm retry
          // with this exact hash. MetaMask is never opened again for this operation.
          if (confirmError?.response?.status === 503 || confirmError?.code === 'ERR_NETWORK') {
            resumed = { ...latest, confirmationRetryNeeded: true };
            setRegistryRegistration(resumed);
          }
        }
        setRegistryMessage(
          registryVerificationMessage(resumed) || REGISTRY_PENDING_MESSAGE,
        );
        startRegistryPolling(registryInterestUid, resumed);
      } else {
        setRegistryMessage('');
      }
      return latest;
    } catch (error) {
      if (recoveredRegistration) {
        setRegistryRegistration(recoveredRegistration);
        setRegistryMessage(REGISTRY_PENDING_MESSAGE);
        startRegistryPolling(registryInterestUid, recoveredRegistration);
        return recoveredRegistration;
      }

      if (error?.response?.status === 404) {
        setRegistryRegistration(null);
        setRegistryConfirmationProgress({ txHash: '', current: 0 });
        setRegistryMessage('');
        return null;
      }
      if (!silent) setRegistryMessage(friendlyRegistryError(error));
      return null;
    } finally {
      if (!silent) setRegistryStatusLoading(false);
    }
  }, [
    issuerVerified,
    getRecoveredRegistryRegistration,
    loadData,
    reconcileRegistryRecovery,
    registryInterestUid,
    startRegistryPolling,
    stopRegistryPolling,
  ]);

  useEffect(() => {
    if (!issuerVerified || !registryInterestUid) {
      stopRegistryPolling();
      return undefined;
    }

    void loadRegistryRegistration();
    return stopRegistryPolling;
  }, [issuerVerified, loadRegistryRegistration, registryInterestUid, stopRegistryPolling]);

  // When the issuer has finished registration, poll application state only.
  // Never open another wallet popup or resend a confirmed transaction.
  useEffect(() => {
    if (!issuerVerified || !(request?.registryRegistrationConfirmed === true || isRegistryConfirmed(registryRegistration))
      || request?.canInvest === true || normalizeStatus(request?.status) === 'registered') return undefined;
    const timer = window.setInterval(() => { void loadData({ silent: true }); }, 15_000);
    return () => window.clearInterval(timer);
  }, [issuerVerified, request?.registryRegistrationConfirmed, registryRegistration, request?.canInvest, request?.status, loadData]);

  const topics = useMemo(() => request?.eligibility?.topics || [], [request]);
  const requiredClaimTopics = useMemo(() => {
    const tokenTopics = request?.token?.requiredClaimTopics;
    return Array.isArray(tokenTopics) && tokenTopics.length ? tokenTopics : topics;
  }, [request, topics]);

  const fetchDocumentBlob = useCallback(async (document) => {
    if (!document?.documentUid) throw new Error('This submission document does not include a download identifier.');
    return issuerInvestorSubscriptionsService.downloadDocument(request?.interestUid || requestId, document.documentUid);
  }, [request?.interestUid, requestId]);

  const handleDownload = async (document) => {
    setDownloadingDocumentUid(document.documentUid);
    try {
      const result = await fetchDocumentBlob(document);
      const url = URL.createObjectURL(result.blob);
      const link = window.document.createElement('a');
      link.href = url;
      link.download = filenameFromDisposition(
        result.contentDisposition,
        document.originalFileName || document.file || document.name || 'investor-document',
      );
      window.document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Unable to download this submission document.'));
    } finally {
      setDownloadingDocumentUid('');
    }
  };

  const handleReject = async (payload) => {
    setDecisionLoading(true);
    try {
      await issuerInvestorSubscriptionsService.rejectRequest(request.interestUid || requestId, payload);
      await loadData({ silent: true });
      setDecisionModal(null);
      toast.success('Investment application rejected and the decision was added to its activity history.');
    } catch (error) {
      if (error?.response?.status === 409) await loadData({ silent: true });
      toast.error(getErrorMessage(error, 'Unable to reject this investment application.'));
    } finally {
      setDecisionLoading(false);
    }
  };


  const handleClaimsVerified = async () => {
    await loadData({ silent: true });
    toast.success('Investor verification approved successfully.');
  };

  const confirmRegistryTransaction = async (registration) => {
    if (!hasRegistryTransaction(registration)) {
      throw new Error('Investor registration is still being completed. Please wait a moment.');
    }

    // Preserve a known hash before Confirm as well as immediately after MetaMask. This
    // covers existing operations loaded from the API and guarantees 503/reload recovery
    // can retry only this exact hash without broadcasting a second registration.
    try {
      issuerRegistryRecoveryStore.upsert({
        user,
        interestUid: registryInterestUid,
        registryOperationId: registration.registryOperationId,
        txHash: registration.txHash,
        chainId: registration.chainId,
      });
    } catch {
      // Recovery storage is best-effort; the API may already hold the hash.
    }

    const result = await issuerInvestorSubscriptionsService.confirmRegistryRegistration(
      registryInterestUid,
      registration.registryOperationId,
      registration.txHash,
    );
    // A successful 200/202 response means the API accepted this exact hash. The
    // operation may still be PENDING while verification/confirmations complete.
    issuerRegistryRecoveryStore.removeForUser(user, registryInterestUid, registration.txHash);
    const nextRegistration = { ...registration, ...(result || {}) };
    nextRegistration.confirmationRetryNeeded = false;
    nextRegistration.verificationMessage = '';
    if (!isRegistryConfirmed(nextRegistration) && !result?.errorCode) {
      delete nextRegistration.errorCode;
      delete nextRegistration.errorMessage;
    }
    setRegistryRegistration(nextRegistration);

    if (isRegistryConfirmed(nextRegistration)) {
      stopRegistryPolling();
      setRegistryConfirmationProgress({
        txHash: nextRegistration.txHash,
        current: REGISTRY_REQUIRED_CONFIRMATIONS,
      });
      setRegistryMessage(REGISTRY_SUCCESS_MESSAGE);
      toast.success('Investor access enabled.');
      await loadData({ silent: true });
      return nextRegistration;
    }

    if (isRegistryTerminalFailure(nextRegistration)) {
      stopRegistryPolling();
      setRegistryMessage(
        registryVerificationMessage(nextRegistration)
          || 'Investor registration could not be completed. Please try again.',
      );
      return nextRegistration;
    }

    setRegistryMessage(
      registryVerificationMessage(nextRegistration) || REGISTRY_PENDING_MESSAGE,
    );
    startRegistryPolling(registryInterestUid, nextRegistration);
    return nextRegistration;
  };

  const handleInviteToPurchase = () => setContactSupportOpen(true);

  const handleRegistryRetry = async () => {
    if (!registryInterestUid || registryActionInFlightRef.current) return;
    registryActionInFlightRef.current = true;
    setRegistryActionLoading(true);
    setRegistryMessage('');

    let retryRegistration = registryRegistration;
    let broadcastHash = '';
    let recoveryStorageError = null;

    try {
      // Re-read the existing operation instead of creating/preparing another one. These
      // server values are authoritative for the retry's registry, investor, ONCHAINID,
      // country, chain and registryOperationId.
      const serverLatest = await issuerInvestorSubscriptionsService.getRegistryRegistration(
        registryInterestUid,
      );
      retryRegistration = {
        ...(registryRegistration || {}),
        ...(serverLatest || {}),
      };
      setRegistryRegistration(retryRegistration || null);

      if (isRegistryConfirmed(retryRegistration)) {
        stopRegistryPolling();
        setRegistryMessage(REGISTRY_SUCCESS_MESSAGE);
        toast.success('Investor access enabled.');
        await loadData({ silent: true });
        return;
      }

      // A retry transaction is allowed only for a terminal verification failure. If the
      // backend moved back to a temporary state, keep the existing hash and use polling.
      if (!isRegistryTerminalFailure(retryRegistration)) {
        const message = registryVerificationMessage(retryRegistration) || REGISTRY_PENDING_MESSAGE;
        setRegistryMessage(message);
        if (hasRegistryTransaction(retryRegistration)) {
          startRegistryPolling(registryInterestUid, retryRegistration);
        }
        return;
      }

      if (!retryRegistration?.registryOperationId) {
        throw new Error('We could not resume investor registration. Refresh and try again.');
      }
      if (!organizationWalletIsAvailable) {
        throw new Error('We could not verify the approved organization account. Refresh your organization details before continuing.');
      }
      if (!wallet.isConnected || !wallet.connector || !wallet.address) {
        throw new Error('Connect the approved organization account and try investor registration again.');
      }
      if (!connectedWalletIsOrganizationWallet) {
        throw new Error('The connected account is not the approved organization account. Switch accounts and try investor registration again.');
      }

      const retryChainId = Number(retryRegistration?.chainId);
      const supportedRetryChain = wallet.supportedChains.some(
        (chain) => chain.id === retryChainId,
      );
      if (!Number.isSafeInteger(retryChainId) || !supportedRetryChain) {
        throw new Error('Investor registration is using a network that is not available in the application.');
      }
      if (wallet.chainId !== retryChainId) {
        await wallet.switchChain(retryChainId);
      }

      // submitIssuerRegistryRegistrationTransaction estimates registerIdentity gas from
      // these exact operation values, adds a 20% buffer, then asks MetaMask to broadcast
      // a completely new transaction.
      broadcastHash = await submitIssuerRegistryRegistrationTransaction({
        connector: wallet.connector,
        connectedAddress: wallet.address,
        organizationWalletAddress,
        preparedRegistration: retryRegistration,
      });

      const submittedRegistration = {
        ...retryRegistration,
        txHash: broadcastHash,
        status: 'PENDING',
        confirmationRetryNeeded: false,
        errorCode: '',
        errorMessage: '',
        verificationMessage: '',
      };
      setRegistryRegistration(submittedRegistration);
      setRegistryConfirmationProgress({ txHash: broadcastHash, current: 0 });
      setRegistryMessage(REGISTRY_PENDING_MESSAGE);

      try {
        issuerRegistryRecoveryStore.upsert({
          user,
          interestUid: registryInterestUid,
          registryOperationId: submittedRegistration.registryOperationId,
          txHash: submittedRegistration.txHash,
          chainId: submittedRegistration.chainId,
        });
      } catch (storageError) {
        recoveryStorageError = storageError;
      }

      // Reuse the same operation and the same Confirm endpoint, but send the new hash.
      await confirmRegistryTransaction(submittedRegistration);
    } catch (error) {
      if (isRegistryVerificationError(error) && broadcastHash) {
        const errorCode = registryErrorCodeFromError(error) || 'REGISTRATION_VERIFICATION_FAILED';
        const verificationMessage = friendlyRegistryError(error);
        const failedRegistration = {
          ...(retryRegistration || {}),
          txHash: broadcastHash,
          status: 'PENDING',
          confirmationRetryNeeded: false,
          errorCode,
          verificationMessage,
        };
        setRegistryRegistration(failedRegistration);
        setRegistryMessage(verificationMessage);

        if (isRegistryTerminalFailure(failedRegistration)) {
          issuerRegistryRecoveryStore.removeForUser(
            user,
            registryInterestUid,
            broadcastHash,
          );
          stopRegistryPolling();
          toast.error(verificationMessage);
        } else {
          startRegistryPolling(registryInterestUid, failedRegistration);
          toast.info(verificationMessage);
        }
        return;
      }

      if (broadcastHash) {
        const pendingRegistration = {
          ...(retryRegistration || {}),
          txHash: broadcastHash,
          status: 'PENDING',
          confirmationRetryNeeded: error?.response?.status === 503 || error?.code === 'ERR_NETWORK',
          errorCode: '',
          errorMessage: '',
          verificationMessage: '',
        };
        setRegistryRegistration(pendingRegistration);
        setRegistryMessage(REGISTRY_PENDING_MESSAGE);
        startRegistryPolling(registryInterestUid, pendingRegistration);
        if (recoveryStorageError) {
          toast.warning('Investor registration is still being completed. Please keep this page open for a moment.');
        } else if (error?.response?.status === 503 || error?.code === 'ERR_NETWORK') {
          toast.info('Investor registration is being completed. No further action is needed.');
        }
        return;
      }

      if (isIssuerRegistryWalletRejection(error)) {
        setRegistryMessage('Investor registration was cancelled. You can try again when ready.');
        return;
      }

      const message = error?.response ? friendlyRegistryError(error) : getErrorMessage(
        error,
        'Unable to retry investor registration right now. Please try again.',
      );
      setRegistryMessage(message);
      toast.error('Investor registration could not be completed', { description: message });
    } finally {
      setRegistryActionLoading(false);
      registryActionInFlightRef.current = false;
    }
  };

  const handleRegistryAction = async () => {
    if (!registryInterestUid || registryActionInFlightRef.current) return 'PENDING';
    registryActionInFlightRef.current = true;
    setRegistryActionLoading(true);
    setRegistryMessage('');
    let broadcastHash = '';
    let recoveryStorageError = null;
    let preparedRegistration = registryRegistration;

    try {
      if (isRegistryConfirmed(preparedRegistration)) return 'CONFIRMED';

      if (isRegistryTerminalFailure(preparedRegistration)) {
        setRegistryMessage(
          registryVerificationMessage(preparedRegistration)
            || 'Investor registration could not be completed. Please try again.',
        );
        return 'FAILED';
      }

      // Any existing hash belongs to the current operation. Confirm that same hash or
      // poll its status for temporary verification states. Terminal verification failures
      // are handled only by the explicit final-approval retry action above.
      if (hasRegistryTransaction(preparedRegistration)) {
        const result = await confirmRegistryTransaction(preparedRegistration);
        return isRegistryConfirmed(result) ? 'CONFIRMED' : 'PENDING';
      }

      // A new registry operation may only be prepared from the organization wallet
      // that was saved during issuer onboarding. This guard runs before the API call so
      // an account mismatch cannot create an operation the connected wallet should not sign.
      if (!organizationWalletIsAvailable) {
        throw new Error('We could not verify the approved organization account. Refresh your organization details before continuing.');
      }
      if (!wallet.isConnected || !wallet.connector || !wallet.address) {
        throw new Error('Connect the approved organization account to complete investor registration.');
      }
      if (!connectedWalletIsOrganizationWallet) {
        throw new Error('The connected account is not the approved organization account. Switch accounts to continue.');
      }

      // Prepare is idempotent. The API is authoritative for all registerIdentity args.
      // 201 PENDING or 200 PENDING without a hash may proceed to MetaMask.
      const preparedResult = await issuerInvestorSubscriptionsService.prepareRegistryRegistration(
        registryInterestUid,
      );
      preparedRegistration = preparedResult;
      setRegistryRegistration(preparedRegistration || null);

      // Create may return CONFIRMED when an existing registration was already reconciled.
      if (isRegistryConfirmed(preparedRegistration)) {
        stopRegistryPolling();
        setRegistryMessage(REGISTRY_SUCCESS_MESSAGE);
        toast.success('Investor registration confirmed.');
        await loadData({ silent: true });
        return 'CONFIRMED';
      }

      // 200 PENDING with a stored hash resumes the existing operation. Confirm the same
      // hash and never ask MetaMask to submit a duplicate registration transaction.
      if (hasRegistryTransaction(preparedRegistration)) {
        const result = await confirmRegistryTransaction(preparedRegistration);
        return isRegistryConfirmed(result) ? 'CONFIRMED' : 'PENDING';
      }

      if (preparedRegistration?.txHash && !hasRegistryTransaction(preparedRegistration)) {
        throw new Error('Investor registration is still being completed. Please wait a moment before trying again.');
      }

      const preparedChainId = Number(preparedRegistration?.chainId);
      const supportedPreparedChain = wallet.supportedChains.some(
        (chain) => chain.id === preparedChainId,
      );
      if (!Number.isSafeInteger(preparedChainId) || !supportedPreparedChain) {
        throw new Error('Investor registration is using a network that is not available in the application.');
      }
      // A prepared transaction is valid only for the currently selected application chain.
      if (useNetworkStore.getState().getActiveChainId(user) !== preparedChainId) {
        throw new Error('The selected network changed. Refresh the application before registering this investor.');
      }
      if (wallet.chainId !== preparedChainId) {
        await wallet.switchChain(preparedChainId);
      }

      if (useNetworkStore.getState().getActiveChainId(user) !== preparedChainId) {
        throw new Error('The selected network changed. Refresh the application before sending a registry transaction.');
      }

      // Use the API-provided Identity Registry address, investor wallet, ONCHAINID and
      // country exactly as prepared. Wallets may use delegated execution internally;
      // the frontend intentionally does not inspect or validate transaction.to.
      broadcastHash = await submitIssuerRegistryRegistrationTransaction({
        connector: wallet.connector,
        connectedAddress: wallet.address,
        organizationWalletAddress,
        preparedRegistration,
      });

      const submittedRegistration = {
        ...(preparedRegistration || {}),
        txHash: broadcastHash,
        status: 'PENDING',
      };
      setRegistryRegistration(submittedRegistration);
      setRegistryMessage(REGISTRY_PENDING_MESSAGE);

      // Save the hash before the Confirm request. If confirmation is temporarily
      // unavailable, later page loads/sign-ins retry Confirm with this exact hash only.
      try {
        issuerRegistryRecoveryStore.upsert({
          user,
          interestUid: registryInterestUid,
          registryOperationId: submittedRegistration.registryOperationId,
          txHash: submittedRegistration.txHash,
          chainId: submittedRegistration.chainId,
        });
      } catch (storageError) {
        recoveryStorageError = storageError;
      }

      // Confirm accepts only the unchanged MetaMask transaction hash. A 202/PENDING
      // response is normal and moves the UI into status polling without another wallet call.
      const result = await confirmRegistryTransaction(submittedRegistration);
      return isRegistryConfirmed(result) ? 'CONFIRMED' : 'PENDING';
    } catch (error) {
      if (isRegistryVerificationError(error)) {
        const txHash = broadcastHash || preparedRegistration?.txHash || registryRegistration?.txHash || '';
        const errorCode = registryErrorCodeFromError(error) || 'REGISTRATION_VERIFICATION_FAILED';
        const verificationMessage = friendlyRegistryError(error);
        const failedRegistration = {
          ...(registryRegistration || preparedRegistration || {}),
          ...(isValidTransactionHash(txHash) ? { txHash } : {}),
          status: 'PENDING',
          confirmationRetryNeeded: false,
          errorCode,
          verificationMessage,
        };
        setRegistryRegistration((current) => ({
          ...(current || preparedRegistration || {}),
          ...(isValidTransactionHash(txHash) ? { txHash } : {}),
          status: 'PENDING',
          confirmationRetryNeeded: false,
          errorCode,
          verificationMessage,
        }));
        setRegistryMessage(verificationMessage);
        if (isRegistryTerminalFailure(failedRegistration)) {
          issuerRegistryRecoveryStore.removeForUser(
            user,
            registryInterestUid,
            txHash,
          );
          stopRegistryPolling();
          toast.error(verificationMessage);
        } else {
          startRegistryPolling(registryInterestUid, failedRegistration);
          toast.info(verificationMessage);
        }
        // Never open MetaMask automatically after verification. Temporary failures keep
        // through automatic status checks; terminal failures require an explicit retry.
        return isRegistryTerminalFailure(failedRegistration) ? 'FAILED' : 'PENDING';
      }

      if (broadcastHash || hasRegistryTransaction(preparedRegistration)) {
        const pendingRegistration = {
          ...(preparedRegistration || {}),
          txHash: broadcastHash || preparedRegistration?.txHash,
          status: 'PENDING',
          confirmationRetryNeeded: error?.response?.status === 503 || error?.code === 'ERR_NETWORK',
        };
        setRegistryRegistration(pendingRegistration);
        setRegistryMessage(REGISTRY_PENDING_MESSAGE);
        startRegistryPolling(registryInterestUid, pendingRegistration);
        if (recoveryStorageError) {
          toast.warning('Investor registration is still being completed. Please keep this page open for a moment.');
        } else if (error?.response?.status === 503 || error?.code === 'ERR_NETWORK') {
          toast.info('Investor registration is being completed. No further action is needed.');
        }
        return 'PENDING';
      }

      if (isIssuerRegistryWalletRejection(error)) {
        setRegistryMessage('Investor registration was cancelled. You can try again when ready.');
        return 'CANCELLED';
      }

      const message = error?.response ? friendlyRegistryError(error) : getErrorMessage(
        error,
        'Unable to complete investor registration right now. Please try again.',
      );
      setRegistryMessage(message);
      toast.error('Investor registration could not be completed', { description: message });
      return 'FAILED';
    } finally {
      setRegistryActionLoading(false);
      registryActionInFlightRef.current = false;
    }
  };


  if (loading) {
    return <div className="page-stack issuer-investor-review-page issuer-application-activity-page"><div className="issuer-loading-shell" /><div className="issuer-loading-shell issuer-loading-shell--tall" /></div>;
  }

  if (!request) {
    return (
      <Card className="issuer-review-not-found">
        <h1>Request not found</h1>
        <p>The selected investment application could not be loaded or does not belong to this issuer.</p>
        <Button variant="secondary" icon={ArrowLeft} onClick={() => navigate(ROUTES.investors)}>Back to Requests</Button>
      </Card>
    );
  }

  const progress = readApplicationProgress(request, history?.summary, registryRegistration);
  const registryConfirmed = progress.registryRegistrationConfirmed === true || isRegistryConfirmed(registryRegistration);
  const applicationCompleted = isApplicationCompleted(progress, request.status);
  const historyUpdateCount = buildApplicationHistoryEntries(history?.timeline).length;
  const effectiveStatus = applicationCompleted ? 'registered' : claimSubmitted ? 'claimSubmitted' : request.status;
  const canReject = requestStatus === 'submitintrest';
  const canVerify = requestStatus === 'submitintrest';
  const journey = getInvestmentJourney({
    status: effectiveStatus,
    viewerRole: 'issuer',
    registryStatus: registryRegistration?.status,
    hasRegistryTransaction: hasRegistryTransaction(registryRegistration),
    registryNeedsAttention: hasRegistryVerificationFailure(registryRegistration),
    progress: { ...progress, registryRegistrationConfirmed: registryConfirmed },
  });
  const submissionNumber = request.submissionNumber || history?.timeline?.reduce((max, event) => Math.max(max, Number(event?.submissionNumber) || 0), 0) || null;
  const registryRetryRequired = isRegistryTerminalFailure(registryRegistration);
  const registryTransactionPending = hasRegistryTransaction(registryRegistration)
    && !isRegistryConfirmed(registryRegistration)
    && !registryRetryRequired;
  const supportContext = {
    name: request.investorName,
    email: request.email,
    userId: request.investorUserUid || request.investorUid,
    walletAddress: request.walletAddress || registryRegistration?.investorWalletAddress,
    onchainIdAddress: request.investorIdentityAddress || registryRegistration?.onchainIdentityAddress,
    tokenAddress: request.token?.tokenAddress,
    tokenName: [request.tokenName, request.tokenSymbol ? `(${request.tokenSymbol})` : ''].filter(Boolean).join(' '),
    applicationId: request.interestUid || request.requestReference || requestId,
    applicationStatus: effectiveStatus,
  };

  return (
    <div className="page-stack issuer-investor-review-page issuer-application-activity-page">
      <header className="issuer-application-activity-header">
        <div>
          <span className="eyebrow">Investor application</span>
          <h1>Investment request</h1>
          <p>Track {request.investorName}&apos;s request and complete the action shown below when it is your turn.</p>
        </div>
        <div className="issuer-application-activity-header__actions">
          <Button variant="secondary" icon={RefreshCw} loading={refreshing} onClick={() => void loadData({ silent: true })}>Refresh</Button>
        </div>
      </header>

      <InvestmentJourneyTracker journey={journey} />

      <Card className={`issuer-application-overview-card${claimVerified ? ' is-claim-verified' : ''}`}>
        <div className="issuer-application-overview-card__identity">
          <span>{request.investorName?.slice(0, 1).toUpperCase() || 'I'}</span>
          <div>
            <strong>{request.investorName}</strong>
            {request.investorCode && isAddress(request.investorCode, { strict: false }) ? (
              <CompactAddress
                value={request.investorCode}
                label="Investor wallet address"
                leading={5}
                trailing={5}
                className="issuer-application-overview-card__wallet"
              />
            ) : (
              <small>{request.investorCode || request.email || 'Investor application'}</small>
            )}
          </div>
        </div>
        <div className="issuer-application-overview-card__grid">
          <div><span>Request reference</span><strong>{request.interestUid || request.requestReference}</strong></div>
          <div><span>Asset</span><strong>{[request.tokenName, request.tokenSymbol ? `(${request.tokenSymbol})` : ''].filter(Boolean).join(' ') || '—'}</strong></div>
          <div><span>Submitted</span><strong>{formatDate(request.submittedAt || request.requestedDate, 'MMM DD, YYYY hh:mm A')}</strong></div>
          <div><span>Submission version</span><strong>{submissionNumber ? `Version ${submissionNumber}` : '—'}</strong></div>
          <div><span>Current status</span><AppStatusBadge status={effectiveStatus} label={journey.statusLabel} tone={journey.tone} compact /></div>
          <div><span>Changes submitted</span><strong>{history?.summary?.timesResubmitted ?? request?.resubmissionSummary?.timesResubmitted ?? 0}</strong></div>
        </div>
        {issuerVerified ? (
          <div className="issuer-application-overview-card__actions issuer-application-overview-card__actions--registry">
            {registryConfirmed ? (
              <div className="issuer-registry-success" role="status">
                <div className="issuer-registry-success__status">
                  <CheckCircle2 size={16} aria-hidden="true" />
                  <strong>{applicationCompleted ? 'Completed' : claimSubmitted ? 'Application finalizing' : 'Issuer steps complete — awaiting investor claims'}</strong>
                </div>
                <p>{applicationCompleted ? 'All required investor claims have been confirmed. The application is complete.' : claimSubmitted ? 'All required claim transactions are complete. The backend is finalizing the application; no issuer action is needed.' : REGISTRY_SUCCESS_MESSAGE}</p>
                {/*
                  Temporarily hidden via feature flag. The existing invite handler and
                  Contact Us dialog stay in place so the action can be restored safely.
                */}
                {applicationCompleted && featureFlags.contactSupportActions ? (
                  <div className="issuer-registry-invite">
                    <Button
                      type="button"
                      icon={Mail}
                      onClick={handleInviteToPurchase}
                      aria-haspopup="dialog"
                      aria-describedby="issuer-registry-invite-tooltip"
                      title={REGISTRY_INVITE_TOOLTIP}
                    >
                      Invite to Invest
                    </Button>
                    <span
                      id="issuer-registry-invite-tooltip"
                      className="issuer-registry-invite__tooltip"
                      role="tooltip"
                    >
                      {REGISTRY_INVITE_TOOLTIP}
                    </span>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="issuer-registry-action">
                <div className="issuer-registry-action__pending" role="status">
                  <strong>Registration Pending</strong>
                  <span>{registryTransactionPending
                    ? 'Your verification signature is complete. Registration is awaiting blockchain confirmation. Do not send the transaction again.'
                    : 'Your verification signature is complete, but the investor has not yet been registered. Please complete the registration to finish this step.'}</span>
                </div>
                {registryRetryRequired ? (
                  <>
                    <Button
                      type="button"
                      variant="primary"
                      icon={RefreshCw}
                      loading={registryStatusLoading || registryActionLoading}
                      disabled={organizationLoading || !connectedWalletIsOrganizationWallet}
                      onClick={() => void handleRegistryRetry()}
                    >
                      Retry Registration
                    </Button>
                    {!connectedWalletIsOrganizationWallet ? (
                      <div className="issuer-registry-wallet-gate" role="status">
                        <div className="issuer-registry-wallet-gate__message">
                          <WalletCards size={16} aria-hidden="true" />
                          <span>{registryWalletGateMessage || 'Connect the approved organization account and try investor registration again.'}</span>
                        </div>
                        {!organizationLoading ? (
                          organizationWalletIsAvailable ? (
                            <Button
                              type="button"
                              variant="secondary"
                              icon={WalletCards}
                              loading={wallet.isBusy}
                              onClick={() => void openOrganizationWalletControl()}
                            >
                              {wallet.isConnected ? 'Switch Account' : 'Connect Account'}
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              variant="secondary"
                              icon={RefreshCw}
                              loading={organizationFetching}
                              onClick={() => void handleRefreshOrganizationWallet()}
                            >
                              Refresh Organization Details
                            </Button>
                          )
                        ) : null}
                      </div>
                    ) : null}
                  </>
                ) : registryTransactionPending ? (
                  <div className="issuer-registry-processing" role="status" aria-live="polite">
                    <RefreshCw className="spinner" size={18} aria-hidden="true" />
                    <div>
                      <strong>Verifying Identity Registry registration</strong>
                      <span>Please wait a moment. No further action is needed.</span>
                    </div>
                  </div>
                ) : connectedWalletIsOrganizationWallet ? (
                  <Button
                    type="button"
                    variant="primary"
                    icon={UserPlus}
                    loading={registryStatusLoading || registryActionLoading}
                    onClick={() => void handleRegistryAction()}
                  >
                    Register Investor
                  </Button>
                ) : (
                  <div className="issuer-registry-wallet-gate" role="status">
                    <div className="issuer-registry-wallet-gate__message">
                      <WalletCards size={16} aria-hidden="true" />
                      <span>{registryWalletGateMessage}</span>
                    </div>
                    {!organizationLoading ? (
                      organizationWalletIsAvailable ? (
                        <Button
                          type="button"
                          variant="secondary"
                          icon={WalletCards}
                          loading={wallet.isBusy}
                          onClick={() => void openOrganizationWalletControl()}
                        >
                          {wallet.isConnected ? 'Switch Account' : 'Connect Account'}
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          variant="secondary"
                          icon={RefreshCw}
                          loading={organizationFetching}
                          onClick={() => void handleRefreshOrganizationWallet()}
                        >
                          Refresh Organization Details
                        </Button>
                      )
                    ) : null}
                  </div>
                )}
                {!registryTransactionPending && registryMessage ? (
                  <span className="issuer-registry-action__message" role="status">
                    {registryVerificationMessage(registryRegistration) || registryMessage}
                  </span>
                ) : null}
              </div>
            )}
          </div>
        ) : claimVerified ? (
          <div className="issuer-application-overview-card__waiting" role="status">
            <Clock3 size={18} />
            <div>
              <strong>Finish registration</strong>
              <span>Your claim signatures are verified. Complete the Identity Registry transaction in this same review step.</span>
            </div>
          </div>
        ) : (
          <div className="issuer-application-overview-card__review-action">
            <div className="issuer-application-overview-card__review-copy">
              <span>Your action</span>
              <strong>Review the investor&apos;s information and documents</strong>
              <p>Approve the request if everything looks correct. If something is missing or incorrect, ask for changes or decline it.</p>
            </div>
            <div className="issuer-application-overview-card__actions">
              <Button variant="danger" icon={XCircle} disabled={!canReject || decisionLoading} onClick={() => setDecisionModal('reject')}>Request changes or decline</Button>
              <Button icon={ShieldCheck} disabled={!canVerify || decisionLoading} onClick={() => setDecisionModal('verify')}>Approve &amp; Continue</Button>
            </div>
          </div>
        )}
      </Card>

      <section className="application-history-section issuer-application-history-section">
        <div className="application-history-section__heading">
          <div>
            <h2>Application details & documents</h2>
            <p>Review the investor&apos;s submitted information, documents, and any previous updates before making a decision.</p>
          </div>
          <span>{historyUpdateCount} update{historyUpdateCount === 1 ? '' : 's'}</span>
        </div>

        <ApplicationHistory
          timeline={history?.timeline || []}
          viewerRole="issuer"
          currentStatus={request.status}
          claimsConfirmed={progress.claimsConfirmed === true}
          applicationComplete={applicationCompleted}
          issuerVerificationConfirmed={issuerVerified}
          registryRegistrationConfirmed={registryConfirmed}
          onViewDocument={setSelectedDocument}
          onDownloadDocument={handleDownload}
          downloadingDocumentUid={downloadingDocumentUid}
          showDownload
          actorNames={{
            investor: request.investorName || 'Investor account',
            issuer: user?.name || user?.fullName || 'Issuer account',
            system: 'System',
          }}
          emptyTitle="No application updates yet"
          emptyDescription="The request is available, but there are no additional updates or document events to show yet."
        />
      </section>

      {selectedDocument ? (
        <SecureDocumentPreviewModal
          document={selectedDocument}
          onClose={() => setSelectedDocument(null)}
          fetchDocumentBlob={fetchDocumentBlob}
          loadingMessage="Retrieving the exact document version from this issuer-scoped submission snapshot."
        />
      ) : null}

      <RejectInterestModal
        open={decisionModal === 'reject'}
        onClose={() => setDecisionModal(null)}
        topics={topics}
        onConfirm={handleReject}
        loading={decisionLoading}
      />
      <VerifyIdentityClaimsModal
        open={decisionModal === 'verify'}
        onClose={() => setDecisionModal(null)}
        subscriptionId={request.subscriptionId || request.interestUid || request.requestReference || requestId}
        investorIdentityAddress={request.investorIdentityAddress}
        requiredClaimTopics={requiredClaimTopics}
        investorName={request.investorName}
        assetName={[request.tokenName, request.tokenSymbol ? `(${request.tokenSymbol})` : ''].filter(Boolean).join(' ')}
        chainId={request.chainId || request.token?.chainId}
        onVerified={handleClaimsVerified}
        onRegister={handleRegistryAction}
        registrationConfirmed={registryConfirmed}
        registrationPending={registryTransactionPending}
      />
      <ContactSupportDialog
        open={contactSupportOpen}
        onClose={() => setContactSupportOpen(false)}
        context={supportContext}
      />
    </div>
  );
}
