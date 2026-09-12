import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  BadgeCheck,
  CheckCircle2,
  Circle,
  Clock3,
  FileCheck2,
  HelpCircle,
  Info,
  RefreshCw,
  ShieldCheck,
  UserRoundCheck,
  WalletCards,
  XCircle,
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { investorApi } from '@/api/investor';
import { InvestmentJourneyTracker } from '@/components/application-history/InvestmentJourneyTracker';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ROUTES } from '@/config/routes';
import { web3Config } from '@/config/web3';
import { useAuth } from '@/hooks/useAuth';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useWalletConnection } from '@/hooks/useWalletConnection';
import { investorClaimRecoveryStore } from '@/services/investor/investorClaimRecoveryStore';
import {
  getInvestorClaimWalletErrorMessage,
  isInvestorClaimWalletRejection,
  submitInvestorClaimTransaction,
} from '@/services/investor/investorClaimTransaction.service';
import { investorMarketplaceService } from '@/services/investor/investorMarketplaceService';
import { getErrorMessage } from '@/utils/error';
import { getInvestmentJourney } from '@/utils/investmentJourney';

const CLAIM_SCREEN_STATUSES = new Set([
  'verifiedbyissuer',
  'verified',
  'claimrequired',
  'claimsubmitted',
]);

const CLAIM_UI_STATUS = Object.freeze({
  PENDING: 'PENDING',
  WAITING: 'WAITING',
  SUBMITTING: 'SUBMITTING',
  VERIFYING: 'VERIFYING',
  CONFIRMED: 'CONFIRMED',
  FAILED: 'FAILED',
});

const CLAIM_WORKFLOW_STATUS = Object.freeze({
  CONFIRMED: 'CONFIRMED',
  PENDING_CONFIRMATION: 'PENDING_CONFIRMATION',
  SYNCING: 'SYNCING',
  TRANSACTION_REQUIRED: 'TRANSACTION_REQUIRED',
});

const SYNC_POLL_INTERVAL_MS = 5_000;
const CONFIRMATION_POLL_DELAYS_MS = [5_000, 10_000, 15_000];
const MAX_AUTO_POLL_DURATION_MS = 90_000;
const PENDING_VERIFICATION_MESSAGE =
  'Your wallet approval is being confirmed. Nothing else is needed from you right now.';
const PENDING_GATHERING_MESSAGE =
  'Your verification is being processed. No action is needed right now.';
const WALLET_MISMATCH_MESSAGE =
  'The connected wallet does not match your registered wallet. Please switch to your registered wallet and try again.';
const WRONG_NETWORK_MESSAGE =
  'Please switch your wallet to the required network to complete this verification.';

const normalizeStatus = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');

const validTransactionHash = (value) => /^0x[0-9a-fA-F]{64}$/.test(String(value || '').trim());


const compactDiagnosticCode = (value) => {
  const normalized = String(value || '').trim().toUpperCase();
  return /^[A-Z0-9][A-Z0-9_:-]{0,47}$/.test(normalized) ? normalized : '';
};

const friendlyStoredClaimFailure = (value) => {
  const message = String(value || '').trim();
  if (!message) return 'The previous verification submission couldn’t be confirmed. Please try again.';

  if (
    message.length > 220 ||
    /contract function|contract call|eth_sendrawtransaction|rpc\s+0x|docs:\s*https?:|viem@|execution reverted/i.test(message)
  ) {
    return 'The previous verification approval could not be confirmed. Please try again.';
  }

  return message;
};


const getClaimWorkflowErrorMessage = (error, fallback) =>
  friendlyStoredClaimFailure(getErrorMessage(error, fallback));

const backendClaimStatus = (claim) => {
  const status = normalizeStatus(claim?.status);
  const syncStatus = normalizeStatus(claim?.syncStatus);
  if (status === 'confirmed') return CLAIM_UI_STATUS.CONFIRMED;
  if (status === 'failed') return CLAIM_UI_STATUS.FAILED;
  if (status === 'pending') {
    if (['queued', 'processing'].includes(syncStatus)) return CLAIM_UI_STATUS.WAITING;
    if (validTransactionHash(claim?.txHash)) return CLAIM_UI_STATUS.VERIFYING;
    return CLAIM_UI_STATUS.PENDING;
  }
  if (['verifying', 'pendingverification'].includes(status)) return CLAIM_UI_STATUS.VERIFYING;
  return CLAIM_UI_STATUS.PENDING;
};

const workflowStatusOf = (response) => {
  const status = String(response?.status || '').trim().toUpperCase();
  return Object.values(CLAIM_WORKFLOW_STATUS).includes(status) ? status : '';
};

const claimTopicNumber = (claim) => {
  const value = claim?.claimTopic;
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
};

const claimIdOf = (claim) => String(claim?.claimId || claim?.signatureUid || '').trim();

const addressesEqual = (left, right) =>
  Boolean(left && right && String(left).trim().toLowerCase() === String(right).trim().toLowerCase());

const backendErrorCode = (error) =>
  String(
    error?.response?.data?.code ||
      error?.response?.data?.error?.code ||
      error?.code ||
      '',
  )
    .trim()
    .toUpperCase();

const isRetryableBackendError = (error) => {
  const code = backendErrorCode(error);
  const status = Number(error?.response?.status || 0);

  if (!error?.response) return true;
  if (status >= 500 || status === 408 || status === 429) return true;
  return ['TRANSACTION_NOT_FOUND', 'TRANSACTION_PENDING', 'RPC_UNAVAILABLE'].includes(code);
};

const claimTopicMetadata = (token, claim) => {
  const topicNumber = claimTopicNumber(claim);
  const topics = [
    ...(Array.isArray(token?.requiredClaimTopics) ? token.requiredClaimTopics : []),
    ...(Array.isArray(token?.eligibility?.topics) ? token.eligibility.topics : []),
  ];

  return topics.find((topic) => {
    const candidate = Number(topic?.claimTopicValue ?? topic?.claimTopic);
    return topicNumber !== null && Number.isSafeInteger(candidate) && candidate === topicNumber;
  }) || null;
};

const friendlyVerificationLabel = (value, index = 0) => {
  const text = String(value || '').trim();
  const normalized = text.toUpperCase();
  if (normalized.includes('KYC') || normalized.includes('IDENTITY')) return 'Identity check';
  if (normalized.includes('ACCREDIT')) return 'Investor eligibility check';
  if (normalized.includes('COUNTRY') || normalized.includes('JURISDICTION')) return 'Country eligibility check';
  return text || `Required check ${index + 1}`;
};

const claimTopicLabel = (claim, metadata, index) => friendlyVerificationLabel(
  claim?.label || metadata?.label || metadata?.claimTopicCode,
  index,
);

const claimTopicDescription = (claim, metadata, label) => {
  const normalized = String(metadata?.claimTopicCode || claim?.claimTopicCode || label || '').toUpperCase();
  if (normalized.includes('KYC') || normalized.includes('IDENTITY')) {
    return 'Confirm your identity so the issuer can give you investment access.';
  }
  if (normalized.includes('ACCREDIT')) {
    return 'Confirm that you meet the investor eligibility requirements for this offering.';
  }
  if (normalized.includes('COUNTRY') || normalized.includes('JURISDICTION')) {
    return 'Confirm that your country is eligible for this offering.';
  }
  return claim?.description || metadata?.description || `Complete ${label.toLowerCase()} to continue.`;
};

