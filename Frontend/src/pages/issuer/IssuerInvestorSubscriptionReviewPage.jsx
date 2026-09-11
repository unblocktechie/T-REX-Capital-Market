import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Mail,
  RefreshCw,
  ShieldCheck,
  UserPlus,
  XCircle,
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { isAddress } from 'viem';
import { toast } from 'sonner';
import { ApplicationHistory } from '@/components/application-history/ApplicationHistory';
import { CompactAddress } from '@/components/common/CompactAddress';
import { SecureDocumentPreviewModal } from '@/components/common/SecureDocumentPreviewModal';
import { AppStatusBadge } from '@/components/common/AppStatusBadge';
import { RejectInterestModal, VerifyIdentityClaimsModal } from '@/components/issuer/IssuerInterestDecisionModals';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ROUTES } from '@/config/routes';
import { useAuth } from '@/hooks/useAuth';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
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

const normalizeStatus = (status) => String(status || '')
  .trim()
  .toLowerCase()
  .replace(/[\s_-]+/g, '');

const isClaimVerifiedStatus = (status) => ['verifiedbyissuer', 'verified'].includes(normalizeStatus(status));
const isClaimSubmittedStatus = (status) => normalizeStatus(status) === 'claimsubmitted';

const statusMeta = (status) => {
  const value = String(status || '').toLowerCase();
  if (isClaimSubmittedStatus(status)) return { label: 'Claims Submitted', tone: 'success' };
  if (isClaimVerifiedStatus(status)) return { label: 'Claim Verified', tone: 'success' };
  if (value === 'approved') return { label: 'Approved', tone: 'success' };
  if (value === 'rejected') return { label: 'Rejected', tone: 'danger' };
  if (value === 'cancelled') return { label: 'Cancelled', tone: 'neutral' };
  if (value === 'pending') return { label: 'Documents Required', tone: 'pending' };
  return { label: 'Pending Review', tone: 'pending' };
};

