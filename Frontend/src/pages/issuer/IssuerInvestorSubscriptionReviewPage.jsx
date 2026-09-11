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
import { CompactAddress } from '@/components/common/CompactAddress';
import { SecureDocumentPreviewModal } from '@/components/common/SecureDocumentPreviewModal';
import { AppStatusBadge } from '@/components/common/AppStatusBadge';
import { RejectInterestModal, VerifyIdentityClaimsModal } from '@/components/issuer/IssuerInterestDecisionModals';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
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

const normalizeStatus = (status) => String(status || '')
  .trim()
  .toLowerCase()
  .replace(/[\s_-]+/g, '');

const isClaimVerifiedStatus = (status) => ['verifiedbyissuer', 'verified'].includes(normalizeStatus(status));
const isClaimSubmittedStatus = (status) => normalizeStatus(status) === 'claimsubmitted';

const statusMeta = (status) => {
  const value = String(status || '').toLowerCase();
  if (isClaimSubmittedStatus(status)) return { label: 'Verification Submitted', tone: 'success' };
  if (isClaimVerifiedStatus(status)) return { label: 'Verification Approved', tone: 'success' };
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
const REGISTRY_SUCCESS_MESSAGE = 'This investor is now approved to purchase, receive and hold the token.';
const REGISTRY_PENDING_MESSAGE = 'Transaction submitted. Finalizing investor approval.';
const REGISTRY_INVITE_TOOLTIP = 'Send the investor an email letting them know they can now purchase this token.';

const normalizeRegistryStatus = (status) => String(status || '').trim().toUpperCase();
const isRegistryConfirmed = (registration) => normalizeRegistryStatus(registration?.status) === 'CONFIRMED';
const hasRegistryTransaction = (registration) => isValidTransactionHash(registration?.txHash);
const registryVerificationMessage = (registration) =>
  String(registration?.verificationMessage || '').trim();
const hasRegistryVerificationFailure = (registration) =>
  hasRegistryTransaction(registration) && Boolean(registration?.errorCode);

const friendlyRegistryError = (error) => {
  const status = error?.response?.status;
  if (status === 403) return 'You do not have permission to approve this investor.';
  if (status === 409) return 'This application is not ready for investor approval yet. Refresh and try again.';
  if (status === 422) return 'We could not verify this investor-approval transaction. Do not submit another wallet transaction. Check the status again after the issue is resolved.';
  if (status === 503 || error?.code === 'ERR_NETWORK') {
    return 'The investor-approval status is temporarily unavailable. Please try again in a few moments.';
  }
  return 'Unable to complete investor approval right now. Please try again.';
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
  const {
    organization,
    isLoading: organizationLoading,
    isFetching: organizationFetching,
    refresh: refreshOrganization,
  } = useOrganization();

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
    ? 'Checking your Organization Wallet…'
    : !organizationWalletIsAvailable
      ? 'We could not verify your Organization Wallet. Refresh your organization details before continuing.'
      : !wallet.isConnected
        ? 'Connect your Organization Wallet to approve this investor for the token.'
        : !connectedWalletIsOrganizationWallet
          ? 'This is not your Organization Wallet. Switch wallets to continue.'
          : '';

  const openOrganizationWalletControl = useCallback(async () => {
    if (wallet.isConnected && !connectedWalletIsOrganizationWallet) {
      try {
        await wallet.disconnect();
      } catch (error) {
        toast.error(getErrorMessage(error, 'Unable to change wallets right now. Please try again.'));
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
      toast.error(getErrorMessage(error, 'Unable to refresh the organization wallet right now. Please try again.'));
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

      if (error?.response?.status === 422) {
        // Keep the exact signed hash. A verification failure must never turn into an
        // automatic second MetaMask registration transaction. A later reload/login can
        // retry Confirm with this same hash after the verification issue is resolved.
        return {
          ...(serverRegistration || {}),
          registryOperationId: serverRegistration?.registryOperationId || recovery.registryOperationId,
          chainId: Number(serverRegistration?.chainId) || recovery.chainId,
          txHash: recovery.txHash,
          status: 'PENDING',
          confirmationRetryNeeded: false,
          errorCode: error?.response?.data?.error?.code || 'REGISTRATION_VERIFICATION_FAILED',
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
          toast.success('Investor approved for this token.');
          await loadData({ silent: true });
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
            toast.success('Investor approved for this token.');
            await loadData({ silent: true });
            return;
          }
        } catch (confirmError) {
          if (confirmError?.response?.status === 422) {
            const verificationMessage = friendlyRegistryError(confirmError);
            activeRegistration = {
              ...activeRegistration,
              status: 'PENDING',
              confirmationRetryNeeded: false,
              errorCode: confirmError?.response?.data?.error?.code || 'REGISTRATION_VERIFICATION_FAILED',
              verificationMessage,
            };
            setRegistryRegistration(activeRegistration);
            setRegistryMessage(verificationMessage);
            return;
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
        } catch (confirmError) {
          if (confirmError?.response?.status === 422) {
            resumed = {
              ...latest,
              status: 'PENDING',
              errorCode: confirmError?.response?.data?.error?.code || 'REGISTRATION_VERIFICATION_FAILED',
              verificationMessage: friendlyRegistryError(confirmError),
            };
            setRegistryRegistration(resumed);
            stopRegistryPolling();
            setRegistryMessage(resumed.verificationMessage);
            return resumed;
          }
          // 503/network errors keep the same hash pending and schedule Confirm retry
          // with this exact hash. MetaMask is never opened again for this operation.
          if (confirmError?.response?.status === 503 || confirmError?.code === 'ERR_NETWORK') {
            resumed = { ...latest, confirmationRetryNeeded: true };
            setRegistryRegistration(resumed);
          }
        }
        setRegistryMessage(REGISTRY_PENDING_MESSAGE);
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
    claimSubmitted,
    getRecoveredRegistryRegistration,
    loadData,
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
    toast.success('Investor verification approved successfully.');
  };

  const confirmRegistryTransaction = async (registration) => {
    if (!hasRegistryTransaction(registration)) {
      throw new Error('The investor-approval transaction is not available yet.');
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
      toast.success('Investor approved for this token.');
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

    try {
      if (isRegistryConfirmed(preparedRegistration)) return;

      // Any existing hash belongs to the current operation. Confirm that same hash or
      // poll its status; never reopen MetaMask just because verification previously failed.
      if (hasRegistryTransaction(preparedRegistration)) {
        await confirmRegistryTransaction(preparedRegistration);
        return;
      }

      // A new registry operation may only be prepared from the organization wallet
      // that was saved during issuer onboarding. This guard runs before the API call so
      // an account mismatch cannot create an operation the connected wallet should not sign.
      if (!organizationWalletIsAvailable) {
        throw new Error('We could not verify your Organization Wallet. Refresh your organization details before continuing.');
      }
      if (!wallet.isConnected || !wallet.connector || !wallet.address) {
        throw new Error('Connect your Organization Wallet to approve this investor for the token.');
      }
      if (!connectedWalletIsOrganizationWallet) {
        throw new Error('This is not your Organization Wallet. Switch wallets to continue.');
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
        toast.success('Investor approved for this token.');
        await loadData({ silent: true });
        return;
      }

      // 200 PENDING with a stored hash resumes the existing operation. Confirm the same
      // hash and never ask MetaMask to submit a duplicate registration transaction.
      if (hasRegistryTransaction(preparedRegistration)) {
        await confirmRegistryTransaction(preparedRegistration);
        return;
      }

      if (preparedRegistration?.txHash && !hasRegistryTransaction(preparedRegistration)) {
        throw new Error('The existing registration transaction could not be verified safely.');
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
      await confirmRegistryTransaction(submittedRegistration);
    } catch (error) {
      if (error?.response?.status === 422) {
        const txHash = broadcastHash || preparedRegistration?.txHash || registryRegistration?.txHash || '';
        const errorCode = error?.response?.data?.error?.code || 'REGISTRATION_VERIFICATION_FAILED';
        const verificationMessage = friendlyRegistryError(error);
        setRegistryRegistration((current) => ({
          ...(current || preparedRegistration || {}),
          ...(isValidTransactionHash(txHash) ? { txHash } : {}),
          status: 'PENDING',
          confirmationRetryNeeded: false,
          errorCode,
          verificationMessage,
        }));
        stopRegistryPolling();
        setRegistryMessage(verificationMessage);
        toast.error(verificationMessage);
        // Do not delete the saved hash and do not open MetaMask again automatically.
        // A later Check Status, reload, or sign-in retries Confirm with the same hash.
        return;
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
          toast.warning('Transaction submitted, but browser recovery storage is unavailable. Keep this page open while registration finalizes.');
        } else if (error?.response?.status === 503 || error?.code === 'ERR_NETWORK') {
          toast.info('Transaction submitted. Verification will retry automatically using the same transaction.');
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
    && !isRegistryConfirmed(registryRegistration);

  return (
    <div className="page-stack issuer-investor-review-page issuer-application-activity-page">
      <div className="application-detail-breadcrumbs">
        <button type="button" onClick={() => navigate(ROUTES.investors)}>Investment Requests</button>
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
                  <strong>Approved Investor</strong>
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
                {hasRegistryTransaction(registryRegistration) || connectedWalletIsOrganizationWallet ? (
                  <Button
                    type="button"
                    variant="primary"
                    icon={hasRegistryTransaction(registryRegistration) ? RefreshCw : UserPlus}
                    loading={registryStatusLoading || registryActionLoading}
                    disabled={registryTransactionPending
                      && !registryConfirmationsComplete
                      && !hasRegistryVerificationFailure(registryRegistration)}
                    onClick={() => void handleRegistryAction()}
                  >
                    {hasRegistryTransaction(registryRegistration) ? 'Check Status' : 'Approve Investor'}
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
                          {wallet.isConnected ? 'Switch Wallet' : 'Connect Wallet'}
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          variant="secondary"
                          icon={RefreshCw}
                          loading={organizationFetching}
                          onClick={() => void handleRefreshOrganizationWallet()}
                        >
                          Refresh Organization
                        </Button>
                      )
                    ) : null}
                  </div>
                )}
                {registryTransactionPending ? (
                  <div className="issuer-registry-confirmation-progress">
                    <div className="issuer-registry-confirmation-progress__label">
                      <strong>{registryConfirmationPercentage}%</strong>
                    </div>
                    <div
                      className="issuer-registry-confirmation-progress__track"
                      role="progressbar"
                      aria-label="Transaction confirmation progress"
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
              <strong>Waiting for Investor Action</strong>
              <span>The investor still needs to complete the required verification. Once submitted, you can approve them for this token.</span>
            </div>
          </div>
        ) : (
          <div className="issuer-application-overview-card__actions">
            <Button variant="danger" icon={XCircle} disabled={!canReject || decisionLoading} onClick={() => setDecisionModal('reject')}>Reject Request</Button>
            <Button icon={ShieldCheck} disabled={!canVerify || decisionLoading} onClick={() => setDecisionModal('verify')}>Approve Verification</Button>
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