const claimTopicIcon = (claim, metadata) => {
  const code = String(metadata?.claimTopicCode || claim?.claimTopicCode || claim?.label || '').toUpperCase();
  if (code.includes('ACCREDIT')) return BadgeCheck;
  if (code.includes('KYC') || code.includes('IDENTITY')) return ShieldCheck;
  if (code.includes('JURISDICTION') || code.includes('COUNTRY')) return UserRoundCheck;
  return FileCheck2;
};

const claimStateMeta = (status, stage = '') => {
  switch (status) {
    case CLAIM_UI_STATUS.CONFIRMED:
      return { label: 'Completed', tone: 'confirmed', Icon: CheckCircle2 };
    case CLAIM_UI_STATUS.SUBMITTING:
      return {
        label: stage === 'PREPARING' ? 'Getting ready' : 'Approve in your wallet',
        tone: 'submitting',
        Icon: WalletCards,
      };
    case CLAIM_UI_STATUS.VERIFYING:
      return { label: 'Checking approval', tone: 'verifying', Icon: Clock3 };
    case CLAIM_UI_STATUS.WAITING:
      return { label: 'Processing', tone: 'waiting', Icon: Clock3 };
    case CLAIM_UI_STATUS.FAILED:
      return { label: 'Needs attention', tone: 'failed', Icon: XCircle };
    default:
      return { label: 'Ready to complete', tone: 'pending', Icon: CheckCircle2 };
  }
};

const backendRequestId = (error) =>
  String(
    error?.response?.data?.requestId ||
      error?.response?.headers?.['x-request-id'] ||
      '',
  ).trim();

const transactionExplorerUrl = (txHash) => {
  if (!validTransactionHash(txHash)) return '';
  const baseUrl = web3Config.requiredChain?.blockExplorers?.default?.url;
  return baseUrl ? `${baseUrl}/tx/${txHash}` : '';
};

const preparedClaimPayload = (response) => {
  if (!response || typeof response !== 'object') return null;
  const nestedClaim = response?.claim && typeof response.claim === 'object' ? response.claim : null;
  return nestedClaim ? { ...response, ...nestedClaim } : response;
};