const filenameFromDisposition = (value, fallback) => {
  const match = String(value || '').match(/filename\*?=(?:UTF-8''|\")?([^\";]+)/i);
  if (!match?.[1]) return fallback;
  try { return decodeURIComponent(match[1].replace(/^\"|\"$/g, '')); } catch { return match[1].replace(/^\"|\"$/g, ''); }
};

const REGISTRY_STATUS_POLL_INTERVAL_MS = 5_000;
const REGISTRY_REQUIRED_CONFIRMATIONS = 12;
const REGISTRY_SUCCESS_MESSAGE = 'This investor is now eligible to purchase the token.';
const REGISTRY_PENDING_MESSAGE = 'Transaction is submitted. Finalizing your Registration .';
const REGISTRY_INVITE_TOOLTIP = 'Send the investor an email letting them know they can now purchase this token.';

const normalizeRegistryStatus = (status) => String(status || '').trim().toUpperCase();
const isRegistryConfirmed = (registration) => normalizeRegistryStatus(registration?.status) === 'CONFIRMED';
const hasRegistryTransaction = (registration) => isValidTransactionHash(registration?.txHash);
const canReplaceRegistryTransaction = (registration) =>
  hasRegistryTransaction(registration) && Boolean(registration?.errorCode);

const friendlyRegistryError = (error) => {
  const status = error?.response?.status;
  if (status === 403) return 'You do not have permission to complete this registration.';
  if (status === 409) return 'This application is not ready for registration yet. Refresh and try again.';
  if (status === 422) return 'We could not verify this registration. Check the status before trying again.';
  if (status === 503 || error?.code === 'ERR_NETWORK') {
    return 'The registration status is temporarily unavailable. Please try again in a few moments.';
  }
  return 'Unable to complete the registration right now. Please try again.';
};


export default function IssuerInvestorSubscriptionReviewPage() {
  const { requestId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [request, setRequest] = useState(null);
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [downloadingDocumentUid, setDownloadingDocumentUid] = useState('');
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [decisionModal, setDecisionModal] = useState(null);
  const [decisionLoading, setDecisionLoading] = useState(false);
  const [registryRegistration, setRegistryRegistration] = useState(null);
  const [registryStatusLoading, setRegistryStatusLoading] = useState(false);
  const [registryActionLoading, setRegistryActionLoading] = useState(false);
  const [registryMessage, setRegistryMessage] = useState('');
  const [registryConfirmationProgress, setRegistryConfirmationProgress] = useState({
    txHash: '',
    current: 0,
  });
  const registryPollTimeoutRef = useRef(null);
  const registryActionInFlightRef = useRef(false);
  const wallet = useWalletConnection();

  useDocumentTitle(request ? `${request.investorName} · Application Activity` : 'Application Activity');

  const loadData = useCallback(async ({ silent = false } = {}) => {
    if (!requestId) return null;
    if (!silent) setLoading(true);
    else setRefreshing(true);

    const [requestResult, historyResult] = await Promise.allSettled([
      issuerInvestorSubscriptionsService.getRequest(requestId),
      issuerInvestorSubscriptionsService.getRequestHistory(requestId),
    ]);

    if (requestResult.status === 'fulfilled') setRequest(requestResult.value || null);
    else {
      setRequest(null);
      toast.error(getErrorMessage(requestResult.reason, 'Unable to load this investment request.'));
    }

    if (historyResult.status === 'fulfilled') setHistory(historyResult.value || null);
    else {
      setHistory({ interestUid: requestId, summary: {}, timeline: [] });
      toast.error(getErrorMessage(historyResult.reason, 'Unable to load the application activity history.'));
    }

    if (!silent) setLoading(false);
    else setRefreshing(false);

    return {
      request: requestResult.status === 'fulfilled' ? requestResult.value : null,
      history: historyResult.status === 'fulfilled' ? historyResult.value : null,
    };
  }, [requestId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const requestStatus = String(request?.status || '').toLowerCase();
  const historyHasClaimSubmitted = Boolean(history?.timeline?.some((event) => isClaimSubmittedStatus(event?.eventType)));
  const claimSubmitted = isClaimSubmittedStatus(request?.status)
    || isClaimSubmittedStatus(history?.status)
    || isClaimSubmittedStatus(history?.summary?.status)
    || historyHasClaimSubmitted;
  const claimVerified = !claimSubmitted && isClaimVerifiedStatus(request?.status);
  const registryInterestUid = request?.interestUid || requestId;
  const registryTransactionHash = hasRegistryTransaction(registryRegistration)
    ? registryRegistration.txHash
    : '';
  const registryConfirmationCount = registryConfirmationProgress.txHash === registryTransactionHash
    ? registryConfirmationProgress.current
    : 0;
  const registryConfirmationsComplete = registryConfirmationCount >= REGISTRY_REQUIRED_CONFIRMATIONS;
  const registryConfirmationPercentage = Math.min(
    100,
    Math.round((registryConfirmationCount / REGISTRY_REQUIRED_CONFIRMATIONS) * 100),
  );

  const getRecoveredRegistryRegistration = useCallback((interestUid, baseRegistration = null) => {
    const recovery = issuerRegistryRecoveryStore.getForUser(user, interestUid);
    if (!recovery) return baseRegistration;

    return {
      ...(baseRegistration || {}),
      registryOperationId: baseRegistration?.registryOperationId || recovery.registryOperationId,
      chainId: Number(baseRegistration?.chainId) || recovery.chainId,
      txHash: recovery.txHash,
      status: 'PENDING',
    };
  }, [user]);

  const reconcileRegistryRecovery = useCallback(async (interestUid, backendRegistration = null) => {
    const recovery = issuerRegistryRecoveryStore.getForUser(user, interestUid);
    if (!recovery) return backendRegistration;

    if (isRegistryConfirmed(backendRegistration)) {
      issuerRegistryRecoveryStore.removeForUser(user, interestUid, recovery.txHash);
      return backendRegistration;
    }

    if (hasRegistryTransaction(backendRegistration)) {
      // Any backend transaction hash means the database synchronization step has already
      // completed. Never replace a server-side hash with an older browser recovery pointer.
      issuerRegistryRecoveryStore.removeForUser(user, interestUid, recovery.txHash);
      return backendRegistration;
    }

    try {
      const result = await issuerInvestorSubscriptionsService.confirmRegistryRegistration(
        interestUid,
        backendRegistration?.registryOperationId || recovery.registryOperationId,
        recovery.txHash,
      );
      issuerRegistryRecoveryStore.removeForUser(user, interestUid, recovery.txHash);
      return {
        ...(backendRegistration || {}),
        registryOperationId: backendRegistration?.registryOperationId || recovery.registryOperationId,
        chainId: Number(backendRegistration?.chainId) || recovery.chainId,
        txHash: recovery.txHash,
        ...(result || {}),
      };
    } catch (error) {
      if (error?.response?.status === 403) {
        issuerRegistryRecoveryStore.removeForUser(user, interestUid, recovery.txHash);
        return backendRegistration;
      }

      if (error?.response?.status === 422) {
        issuerRegistryRecoveryStore.removeForUser(user, interestUid, recovery.txHash);
        return {
          ...(backendRegistration || {}),
          registryOperationId: backendRegistration?.registryOperationId || recovery.registryOperationId,
          chainId: Number(backendRegistration?.chainId) || recovery.chainId,
          txHash: recovery.txHash,
          status: 'PENDING',
          errorCode: error?.response?.data?.error?.code || 'REGISTRATION_VERIFICATION_FAILED',
        };
      }

      // Keep the signed transaction locally while the backend is unavailable. This prevents
      // another MetaMask transaction and allows a later login/online retry to synchronize DB state.
      return getRecoveredRegistryRegistration(interestUid, backendRegistration);
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
        const backendLatest = await issuerInvestorSubscriptionsService.getRegistryRegistration(interestUid);
        const latest = await reconcileRegistryRecovery(interestUid, backendLatest);
        activeRegistration = latest
          ? { ...(activeRegistration || {}), ...latest }
          : activeRegistration;
        setRegistryRegistration(activeRegistration || null);

        if (isRegistryConfirmed(latest)) {
          if (hasRegistryTransaction(latest)) {
            setRegistryConfirmationProgress({
              txHash: latest.txHash,
              current: REGISTRY_REQUIRED_CONFIRMATIONS,
            });
          }
          setRegistryMessage(REGISTRY_SUCCESS_MESSAGE);
          toast.success('Investor added to registry.');
          await loadData({ silent: true });
          return;
        }

        if (canReplaceRegistryTransaction(latest)) {
          setRegistryMessage('The previous transaction could not be completed. You can try again.');
          return;
        }
      } catch {
        const recovered = getRecoveredRegistryRegistration(interestUid, activeRegistration);
        if (recovered) {
          activeRegistration = recovered;
          setRegistryRegistration(recovered);
        }
        // Keep the current pending state and try again on the next controlled poll.
      }

      if (hasRegistryTransaction(activeRegistration) && !canReplaceRegistryTransaction(activeRegistration)) {
        setRegistryMessage(REGISTRY_PENDING_MESSAGE);
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

          if (progress.current >= REGISTRY_REQUIRED_CONFIRMATIONS) {
            return;
          }
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
  ]);

  const loadRegistryRegistration = useCallback(async ({ silent = false } = {}) => {
    if (!claimSubmitted || !registryInterestUid) return null;
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
      } else if (canReplaceRegistryTransaction(latest)) {
        stopRegistryPolling();
        setRegistryMessage('The previous transaction could not be completed. You can try again.');
      } else if (hasRegistryTransaction(latest)) {
        setRegistryMessage(REGISTRY_PENDING_MESSAGE);
        startRegistryPolling(registryInterestUid, latest);
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
    claimSubmitted,
    getRecoveredRegistryRegistration,
    reconcileRegistryRecovery,
    registryInterestUid,
    startRegistryPolling,
    stopRegistryPolling,
  ]);

  useEffect(() => {
    if (!claimSubmitted || !registryInterestUid) {
      stopRegistryPolling();
      return undefined;
    }

    void loadRegistryRegistration();
    return stopRegistryPolling;
  }, [claimSubmitted, loadRegistryRegistration, registryInterestUid, stopRegistryPolling]);

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
    toast.success('All required claim signatures were verified successfully.');
  };

  const confirmRegistryTransaction = async (registration) => {
    if (!hasRegistryTransaction(registration)) {
      throw new Error('The registration transaction is not available yet.');
    }

    const result = await issuerInvestorSubscriptionsService.confirmRegistryRegistration(
      registryInterestUid,
      registration.registryOperationId,
      registration.txHash,
    );
    // A successful confirm response means the backend has accepted the transaction hash,
    // so the browser recovery pointer is no longer needed even if finalization is still pending.
    issuerRegistryRecoveryStore.removeForUser(user, registryInterestUid, registration.txHash);
    const nextRegistration = { ...registration, ...(result || {}) };
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
      toast.success('Investor added to registry.');
      await loadData({ silent: true });
      return nextRegistration;
    }

    setRegistryMessage(REGISTRY_PENDING_MESSAGE);
    startRegistryPolling(registryInterestUid, nextRegistration);
    return nextRegistration;
  };

  const handleInviteToPurchase = () => {
    const email = String(request?.email || '').trim();
    if (!email) {
      toast.error('Investor email address is unavailable.');
      return;
    }

    window.location.href = `mailto:${encodeURIComponent(email)}`;
  };

  const handleRegistryAction = async () => {
    if (!registryInterestUid || registryActionInFlightRef.current) return;
    registryActionInFlightRef.current = true;
    setRegistryActionLoading(true);
    setRegistryMessage('');
    let broadcastHash = '';
    let recoveryStorageError = null;
    let preparedRegistration = registryRegistration;
    let replacementAllowed = canReplaceRegistryTransaction(preparedRegistration);

    try {
      if (isRegistryConfirmed(preparedRegistration)) return;

      // A known recoverable hash must be checked again; never create another wallet transaction
      // while it is mining, confirming, or temporarily unverifiable.
      if (hasRegistryTransaction(preparedRegistration) && !replacementAllowed) {
        const hasRequiredConfirmations = registryConfirmationProgress.txHash === preparedRegistration.txHash
          && registryConfirmationsComplete;
        if (!hasRequiredConfirmations) {
          setRegistryMessage(REGISTRY_PENDING_MESSAGE);
          startRegistryPolling(registryInterestUid, preparedRegistration);
          return;
        }
        await confirmRegistryTransaction(preparedRegistration);
        return;
      }

      // Prepare is idempotent and returns every transaction-critical registry value.
      const preparedResult = await issuerInvestorSubscriptionsService.prepareRegistryRegistration(
        registryInterestUid,
      );
      replacementAllowed = replacementAllowed || canReplaceRegistryTransaction(preparedResult);
      preparedRegistration = replacementAllowed && !preparedResult?.errorCode
        ? { ...preparedResult, errorCode: registryRegistration?.errorCode || 'REGISTRATION_VERIFICATION_FAILED' }
        : preparedResult;
      setRegistryRegistration(preparedRegistration || null);

      if (isRegistryConfirmed(preparedRegistration)) {
        setRegistryMessage(REGISTRY_SUCCESS_MESSAGE);
        toast.success('Investor added to registry.');
        await loadData({ silent: true });
        return;
      }

      // If recovery already attached a recoverable transaction hash, verify that hash instead of
      // opening the wallet. A prior definitive 422 is the only case where replacement is allowed.
      if (hasRegistryTransaction(preparedRegistration) && !replacementAllowed) {
        const hasRequiredConfirmations = registryConfirmationProgress.txHash === preparedRegistration.txHash
          && registryConfirmationsComplete;
        if (!hasRequiredConfirmations) {
          setRegistryMessage(REGISTRY_PENDING_MESSAGE);
          startRegistryPolling(registryInterestUid, preparedRegistration);
          return;
        }
        await confirmRegistryTransaction(preparedRegistration);
        return;
      }

      if (preparedRegistration?.txHash && !hasRegistryTransaction(preparedRegistration)) {
        throw new Error('The existing registration transaction could not be verified safely.');
      }

      if (!wallet.isConnected || !wallet.connector || !wallet.address) {
        throw new Error('Connect your issuer wallet before adding this investor to the registry.');
      }

      const preparedChainId = Number(preparedRegistration?.chainId);
      const supportedPreparedChain = wallet.supportedChains.some(
        (chain) => chain.id === preparedChainId,
      );
      if (!Number.isSafeInteger(preparedChainId) || !supportedPreparedChain) {
        throw new Error('This registration uses a network that is not available in the application.');
      }
      if (wallet.chainId !== preparedChainId) {
        await wallet.switchChain(preparedChainId);
      }

      broadcastHash = await submitIssuerRegistryRegistrationTransaction({
        connector: wallet.connector,
        connectedAddress: wallet.address,
        preparedRegistration,
      });

      const {
        errorCode: _previousErrorCode,
        errorMessage: _previousErrorMessage,
        ...preparedForSubmission
      } = preparedRegistration || {};
      const submittedRegistration = {
        ...preparedForSubmission,
        txHash: broadcastHash,
        status: 'PENDING',
      };
      setRegistryRegistration(submittedRegistration);
      setRegistryMessage(REGISTRY_PENDING_MESSAGE);

      // Persist the signed transaction before the backend synchronization request. If the API is
      // unavailable after MetaMask confirmation, a later login/reload can safely retry only the
      // idempotent backend confirm call without asking the issuer to sign another transaction.
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

      // Send the broadcast hash immediately. The backend safely keeps an unmined transaction pending.
      await confirmRegistryTransaction(submittedRegistration);
    } catch (error) {
      if (error?.response?.status === 422) {
        if (broadcastHash) {
          issuerRegistryRecoveryStore.removeForUser(user, registryInterestUid, broadcastHash);
        }
        const errorCode = error?.response?.data?.error?.code || 'REGISTRATION_VERIFICATION_FAILED';
        setRegistryRegistration((current) => current ? { ...current, errorCode } : current);
        stopRegistryPolling();
        const message = 'The previous transaction could not be completed. You can try again.';
        setRegistryMessage(message);
        toast.error(message);
        return;
      }

      if (broadcastHash) {
        setRegistryMessage(REGISTRY_PENDING_MESSAGE);
        startRegistryPolling(registryInterestUid, {
          ...preparedRegistration,
          txHash: broadcastHash,
          status: 'PENDING',
        });
        if (recoveryStorageError) {
          toast.warning('Transaction submitted, but browser recovery storage is unavailable. Keep this page open while registration finalizes.');
        } else {
          toast.info('Transaction submitted. Account synchronization will retry automatically if needed.');
        }
        return;
      }

      if (isIssuerRegistryWalletRejection(error)) {
        setRegistryMessage('Transaction cancelled. You can try again when ready.');
        return;
      }

      const message = error?.response ? friendlyRegistryError(error) : getErrorMessage(
        error,
        'Unable to complete the registration right now. Please try again.',
      );
      setRegistryMessage(message);
      toast.error(message);
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

  const effectiveStatus = claimSubmitted ? 'claimSubmitted' : request.status;
  const canReject = requestStatus === 'submitintrest';
  const canVerify = requestStatus === 'submitintrest';
  const currentMeta = statusMeta(effectiveStatus);
  const submissionNumber = request.submissionNumber || history?.timeline?.reduce((max, event) => Math.max(max, Number(event?.submissionNumber) || 0), 0) || null;
  const registryTransactionPending = hasRegistryTransaction(registryRegistration)
    && !canReplaceRegistryTransaction(registryRegistration);

  return (
    <div className="page-stack issuer-investor-review-page issuer-application-activity-page">
      <div className="application-detail-breadcrumbs">
        <button type="button" onClick={() => navigate(ROUTES.investors)}>Manage Requests</button>
        <span>›</span>
        <strong>Application Activity</strong>
      </div>

      <header className="issuer-application-activity-header">
        <div>
          <span className="eyebrow">Issuer review</span>
          <h1>Application Activity</h1>
          <p>Audit trail and submission history for {request.investorName}&apos;s application.</p>
        </div>
        <div className="issuer-application-activity-header__actions">
          <Button variant="secondary" icon={RefreshCw} loading={refreshing} onClick={() => void loadData({ silent: true })}>Refresh</Button>
        </div>
      </header>

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
          <div><span>Application ID</span><strong>{request.interestUid || request.requestReference}</strong></div>
          <div><span>Token</span><strong>{[request.tokenName, request.tokenSymbol ? `(${request.tokenSymbol})` : ''].filter(Boolean).join(' ') || '—'}</strong></div>
          <div><span>Submitted</span><strong>{formatDate(request.submittedAt || request.requestedDate, 'MMM DD, YYYY hh:mm A')}</strong></div>
          <div><span>Latest Submission</span><strong>{submissionNumber ? `Submission ${submissionNumber}` : '—'}</strong></div>
          <div><span>Status</span><AppStatusBadge status={effectiveStatus} label={currentMeta.label} tone={currentMeta.tone} compact /></div>
          <div><span>Resubmissions</span><strong>{history?.summary?.timesResubmitted ?? request?.resubmissionSummary?.timesResubmitted ?? 0}</strong></div>
        </div>
        {claimSubmitted ? (
          <div className="issuer-application-overview-card__actions issuer-application-overview-card__actions--registry">
            {isRegistryConfirmed(registryRegistration) ? (
              <div className="issuer-registry-success" role="status">
                <div className="issuer-registry-success__status">
                  <CheckCircle2 size={16} aria-hidden="true" />
                  <strong>Added to Registry</strong>
                </div>
                <p>{REGISTRY_SUCCESS_MESSAGE}</p>
                <div className="issuer-registry-invite">
                  <Button
                    type="button"
                    icon={Mail}
                    onClick={handleInviteToPurchase}
                    disabled={!String(request?.email || '').trim()}
                    aria-describedby="issuer-registry-invite-tooltip"
                    title={REGISTRY_INVITE_TOOLTIP}
                  >
                    Invite to Purchase
                  </Button>
                  <span
                    id="issuer-registry-invite-tooltip"
                    className="issuer-registry-invite__tooltip"
                    role="tooltip"
                  >
                    {REGISTRY_INVITE_TOOLTIP}
                  </span>
                </div>
              </div>
            ) : (
              <div className="issuer-registry-action">
                <Button
                  type="button"
                  variant="primary"
                  icon={hasRegistryTransaction(registryRegistration) && !canReplaceRegistryTransaction(registryRegistration) ? RefreshCw : UserPlus}
                  loading={registryStatusLoading || registryActionLoading}
                  disabled={registryTransactionPending && !registryConfirmationsComplete}
                  onClick={() => void handleRegistryAction()}
                >
                  {canReplaceRegistryTransaction(registryRegistration)
                    ? 'Try Again'
                    : hasRegistryTransaction(registryRegistration)
                      ? 'Check Status'
                      : 'Add to Registry'}
                </Button>
                {registryTransactionPending ? (
                  <div className="issuer-registry-confirmation-progress">
                    <div className="issuer-registry-confirmation-progress__label">
                      <strong>{registryConfirmationPercentage}%</strong>
                    </div>
                    <div
                      className="issuer-registry-confirmation-progress__track"
                      role="progressbar"
                      aria-label="Block confirmation progress"
                      aria-valuemin={0}
                      aria-valuemax={REGISTRY_REQUIRED_CONFIRMATIONS}
                      aria-valuenow={registryConfirmationCount}
                      aria-valuetext={`${registryConfirmationCount} of ${REGISTRY_REQUIRED_CONFIRMATIONS} confirmations, ${registryConfirmationPercentage}%`}
                    >
                      <span style={{ width: `${registryConfirmationPercentage}%` }} />
                    </div>
                  </div>
                ) : null}
                {registryMessage ? (
                  <span className="issuer-registry-action__message" role="status">
                    {registryMessage}
                  </span>
                ) : null}
              </div>
            )}
          </div>
        ) : claimVerified ? (
          <div className="issuer-application-overview-card__waiting" role="status">
            <Clock3 size={18} />
            <div>
              <strong>Waiting for Investor Action</strong>
              <span>The investor needs to submit the required claim from their side. Once submitted, you can add the investor to the registry.</span>
            </div>
          </div>
        ) : (
          <div className="issuer-application-overview-card__actions">
            <Button variant="danger" icon={XCircle} disabled={!canReject || decisionLoading} onClick={() => setDecisionModal('reject')}>Reject Request</Button>
            <Button icon={ShieldCheck} disabled={!canVerify || decisionLoading} onClick={() => setDecisionModal('verify')}>Verify Claims</Button>
          </div>
        )}
      </Card>

      <section className="application-history-section issuer-application-history-section">
        <div className="application-history-section__heading">
          <div>
            <h2>Application History</h2>
            <p>Expand each activity to review the exact submission snapshot, issuer decision, and resubmission details.</p>
          </div>
          <span>{history?.timeline?.length || 0} event{history?.timeline?.length === 1 ? '' : 's'}</span>
        </div>

        <ApplicationHistory
          timeline={history?.timeline || []}
          viewerRole="issuer"
          currentStatus={request.status}
          onViewDocument={setSelectedDocument}
          onDownloadDocument={handleDownload}
          downloadingDocumentUid={downloadingDocumentUid}
          showDownload
          actorNames={{
            investor: request.investorName || 'Investor account',
            issuer: user?.name || user?.fullName || 'Issuer account',
            system: 'System',
          }}
          emptyTitle="No application activity was returned"
          emptyDescription="The current request is available, but the history endpoint did not return any timeline events."
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
        onVerified={handleClaimsVerified}
      />
    </div>
  );
}