export default function SubmitClaimPage() {
  const { interestUid } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const wallet = useWalletConnection();
  const [application, setApplication] = useState(null);
  const [token, setToken] = useState(null);
  const [claimContext, setClaimContext] = useState(null);
  const [registeredWallet, setRegisteredWallet] = useState('');
  const [claimUi, setClaimUi] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const submissionLocksRef = useRef(new Set());
  const verificationLocksRef = useRef(new Set());
  const retryLocksRef = useRef(new Set());
  const pollingMetaRef = useRef(new Map());
  const pollingInFlightRef = useRef(new Set());

  useDocumentTitle(token ? `${token.name} · Complete Verification` : 'Complete Verification');

  const updateClaimUi = useCallback((claimId, patch) => {
    setClaimUi((current) => ({
      ...current,
      [claimId]: {
        ...(current[claimId] || {}),
        ...patch,
      },
    }));
  }, []);

  const mergeVerificationResponse = useCallback((claimId, response, txHash) => {
    const returnedClaim = response?.claim || null;
    const returnedApplication = response?.application || null;
    const workflowStatus = workflowStatusOf(response);
    const resolvedTxHash = returnedClaim?.txHash || txHash || '';

    if (workflowStatus === CLAIM_WORKFLOW_STATUS.CONFIRMED) {
      investorClaimRecoveryStore.remove(interestUid, claimId);
      updateClaimUi(claimId, {
        status: CLAIM_UI_STATUS.CONFIRMED,
        stage: '',
        txHash: resolvedTxHash,
        confirmedAt: returnedClaim?.confirmedAt || '',
        errorCode: '',
        requestId: response?.requestId || '',
        pollingTimedOut: false,
        noticeTitle: '',
        message: '',
        noticeTone: '',
      });
    } else if (workflowStatus === CLAIM_WORKFLOW_STATUS.PENDING_CONFIRMATION) {
      if (validTransactionHash(resolvedTxHash)) {
        investorClaimRecoveryStore.upsert({
          interestId: interestUid,
          claimId,
          txHash: resolvedTxHash,
          createdAt: new Date().toISOString(),
        });
      }
      updateClaimUi(claimId, {
        status: CLAIM_UI_STATUS.VERIFYING,
        stage: '',
        txHash: resolvedTxHash,
        errorCode: '',
        requestId: response?.requestId || '',
        pollingTimedOut: false,
        noticeTitle: 'Checking your approval',
        message: PENDING_VERIFICATION_MESSAGE,
        noticeTone: 'warning',
      });
    } else if (workflowStatus === CLAIM_WORKFLOW_STATUS.SYNCING) {
      updateClaimUi(claimId, {
        status: CLAIM_UI_STATUS.WAITING,
        stage: '',
        txHash: resolvedTxHash,
        errorCode: '',
        requestId: response?.requestId || '',
        pollingTimedOut: false,
        noticeTitle: 'Processing verification',
        message: PENDING_GATHERING_MESSAGE,
        noticeTone: 'warning',
      });
    } else if (workflowStatus === CLAIM_WORKFLOW_STATUS.TRANSACTION_REQUIRED) {
      investorClaimRecoveryStore.remove(interestUid, claimId);
      updateClaimUi(claimId, {
        status: CLAIM_UI_STATUS.PENDING,
        stage: '',
        txHash: '',
        errorCode: '',
        requestId: response?.requestId || '',
        pollingTimedOut: false,
        noticeTitle: 'Action required',
        message: 'This verification is ready. Continue when you’re ready.',
        noticeTone: 'info',
      });
    }

    setClaimContext((current) => {
      if (!current) return current;
      return {
        ...current,
        ...(returnedApplication
          ? {
              application: {
                ...(current.application || {}),
                ...returnedApplication,
              },
              totalRequiredClaims:
                returnedApplication.totalRequiredClaims ?? current.totalRequiredClaims,
              confirmedClaims:
                returnedApplication.confirmedClaims ?? current.confirmedClaims,
              pendingClaims:
                returnedApplication.pendingClaims ?? current.pendingClaims,
            }
          : {}),
        claims: (current.claims || []).map((claim) =>
          claimIdOf(claim) === claimId && returnedClaim
            ? { ...claim, ...returnedClaim }
            : claim,
        ),
      };
    });

    return workflowStatus;
  }, [interestUid, updateClaimUi]);

  const verifySubmittedTransaction = useCallback(async (record, { notify = false } = {}) => {
    const claimId = String(record?.claimId || '').trim();
    const txHash = String(record?.txHash || '').trim();
    if (!claimId || !validTransactionHash(txHash)) return;
    if (verificationLocksRef.current.has(claimId)) return;

    verificationLocksRef.current.add(claimId);
    updateClaimUi(claimId, {
      status: CLAIM_UI_STATUS.VERIFYING,
      stage: '',
      txHash,
      errorCode: '',
      noticeTitle: 'Checking your approval',
      message: PENDING_VERIFICATION_MESSAGE,
      noticeTone: 'info',
    });

    try {
      const response = await investorApi.submitClaim(claimId, {
        interestId: record.interestId,
        txHash,
      });
      const workflowStatus = mergeVerificationResponse(claimId, response, txHash);

      if (notify && workflowStatus === CLAIM_WORKFLOW_STATUS.CONFIRMED) {
        toast.success('Verification confirmed', {
          description: 'Your verification has been confirmed successfully.',
        });
      }
      return workflowStatus;
    } catch (error) {
      if (isRetryableBackendError(error)) {
        updateClaimUi(claimId, {
          status: CLAIM_UI_STATUS.VERIFYING,
          stage: '',
          txHash,
          errorCode: backendErrorCode(error),
          requestId: backendRequestId(error),
          noticeTitle: backendErrorCode(error) === 'RPC_UNAVAILABLE' ? 'Check unavailable' : 'Verification pending',
          message: PENDING_VERIFICATION_MESSAGE,
          noticeTone: 'warning',
        });

        if (notify) {
          toast.warning('Verification pending', { description: PENDING_VERIFICATION_MESSAGE });
        }
        return CLAIM_WORKFLOW_STATUS.PENDING_CONFIRMATION;
      } else {
        const message = getClaimWorkflowErrorMessage(error, 'We couldn’t confirm this verification. Please try again.');
        const code = backendErrorCode(error);
        updateClaimUi(claimId, {
          status: CLAIM_UI_STATUS.FAILED,
          stage: '',
          txHash,
          errorCode: code,
          requestId: backendRequestId(error),
          noticeTitle: 'Verification failed',
          message,
          noticeTone: 'error',
        });

        if (notify) {
          toast.error('Verification failed', { description: message });
        }
        return '';
      }
    } finally {
      verificationLocksRef.current.delete(claimId);
    }
  }, [mergeVerificationResponse, updateClaimUi]);

  const recoverPendingTransactions = useCallback(async ({ notify = false } = {}) => {
    if (!interestUid) return;
    const records = investorClaimRecoveryStore.list(interestUid);
    if (!records.length) return;

    await Promise.all(records.map(async (record) => {
      const claimId = String(record?.claimId || '').trim();
      if (!claimId || retryLocksRef.current.has(claimId) || pollingInFlightRef.current.has(claimId)) return;
      retryLocksRef.current.add(claimId);
      try {
        const response = await investorApi.retryClaim(claimId, { interestId: interestUid });
        const workflowStatus = mergeVerificationResponse(claimId, response, record.txHash);
        if (notify && workflowStatus === CLAIM_WORKFLOW_STATUS.CONFIRMED) {
          toast.success('Verification confirmed', {
            description: 'Your verification has been confirmed successfully.',
          });
        }
      } catch (error) {
        updateClaimUi(claimId, {
          status: CLAIM_UI_STATUS.VERIFYING,
          stage: '',
          txHash: record.txHash,
          errorCode: backendErrorCode(error),
          requestId: backendRequestId(error),
          noticeTitle: 'Status check unavailable',
          message: getClaimWorkflowErrorMessage(error, 'We couldn’t check your approval right now. Please try again shortly.'),
          noticeTone: 'warning',
        });
      } finally {
        retryLocksRef.current.delete(claimId);
      }
    }));
  }, [interestUid, mergeVerificationResponse, updateClaimUi]);

  const loadClaimContext = useCallback(async ({ silent = false } = {}) => {
    if (!interestUid) return;
    if (silent) setRefreshing(true);
    else setLoading(true);

    try {
      const [detail, backendClaims, investorProfile] = await Promise.all([
        investorMarketplaceService.getApplicationDetail(interestUid),
        investorApi.getClaims(interestUid),
        investorApi.getMyInvestor().catch(() => null),
      ]);

      const nextApplication = detail?.application || null;
      if (!nextApplication) throw new Error('The selected investment application could not be found.');

      const tokenUid =
        nextApplication.id ||
        nextApplication.tokenUid ||
        nextApplication.interest?.tokenUid;
      if (!tokenUid) throw new Error('The asset details for this application are incomplete. Please return to your application and try again.');

      let offering = nextApplication;
      try {
        offering = (await investorMarketplaceService.getOffering(tokenUid)) || nextApplication;
      } catch {
        // Claim submission is driven by /investor/claims. Token catalogue metadata is
        // only used for display labels, so a catalogue refresh must not block claims.
      }

      const claims = Array.isArray(backendClaims?.claims) ? backendClaims.claims : [];
      const responseInterestId = String(backendClaims?.interestId || interestUid);
      if (responseInterestId !== String(interestUid)) {
        throw new Error('The verification response does not match the selected application.');
      }

      const pendingRecords = investorClaimRecoveryStore.list(interestUid);
      const pendingByClaim = new Map(pendingRecords.map((record) => [String(record.claimId), record]));

      setClaimUi((current) => {
        const next = { ...current };
        claims.forEach((claim) => {
          const claimId = claimIdOf(claim);
          if (!claimId) return;
          const status = backendClaimStatus(claim);
          const localRecord = pendingByClaim.get(claimId);
          const backendTxHash = validTransactionHash(claim?.txHash) ? claim.txHash : '';

          if (status === CLAIM_UI_STATUS.CONFIRMED) {
            investorClaimRecoveryStore.remove(interestUid, claimId);
            next[claimId] = {
              status: CLAIM_UI_STATUS.CONFIRMED,
              stage: '',
              txHash: claim?.txHash || '',
              confirmedAt: claim?.confirmedAt || '',
              errorCode: '',
              noticeTitle: '',
              message: '',
              noticeTone: '',
            };
            return;
          }

          if (status === CLAIM_UI_STATUS.FAILED) {
            investorClaimRecoveryStore.remove(interestUid, claimId);
            next[claimId] = {
              status: CLAIM_UI_STATUS.FAILED,
              stage: '',
              txHash: claim?.txHash || '',
              errorCode: compactDiagnosticCode(claim?.failureCode),
              noticeTitle: 'Verification failed',
              message: friendlyStoredClaimFailure(claim?.failureReason),
              noticeTone: 'error',
            };
            return;
          }

          if (status === CLAIM_UI_STATUS.WAITING) {
            const recoveryRecord = localRecord || (backendTxHash
              ? investorClaimRecoveryStore.upsert({
                  interestId: interestUid,
                  claimId,
                  txHash: backendTxHash,
                  createdAt: claim?.submittedAt || new Date().toISOString(),
                })
              : null);
            next[claimId] = {
              status: CLAIM_UI_STATUS.WAITING,
              stage: '',
              txHash: recoveryRecord?.txHash || backendTxHash || '',
              errorCode: '',
              noticeTitle: 'Processing your verification',
              message: PENDING_GATHERING_MESSAGE,
              noticeTone: 'warning',
              retrying: current[claimId]?.retrying || false,
            };
            return;
          }

          if (localRecord || backendTxHash) {
            const recoveryRecord = localRecord || investorClaimRecoveryStore.upsert({
              interestId: interestUid,
              claimId,
              txHash: backendTxHash,
              createdAt: claim?.submittedAt || new Date().toISOString(),
            });
            next[claimId] = {
              status: CLAIM_UI_STATUS.VERIFYING,
              stage: '',
              txHash: recoveryRecord.txHash,
              errorCode: '',
              noticeTitle: 'Verification pending',
              message: PENDING_VERIFICATION_MESSAGE,
              noticeTone: 'warning',
            };
            return;
          }

          if ([CLAIM_UI_STATUS.SUBMITTING, CLAIM_UI_STATUS.VERIFYING].includes(current[claimId]?.status)) {
            next[claimId] = current[claimId];
            return;
          }

          next[claimId] = {
            status: CLAIM_UI_STATUS.PENDING,
            stage: '',
            txHash: '',
            errorCode: '',
            noticeTitle: '',
            message: '',
            noticeTone: '',
          };
        });
        return next;
      });

      setApplication(nextApplication);
      setToken(offering);
      setClaimContext({
        ...backendClaims,
        interestId: responseInterestId,
        claims,
      });
      setRegisteredWallet(
        backendClaims?.investorWalletAddress ||
          backendClaims?.walletAddress ||
          nextApplication?.interest?.walletAddress ||
          nextApplication?.walletAddress ||
          investorProfile?.walletAddress ||
          investorProfile?.investor?.walletAddress ||
          '',
      );
    } catch (error) {
      if (!silent) {
        toast.error(getClaimWorkflowErrorMessage(error, 'Unable to load the verification requirements for this application.'));
      }
    } finally {
      if (silent) setRefreshing(false);
      else setLoading(false);
    }
  }, [interestUid]);

  useEffect(() => {
    void loadClaimContext();
  }, [loadClaimContext]);

  useEffect(() => {
    if (loading || !interestUid) return undefined;
    if (investorClaimRecoveryStore.list(interestUid).length) {
      // Recovery must not depend on the claims GET succeeding. A browser refresh can
      // happen while the backend is temporarily unavailable, but the previously
      // submitted transaction hash still needs an immediate backend-only retry.
      void recoverPendingTransactions();
    }
    return undefined;
  }, [interestUid, loading, recoverPendingTransactions]);

  useEffect(() => {
    if (!interestUid || !claimContext?.claims) return undefined;

    const timers = [];
    const processingClaimIds = new Set();

    claimContext.claims.forEach((claim) => {
      const claimId = claimIdOf(claim);
      if (!claimId) return;

      const ui = claimUi[claimId] || {};
      const status = ui.status || backendClaimStatus(claim);
      if (![CLAIM_UI_STATUS.VERIFYING, CLAIM_UI_STATUS.WAITING].includes(status)) {
        pollingMetaRef.current.delete(claimId);
        return;
      }
      if (ui.pollingTimedOut) return;

      processingClaimIds.add(claimId);
      const type = status === CLAIM_UI_STATUS.WAITING ? 'SYNCING' : 'CONFIRMING';
      let meta = pollingMetaRef.current.get(claimId);
      if (!meta || meta.type !== type) {
        meta = { type, startedAt: Date.now(), attempt: 0 };
        pollingMetaRef.current.set(claimId, meta);
      }

      if (Date.now() - meta.startedAt >= MAX_AUTO_POLL_DURATION_MS) {
        updateClaimUi(claimId, {
          pollingTimedOut: true,
          noticeTitle:
            status === CLAIM_UI_STATUS.WAITING
              ? 'Still processing'
              : 'Still confirming',
          message:
            status === CLAIM_UI_STATUS.WAITING
              ? 'This is taking longer than usual. Try again to check the latest status.'
              : 'This is taking longer than usual. You can check the status again in a moment.',
          noticeTone: 'warning',
        });
        return;
      }

      const delay = status === CLAIM_UI_STATUS.WAITING
        ? SYNC_POLL_INTERVAL_MS
        : CONFIRMATION_POLL_DELAYS_MS[
            Math.min(meta.attempt, CONFIRMATION_POLL_DELAYS_MS.length - 1)
          ];

      const timer = window.setTimeout(async () => {
        if (pollingInFlightRef.current.has(claimId) || retryLocksRef.current.has(claimId)) return;
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
          updateClaimUi(claimId, { pollingTick: Date.now() });
          return;
        }
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
          updateClaimUi(claimId, { pollingTick: Date.now() });
          return;
        }

        pollingInFlightRef.current.add(claimId);
        try {
          if (status === CLAIM_UI_STATUS.WAITING) {
            const response = await investorApi.getClaims(interestUid);
            const claims = Array.isArray(response?.claims) ? response.claims : [];
            const refreshedClaim = claims.find((item) => claimIdOf(item) === claimId);
            if (!refreshedClaim) {
              updateClaimUi(claimId, { pollingTick: Date.now() });
              return;
            }

            setClaimContext((current) => current
              ? {
                  ...current,
                  ...response,
                  claims,
                }
              : current);

            const refreshedStatus = backendClaimStatus(refreshedClaim);
            if (refreshedStatus === CLAIM_UI_STATUS.CONFIRMED) {
              investorClaimRecoveryStore.remove(interestUid, claimId);
              pollingMetaRef.current.delete(claimId);
              updateClaimUi(claimId, {
                status: CLAIM_UI_STATUS.CONFIRMED,
                txHash: refreshedClaim?.txHash || '',
                confirmedAt: refreshedClaim?.confirmedAt || '',
                errorCode: '',
                requestId: '',
                pollingTimedOut: false,
                noticeTitle: '',
                message: '',
                noticeTone: '',
              });
              await loadClaimContext({ silent: true });
              return;
            }

            if (refreshedStatus === CLAIM_UI_STATUS.FAILED) {
              pollingMetaRef.current.delete(claimId);
              updateClaimUi(claimId, {
                status: CLAIM_UI_STATUS.FAILED,
                txHash: refreshedClaim?.txHash || ui.txHash || '',
                errorCode: compactDiagnosticCode(refreshedClaim?.failureCode),
                requestId: response?.requestId || '',
                pollingTimedOut: false,
                noticeTitle: 'Verification failed',
                message: friendlyStoredClaimFailure(
                  refreshedClaim?.failureReason || 'We couldn’t finish processing this verification. Please try again.',
                ),
                noticeTone: 'error',
              });
              return;
            }

            if (refreshedStatus === CLAIM_UI_STATUS.VERIFYING) {
              updateClaimUi(claimId, {
                status: CLAIM_UI_STATUS.VERIFYING,
                txHash: refreshedClaim?.txHash || ui.txHash || '',
                requestId: response?.requestId || '',
                pollingTimedOut: false,
                noticeTitle: 'Checking your approval',
                message: PENDING_VERIFICATION_MESSAGE,
                noticeTone: 'warning',
              });
              return;
            }

            if (refreshedStatus === CLAIM_UI_STATUS.PENDING) {
              pollingMetaRef.current.delete(claimId);
              updateClaimUi(claimId, {
                status: CLAIM_UI_STATUS.PENDING,
                txHash: '',
                requestId: response?.requestId || '',
                pollingTimedOut: false,
                noticeTitle: 'Ready to try again',
                message: 'Try again when you’re ready to continue this verification.',
                noticeTone: 'info',
              });
              return;
            }

            updateClaimUi(claimId, {
              status: CLAIM_UI_STATUS.WAITING,
              requestId: response?.requestId || '',
              noticeTitle: 'Processing verification',
              message: PENDING_GATHERING_MESSAGE,
              noticeTone: 'warning',
              pollingTick: Date.now(),
            });
            return;
          }

          meta.attempt += 1;
          const response = await investorApi.retryClaim(claimId, { interestId: interestUid });
          const workflowStatus = mergeVerificationResponse(claimId, response, ui.txHash || claim?.txHash || '');
          if (workflowStatus === CLAIM_WORKFLOW_STATUS.CONFIRMED) {
            pollingMetaRef.current.delete(claimId);
            await loadClaimContext({ silent: true });
          } else {
            updateClaimUi(claimId, { pollingTick: Date.now() });
          }
        } catch (error) {
          const code = backendErrorCode(error);
          updateClaimUi(claimId, {
            status,
            errorCode: code,
            requestId: backendRequestId(error),
            noticeTitle: code === 'RPC_UNAVAILABLE' ? 'Check unavailable' : 'Status check unavailable',
            message: getClaimWorkflowErrorMessage(
              error,
              code === 'RPC_UNAVAILABLE'
                ? 'We couldn’t check the latest status right now. Please try again in a few moments.'
                : 'The latest verification status could not be checked right now.',
            ),
            noticeTone: 'warning',
            pollingTick: Date.now(),
          });
        } finally {
          pollingInFlightRef.current.delete(claimId);
        }
      }, delay);
      timers.push(timer);
    });

    Array.from(pollingMetaRef.current.keys()).forEach((claimId) => {
      if (!processingClaimIds.has(claimId)) pollingMetaRef.current.delete(claimId);
    });

    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [claimContext?.claims, claimUi, interestUid, loadClaimContext, mergeVerificationResponse, updateClaimUi]);

  const displayClaims = useMemo(
    () =>
      (claimContext?.claims || []).map((claim, index) => {
        const metadata = claimTopicMetadata(token, claim);
        return {
          claim,
          metadata,
          claimId: claimIdOf(claim),
          label: claimTopicLabel(claim, metadata, index),
        };
      }),
    [claimContext?.claims, token],
  );

  const claimStatuses = useMemo(
    () =>
      displayClaims.map(({ claim, claimId }) =>
        claimUi[claimId]?.status || backendClaimStatus(claim),
      ),
    [claimUi, displayClaims],
  );

  const confirmedClaimCount = claimStatuses.filter((status) => status === CLAIM_UI_STATUS.CONFIRMED).length;
  const waitingClaimCount = claimStatuses.filter((status) => status === CLAIM_UI_STATUS.WAITING).length;
  const verifyingClaimCount = claimStatuses.filter((status) => status === CLAIM_UI_STATUS.VERIFYING).length;
  const failedClaimCount = claimStatuses.filter((status) => status === CLAIM_UI_STATUS.FAILED).length;
  const processingClaimCount = waitingClaimCount + verifyingClaimCount;
  const allClaimsConfirmed = displayClaims.length > 0 && confirmedClaimCount === displayClaims.length;
  const localPendingRecoveryCount = interestUid
    ? investorClaimRecoveryStore.list(interestUid).length
    : 0;

  const backendStatus = normalizeStatus(
    claimContext?.application?.status ||
      application?.interest?.status ||
      application?.status,
  );
  const isClaimScreenAllowed = CLAIM_SCREEN_STATUSES.has(backendStatus);

  const handleClaimSubmit = useCallback(async (claim, { allowWaiting = false, ignoreRecovery = false, force = false } = {}) => {
    const claimId = claimIdOf(claim);
    if (!claimId || submissionLocksRef.current.has(claimId)) return;

    const currentStatus = claimUi[claimId]?.status || backendClaimStatus(claim);
    if (!force && (
      currentStatus === CLAIM_UI_STATUS.CONFIRMED ||
      currentStatus === CLAIM_UI_STATUS.SUBMITTING ||
      currentStatus === CLAIM_UI_STATUS.VERIFYING ||
      (currentStatus === CLAIM_UI_STATUS.WAITING && !allowWaiting)
    )) {
      return;
    }

    const recoveryRecord = investorClaimRecoveryStore.get(interestUid, claimId);
    if (recoveryRecord && !ignoreRecovery) {
      updateClaimUi(claimId, {
        status: CLAIM_UI_STATUS.VERIFYING,
        stage: '',
        txHash: recoveryRecord.txHash,
        noticeTitle: 'Checking your approval',
        message: PENDING_VERIFICATION_MESSAGE,
        noticeTone: 'warning',
        pollingTimedOut: false,
        pollingTick: Date.now(),
      });
      return;
    }

    if (!wallet.isConnected || !wallet.address || !wallet.connector) {
      const message = 'Connect your registered investor wallet before completing this verification.';
      updateClaimUi(claimId, {
        status: CLAIM_UI_STATUS.PENDING,
        noticeTitle: 'Wallet connection required',
        message,
        noticeTone: 'error',
      });
      toast.error('Wallet connection required', { description: message });
      return;
    }

    if (registeredWallet && !addressesEqual(wallet.address, registeredWallet)) {
      updateClaimUi(claimId, {
        status: CLAIM_UI_STATUS.PENDING,
        noticeTitle: 'Registered wallet required',
        message: WALLET_MISMATCH_MESSAGE,
        noticeTone: 'error',
      });
      toast.error('Registered wallet required', { description: WALLET_MISMATCH_MESSAGE });
      return;
    }

    if (!wallet.isCorrectNetwork || wallet.chainId !== web3Config.requiredChain.id) {
      updateClaimUi(claimId, {
        status: CLAIM_UI_STATUS.PENDING,
        noticeTitle: 'Wrong network',
        message: WRONG_NETWORK_MESSAGE,
        noticeTone: 'error',
      });
      toast.error('Wrong network', { description: WRONG_NETWORK_MESSAGE });
      return;
    }

    submissionLocksRef.current.add(claimId);

    let preparedClaim;
    try {
      updateClaimUi(claimId, {
        status: CLAIM_UI_STATUS.SUBMITTING,
        stage: 'PREPARING',
        txHash: '',
        errorCode: '',
        requestId: '',
        noticeTitle: 'Preparing verification',
        message: 'Preparing your verification. This may take a moment.',
        noticeTone: 'info',
      });

      const prepareResponse = await investorApi.prepareClaim(claimId, {
        interestId: interestUid,
      });
      preparedClaim = preparedClaimPayload(prepareResponse);

      const preparedClaimId = claimIdOf(preparedClaim);
      if (!preparedClaim || !preparedClaimId || preparedClaimId !== claimId) {
        const error = new Error('We couldn’t prepare this verification. Please refresh and try again.');
        error.code = 'INVALID_PREPARE_RESPONSE';
        throw error;
      }

      const preparedStatusValue = normalizeStatus(preparedClaim?.status);
      if (preparedClaim?.alreadyConfirmed === true || preparedStatusValue === 'confirmed') {
        investorClaimRecoveryStore.remove(interestUid, claimId);
        updateClaimUi(claimId, {
          status: CLAIM_UI_STATUS.CONFIRMED,
          stage: '',
          txHash: preparedClaim?.txHash || '',
          confirmedAt: preparedClaim?.confirmedAt || '',
          errorCode: '',
          noticeTitle: '',
          message: '',
          noticeTone: '',
        });
        setClaimContext((current) => current
          ? {
              ...current,
              claims: (current.claims || []).map((item) =>
                claimIdOf(item) === claimId ? { ...item, ...preparedClaim, status: 'CONFIRMED' } : item,
              ),
            }
          : current);
        toast.success('Verification already confirmed', {
          description: 'This verification has already been completed.',
        });
        submissionLocksRef.current.delete(claimId);
        void loadClaimContext({ silent: true });
        return;
      }

      if (preparedStatusValue !== 'pending') {
        const error = new Error('This verification isn’t ready yet. Refresh the verification requirements and try again.');
        error.code = 'CLAIM_NOT_PREPARED';
        throw error;
      }

      updateClaimUi(claimId, {
        status: CLAIM_UI_STATUS.SUBMITTING,
        stage: 'WALLET',
        errorCode: '',
        requestId: prepareResponse?.requestId || '',
        noticeTitle: 'Awaiting signature',
        message: 'Approve the secure action in your wallet to continue.',
        noticeTone: 'info',
      });
    } catch (error) {
      const message = getClaimWorkflowErrorMessage(error, 'We couldn’t prepare this verification.');
      const code = backendErrorCode(error) || String(error?.code || '');
      updateClaimUi(claimId, {
        status: CLAIM_UI_STATUS.PENDING,
        stage: '',
        txHash: '',
        errorCode: code,
        requestId: backendRequestId(error),
        noticeTitle: 'Verification preparation failed',
        message,
        noticeTone: 'error',
      });
      toast.error('Verification preparation failed', { description: message });
      submissionLocksRef.current.delete(claimId);
      return;
    }

    try {
      const txHash = await submitInvestorClaimTransaction({
        connector: wallet.connector,
        connectedAddress: wallet.address,
        registeredWalletAddress: registeredWallet,
        preparedClaim,
      });

      // Store the hash before any backend request. If the backend is unavailable,
      // this record is the recovery pointer for this already-submitted transaction.
      const recovery = investorClaimRecoveryStore.upsert({
        interestId: interestUid,
        claimId,
        txHash,
        createdAt: new Date().toISOString(),
      });

      updateClaimUi(claimId, {
        status: CLAIM_UI_STATUS.VERIFYING,
        stage: '',
        txHash,
        errorCode: '',
        requestId: '',
        noticeTitle: 'Approval submitted',
        message: PENDING_VERIFICATION_MESSAGE,
        noticeTone: 'info',
      });

      const workflowStatus = await verifySubmittedTransaction(recovery, { notify: true });
      if (workflowStatus === CLAIM_WORKFLOW_STATUS.CONFIRMED) {
        await loadClaimContext({ silent: true });
      }
    } catch (error) {
      if (isInvestorClaimWalletRejection(error)) {
        updateClaimUi(claimId, {
          status: CLAIM_UI_STATUS.PENDING,
          stage: '',
          txHash: '',
          errorCode: '',
          noticeTitle: 'Approval cancelled',
          message: 'You cancelled the verification approval in your wallet.',
          noticeTone: 'neutral',
        });
        toast.info('Approval cancelled', {
          description: 'You cancelled the verification approval in your wallet.',
        });
      } else {
        const message =
          error?.code === 'WRONG_WALLET_NETWORK'
            ? WRONG_NETWORK_MESSAGE
            : error?.code === 'WALLET_MISMATCH'
              ? WALLET_MISMATCH_MESSAGE
              : getInvestorClaimWalletErrorMessage(error);
        updateClaimUi(claimId, {
          status: CLAIM_UI_STATUS.PENDING,
          stage: '',
          txHash: '',
          errorCode: compactDiagnosticCode(error?.code),
          noticeTitle:
            error?.code === 'WRONG_WALLET_NETWORK'
              ? 'Wrong network'
              : error?.code === 'WALLET_MISMATCH'
                ? 'Registered wallet required'
                : 'Approval not submitted',
          message,
          noticeTone: 'error',
        });
        toast.error('Verification approval not submitted', { description: message });
      }
    } finally {
      submissionLocksRef.current.delete(claimId);
    }
  }, [
    claimUi,
    interestUid,
    loadClaimContext,
    registeredWallet,
    updateClaimUi,
    verifySubmittedTransaction,
    wallet.address,
    wallet.chainId,
    wallet.connector,
    wallet.isConnected,
    wallet.isCorrectNetwork,
  ]);

  const handleClaimRetry = useCallback(async (claim) => {
    const claimId = claimIdOf(claim);
    if (!claimId || !interestUid || retryLocksRef.current.has(claimId) || pollingInFlightRef.current.has(claimId)) return;

    const currentStatus = claimUi[claimId]?.status || backendClaimStatus(claim);
    if ([CLAIM_UI_STATUS.CONFIRMED, CLAIM_UI_STATUS.SUBMITTING].includes(currentStatus)) return;

    retryLocksRef.current.add(claimId);
    pollingMetaRef.current.delete(claimId);
    updateClaimUi(claimId, {
      status: currentStatus,
      retrying: true,
      pollingTimedOut: false,
      errorCode: '',
      requestId: '',
      noticeTitle: 'Checking verification status',
      message: 'Checking the latest verification status. This may take a moment.',
      noticeTone: 'info',
    });

    try {
      const response = await investorApi.retryClaim(claimId, { interestId: interestUid });
      const workflowStatus = mergeVerificationResponse(
        claimId,
        response,
        claimUi[claimId]?.txHash || claim?.txHash || '',
      );

      switch (workflowStatus) {
        case CLAIM_WORKFLOW_STATUS.CONFIRMED:
          toast.success('Verification confirmed', {
            description: 'Your verification is already confirmed.',
          });
          await loadClaimContext({ silent: true });
          return;

        case CLAIM_WORKFLOW_STATUS.PENDING_CONFIRMATION:
          toast.info('Approval is being confirmed', {
            description: PENDING_VERIFICATION_MESSAGE,
          });
          return;

        case CLAIM_WORKFLOW_STATUS.SYNCING:
          toast.info('Verification is processing', {
            description: PENDING_GATHERING_MESSAGE,
          });
          return;

        case CLAIM_WORKFLOW_STATUS.TRANSACTION_REQUIRED:
          // Retry may open a wallet only after this explicit backend workflow status.
          // The submit helper performs a fresh Prepare immediately before the wallet call.
          await handleClaimSubmit(claim, {
            allowWaiting: true,
            ignoreRecovery: true,
            force: true,
          });
          return;

        default: {
          const error = new Error('The retry response did not include a supported workflow status.');
          error.code = 'INVALID_RETRY_RESPONSE';
          throw error;
        }
      }
    } catch (error) {
      const httpStatus = Number(error?.response?.status || 0);
      const code = backendErrorCode(error) || String(error?.code || '');
      const requestId = backendRequestId(error);
      const message = getClaimWorkflowErrorMessage(error, 'We could not check the verification status right now.');

      if (httpStatus === 404 && code === 'CLAIM_SUBMISSION_NOT_PREPARED') {
        updateClaimUi(claimId, {
          status: CLAIM_UI_STATUS.PENDING,
          retrying: false,
          errorCode: code,
          requestId,
          noticeTitle: 'Preparing verification',
          message: 'One more step is needed before you can continue. Please wait a moment.',
          noticeTone: 'info',
        });
        await handleClaimSubmit(claim, {
          allowWaiting: true,
          ignoreRecovery: true,
          force: true,
        });
        return;
      }

      if (httpStatus === 503 || code === 'RPC_UNAVAILABLE') {
        updateClaimUi(claimId, {
          status: currentStatus,
          retrying: false,
          pollingTimedOut: true,
          errorCode: code,
          requestId,
          noticeTitle: 'Check unavailable',
          message,
          noticeTone: 'warning',
        });
        toast.warning('Check unavailable', { description: message });
        return;
      }

      if (httpStatus === 403) {
        updateClaimUi(claimId, {
          status: currentStatus,
          retrying: false,
          blocked: true,
          errorCode: code,
          requestId,
          noticeTitle: 'Access denied',
          message,
          noticeTone: 'error',
        });
        return;
      }

      if (httpStatus === 409) {
        updateClaimUi(claimId, {
          status: currentStatus,
          retrying: false,
          errorCode: code,
          requestId,
          noticeTitle: 'Application status changed',
          message,
          noticeTone: 'warning',
        });
        await loadClaimContext({ silent: true });
        return;
      }

      if (httpStatus === 422 && code === 'INVALID_INVESTOR_IDENTITY') {
        updateClaimUi(claimId, {
          status: CLAIM_UI_STATUS.FAILED,
          retrying: false,
          blocked: true,
          errorCode: code,
          requestId,
          noticeTitle: 'Investor identity action required',
          message,
          noticeTone: 'error',
        });
        return;
      }

      if (httpStatus === 422) {
        await loadClaimContext({ silent: true });
        updateClaimUi(claimId, {
          status: currentStatus === CLAIM_UI_STATUS.FAILED
            ? CLAIM_UI_STATUS.FAILED
            : CLAIM_UI_STATUS.PENDING,
          retrying: false,
          blocked: false,
          errorCode: code,
          requestId,
          noticeTitle: 'Verification needs attention',
          message,
          noticeTone: 'error',
        });
        return;
      }

      updateClaimUi(claimId, {
        status: currentStatus,
        retrying: false,
        errorCode: code,
        requestId,
        noticeTitle: 'Status check unavailable',
        message,
        noticeTone: 'warning',
      });
      toast.warning('Unable to check verification status', { description: message });
    } finally {
      retryLocksRef.current.delete(claimId);
      updateClaimUi(claimId, { retrying: false });
    }
  }, [
    claimUi,
    handleClaimSubmit,
    interestUid,
    loadClaimContext,
    mergeVerificationResponse,
    updateClaimUi,
  ]);

  const verificationJourney = getInvestmentJourney({
    status: allClaimsConfirmed
      ? 'claimSubmitted'
      : application?.interest?.status || claimContext?.application?.status || 'verifiedByIssuer',
    viewerRole: 'investor',
  });

  if (loading) {
    return (
      <div className="page-stack investor-submit-claim-page">
        <div className="submit-claim-loading submit-claim-loading--header" />
        <div className="submit-claim-layout">
          <div className="submit-claim-loading submit-claim-loading--claims" />
          <div className="submit-claim-loading submit-claim-loading--aside" />
        </div>
      </div>
    );
  }

  if (!application || !token || !claimContext) {
    const hasPendingRecovery = localPendingRecoveryCount > 0;
    return (
      <Card className="submit-claim-empty-state">
        {hasPendingRecovery ? <Clock3 size={34} /> : <ShieldCheck size={34} />}
        <h1>{hasPendingRecovery ? 'Verification pending' : 'Verification unavailable'}</h1>
        <p>
          {hasPendingRecovery
            ? PENDING_VERIFICATION_MESSAGE
            : 'The application or required verification information could not be loaded.'}
        </p>
        {hasPendingRecovery ? (
          <small className="submit-claim-recovery-count">
            {localPendingRecoveryCount} verification item{localPendingRecoveryCount === 1 ? '' : 's'} waiting for confirmation.
          </small>
        ) : null}
        <div className="submit-claim-empty-actions">
          <Button
            variant="secondary"
            icon={RefreshCw}
            onClick={() => void (async () => {
              if (hasPendingRecovery) await recoverPendingTransactions({ notify: true });
              await loadClaimContext();
            })()}
          >
            {hasPendingRecovery ? 'Retry Verification' : 'Retry'}
          </Button>
          <Button variant="secondary" icon={ArrowLeft} onClick={() => navigate(ROUTES.applications)}>
            Back to My Applications
          </Button>
        </div>
      </Card>
    );
  }

  if (!isClaimScreenAllowed) {
    return (
      <Card className="submit-claim-empty-state">
        <CheckCircle2 size={34} />
        <h1>No verification action is currently required</h1>
        <p>Your application does not currently require additional verification. Review the latest application status before continuing.</p>
        <Button variant="secondary" icon={ArrowLeft} onClick={() => navigate(ROUTES.applicationDetail(interestUid))}>
          View Application Details
        </Button>
      </Card>
    );
  }

  return (
    <div className="page-stack investor-submit-claim-page">
      <div className="submit-claim-local-breadcrumbs">
        <button type="button" onClick={() => navigate(ROUTES.applications)}>My Applications</button>
        <span>›</span>
        <button type="button" onClick={() => navigate(ROUTES.applicationDetail(interestUid))}>Application Details</button>
        <span>›</span>
        <strong>Complete Verification</strong>
      </div>

      <header className="submit-claim-header">
        <div>
          <div className="submit-claim-title-line">
            <h1>Complete Your Verification</h1>
            {allClaimsConfirmed ? (
              <span className="submit-claim-complete-badge"><CheckCircle2 size={13} /> Complete</span>
            ) : processingClaimCount > 0 ? (
              <span className="submit-claim-processing-badge"><Clock3 size={13} /> Processing</span>
            ) : (
              <span className="submit-claim-action-badge"><Circle size={8} fill="currentColor" /> Your Action</span>
            )}
          </div>
          <p>
            {allClaimsConfirmed ? (
              <>You completed all required checks for <strong>{token.name} ({token.symbol})</strong>. Nothing else is needed from you while the issuer completes final approval.</>
            ) : processingClaimCount > 0 ? (
              <>Your verification for <strong>{token.name} ({token.symbol})</strong> is being processed. Nothing is needed from you right now.</>
            ) : (
              <>The issuer approved your application. Complete the required checks for <strong>{token.name} ({token.symbol})</strong> to continue.</>
            )}
          </p>
        </div>
        <Button variant="secondary" icon={RefreshCw} loading={refreshing} onClick={() => void loadClaimContext({ silent: true })}>
          Refresh Status
        </Button>
      </header>

      <InvestmentJourneyTracker journey={verificationJourney} />

      <Card className="submit-claim-context-card">
        <div>
          <span>Investor</span>
          <strong>{user?.name || user?.fullName || 'Current investor'}</strong>
        </div>
        <div>
          <span>Asset</span>
          <strong>{token.name} ({token.symbol})</strong>
        </div>
        <div>
          <span>Issuer</span>
          <strong>{token.issuer || application.issuer || 'Issuing organization'}</strong>
        </div>
        <div>
          <span>Application ID</span>
          <strong title={interestUid}>{interestUid}</strong>
        </div>
      </Card>

      <div className="submit-claim-layout">
        <main className="submit-claim-main">
          <div className="submit-claim-section-heading">
            <div>
              <span className="eyebrow">Required checks</span>
              <h2>Finish these checks</h2>
            </div>
            <span className={`submit-claim-count${allClaimsConfirmed ? ' is-complete' : ''}`}>
              {confirmedClaimCount}/{displayClaims.length} completed
            </span>
          </div>

          {displayClaims.length ? (
            <div className="submit-claim-topic-list">
              {displayClaims.map(({ claim, metadata, claimId, label }, index) => {
                const Icon = claimTopicIcon(claim, metadata);
                const ui = claimUi[claimId] || { status: backendClaimStatus(claim) };
                const status = ui.status || CLAIM_UI_STATUS.PENDING;
                const stateMeta = claimStateMeta(status, ui.stage);
                const StateIcon = stateMeta.Icon;
                const isSubmitting = status === CLAIM_UI_STATUS.SUBMITTING;
                const isConfirming = status === CLAIM_UI_STATUS.VERIFYING;
                const isWaiting = status === CLAIM_UI_STATUS.WAITING;
                const isConfirmed = status === CLAIM_UI_STATUS.CONFIRMED;
                const isFailed = status === CLAIM_UI_STATUS.FAILED;
                const isNotInitiated = normalizeStatus(claim?.status) === 'notinitiated';
                const shouldRetryBeforeWallet = isFailed || (status === CLAIM_UI_STATUS.PENDING && !isNotInitiated);
                const missingClaimId = !claimId;
                const explorerUrl = transactionExplorerUrl(ui.txHash);

                return (
                  <Card
                    key={claimId || `claim-${index}`}
                    className={`submit-claim-topic-card is-${stateMeta.tone}`}
                  >
                    <span className="submit-claim-topic-card__icon"><Icon size={22} /></span>
                    <div className="submit-claim-topic-card__content">
                      <div className="submit-claim-topic-card__title">
                        <h3>{label}</h3>

                      </div>
                      <span className={`submit-claim-topic-card__state is-${stateMeta.tone}`}>
                        <StateIcon size={14} />
                        {stateMeta.label}
                      </span>
                      <p>
                        {isWaiting
                          ? 'Your verification is being processed. No action is needed right now.'
                          : claimTopicDescription(claim, metadata, label)}
                      </p>

                      {ui.message ? (
                        <div className={`submit-claim-notice is-${ui.noticeTone || 'info'}`} role={ui.noticeTone === 'error' ? 'alert' : 'status'}>
                          <strong>{ui.noticeTitle}</strong>
                          <span>{ui.message}</span>
                          {ui.requestId ? (
                            <small className="submit-claim-diagnostics">
                              Support reference: {ui.requestId}
                            </small>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                    <div className="submit-claim-topic-card__action">
                      <div className="submit-claim-topic-card__action-buttons">
                        <Button
                          onClick={() => void (shouldRetryBeforeWallet ? handleClaimRetry(claim) : handleClaimSubmit(claim))}
                          disabled={
                            isConfirmed ||
                            isWaiting ||
                            isConfirming ||
                            missingClaimId ||
                            Boolean(ui.blocked)
                          }
                          loading={isSubmitting || Boolean(ui.retrying)}
                          variant={shouldRetryBeforeWallet ? 'secondary' : 'primary'}
                        >
                          {isConfirmed
                            ? <><CheckCircle2 size={16} /> Completed</>
                            : isWaiting
                              ? <><Clock3 size={16} /> Processing</>
                              : isSubmitting
                                ? ui.stage === 'PREPARING' ? 'Getting Ready' : 'Approve in Wallet'
                                : isConfirming
                                  ? <><Clock3 size={16} /> Checking Approval</>
                                  : shouldRetryBeforeWallet
                                    ? <><RefreshCw size={16} /> Try Again</>
                                    : <>Complete Check <WalletCards size={16} /></>}
                        </Button>
                        {isConfirming && !missingClaimId ? (
                          <Button
                            variant="secondary"
                            icon={RefreshCw}
                            loading={Boolean(ui.retrying)}
                            disabled={Boolean(ui.retrying) || Boolean(ui.blocked)}
                            onClick={() => void handleClaimRetry(claim)}
                          >
                            Check status
                          </Button>
                        ) : null}
                        {isWaiting && ui.pollingTimedOut && !missingClaimId ? (
                          <Button
                            variant="secondary"
                            icon={RefreshCw}
                            loading={Boolean(ui.retrying)}
                            disabled={Boolean(ui.retrying) || Boolean(ui.blocked)}
                            onClick={() => void handleClaimRetry(claim)}
                          >
                            Retry
                          </Button>
                        ) : null}
                      </div>
                      <small>
                        {missingClaimId
                          ? 'This verification item is temporarily unavailable. Please refresh and try again.'
                          : isWaiting
                            ? 'Your verification is being processed. No action is needed right now.'
                            : isConfirming
                              ? 'Your wallet approval is being confirmed. You can check the status again at any time.'
                              : shouldRetryBeforeWallet
                                ? 'Try again to continue this verification.'
                                : 'Ready when you are'}
                      </small>
                      {explorerUrl ? (
                        <a
                          className="submit-claim-explorer-link"
                          href={explorerUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          View technical transaction details
                        </a>
                      ) : null}
                    </div>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card className="submit-claim-no-topics">
              <Info size={22} />
              <div>
                <strong>No verification requirements are available right now</strong>
                <p>Refresh the page or contact the issuer if you believe verification should be available.</p>
              </div>
            </Card>
          )}
        </main>

        <aside className="submit-claim-aside">
          <Card className="submit-claim-progress-card">
            <span className="submit-claim-aside-label">Verification progress</span>
            <div className="submit-claim-progress-summary">
              <strong>{confirmedClaimCount} of {displayClaims.length} completed</strong>
              <span>
                {allClaimsConfirmed
                  ? 'All required verification is complete.'
                  : processingClaimCount
                    ? `${processingClaimCount} verification item${processingClaimCount === 1 ? ' is' : 's are'} being processed.`
                    : failedClaimCount
                      ? `${failedClaimCount} verification item${failedClaimCount === 1 ? '' : 's'} need${failedClaimCount === 1 ? 's' : ''} attention.`
                      : 'Complete each verification requirement separately.'}
              </span>
            </div>
            <div className="submit-claim-progress-list">
              {displayClaims.map(({ claim, claimId, label }) => {
                const status = claimUi[claimId]?.status || backendClaimStatus(claim);
                const confirmed = status === CLAIM_UI_STATUS.CONFIRMED;
                const failed = status === CLAIM_UI_STATUS.FAILED;
                const waiting = status === CLAIM_UI_STATUS.WAITING;
                const verifying = status === CLAIM_UI_STATUS.VERIFYING;
                const submitting = status === CLAIM_UI_STATUS.SUBMITTING;
                const preparing = submitting && claimUi[claimId]?.stage === 'PREPARING';
                return (
                  <div key={`progress-${claimId}`} className={`submit-claim-progress-item is-${status.toLowerCase()}`}>
                    <span className={`submit-claim-progress-item__marker${confirmed ? ' is-ready' : ''}${failed ? ' is-failed' : ''}${waiting || verifying || submitting ? ' is-processing' : ''}`}>
                      {confirmed ? <CheckCircle2 size={11} /> : failed ? <XCircle size={11} /> : <Circle size={7} fill="currentColor" />}
                    </span>
                    <div>
                      <strong>{label}</strong>
                      <small>
                        {confirmed
                          ? 'Completed'
                          : waiting
                            ? 'Processing'
                          : submitting
                            ? preparing ? 'Getting ready' : 'Waiting for your wallet approval'
                            : verifying
                              ? 'Checking wallet approval'
                              : failed
                                ? 'Needs attention — try again'
                                : 'Ready to complete'}
                      </small>
                    </div>
                  </div>
                );
              })}
              <div className={`submit-claim-progress-item${allClaimsConfirmed ? ' is-confirmed' : ' is-locked'}`}>
                <span className={`submit-claim-progress-item__marker${allClaimsConfirmed ? ' is-ready' : ''}`}>
                  {allClaimsConfirmed ? <CheckCircle2 size={11} /> : <Circle size={7} fill="currentColor" />}
                </span>
                <div>
                  <strong>What happens next</strong>
                  <small>
                    {allClaimsConfirmed
                      ? 'Waiting for issuer final approval'
                      : processingClaimCount
                        ? 'Waiting for verification processing'
                        : 'Complete all required checks first'}
                  </small>
                </div>
              </div>
            </div>
          </Card>

          <Card className="submit-claim-network-card">
            <div className="submit-claim-network-card__title"><Info size={18} /><strong>About wallet approval</strong></div>
            <p>
              Some verification checks may ask you to approve a secure action in your registered wallet. Simply follow the wallet prompt to continue. <small>Technical network: {web3Config.requiredChain.name}</small>
            </p>
          </Card>

          <Card className="submit-claim-help-card">
            <span className="submit-claim-help-card__icon"><HelpCircle size={19} /></span>
            <div>
              <strong>Need assistance?</strong>
              <p>Review your application details and issuer decision before continuing with verification.</p>
              <button type="button" onClick={() => navigate(ROUTES.applicationDetail(interestUid))}>View Application Details</button>
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}
