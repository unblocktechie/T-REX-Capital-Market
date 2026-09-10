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
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ROUTES } from '@/config/routes';
import { web3Config } from '@/config/web3';
import { useAuth } from '@/hooks/useAuth';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useWalletConnection } from '@/hooks/useWalletConnection';
import { investorClaimRecoveryStore } from '@/services/investor/investorClaimRecoveryStore';
import {
  isInvestorClaimWalletRejection,
  submitInvestorClaimTransaction,
} from '@/services/investor/investorClaimTransaction.service';
import { investorMarketplaceService } from '@/services/investor/investorMarketplaceService';
import { getErrorMessage } from '@/utils/error';

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

const RECOVERY_RETRY_INTERVAL_MS = 12_000;
const PENDING_VERIFICATION_MESSAGE =
  "Your claim transaction was submitted successfully. We couldn't verify it right now. We'll automatically retry when the service is available.";
const PENDING_GATHERING_MESSAGE =
  'We’re gathering your details. This may take a few minutes. Please wait…';
const WALLET_MISMATCH_MESSAGE =
  'The connected wallet does not match your registered wallet. Please switch to your registered wallet and try again.';
const WRONG_NETWORK_MESSAGE =
  'Please switch your wallet to the required network to submit this claim.';

const normalizeStatus = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');

const backendClaimStatus = (claim) => {
  const status = normalizeStatus(claim?.status);
  if (status === 'confirmed') return CLAIM_UI_STATUS.CONFIRMED;
  if (status === 'failed') return CLAIM_UI_STATUS.FAILED;
  if (status === 'pending') return CLAIM_UI_STATUS.WAITING;
  if (['verifying', 'pendingverification'].includes(status)) return CLAIM_UI_STATUS.VERIFYING;
  return CLAIM_UI_STATUS.PENDING;
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

const claimTopicLabel = (claim, metadata, index) =>
  claim?.label ||
  metadata?.label ||
  metadata?.claimTopicCode ||
  (claimTopicNumber(claim) !== null
    ? `Claim Topic ${claimTopicNumber(claim)}`
    : `Required Claim ${index + 1}`);

const claimTopicDescription = (claim, metadata, label) =>
  claim?.description ||
  metadata?.description ||
  `${label} has been approved by the issuer and is ready for investor on-chain submission.`;

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
      return { label: 'Confirmed', tone: 'confirmed', Icon: CheckCircle2 };
    case CLAIM_UI_STATUS.SUBMITTING:
      return {
        label: stage === 'PREPARING' ? 'Preparing claim' : 'Waiting for wallet confirmation',
        tone: 'submitting',
        Icon: WalletCards,
      };
    case CLAIM_UI_STATUS.VERIFYING:
      return { label: 'Verifying', tone: 'verifying', Icon: Clock3 };
    case CLAIM_UI_STATUS.WAITING:
      return { label: 'Processing', tone: 'waiting', Icon: Clock3 };
    case CLAIM_UI_STATUS.FAILED:
      return { label: 'Verification failed', tone: 'failed', Icon: XCircle };
    default:
      return { label: 'Approved by Issuer (Off-Chain)', tone: 'pending', Icon: CheckCircle2 };
  }
};

const validTransactionHash = (value) => /^0x[0-9a-fA-F]{64}$/.test(String(value || '').trim());

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

  useDocumentTitle(token ? `${token.name} · Submit Claim` : 'Submit Claim');

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
    const status = backendClaimStatus(returnedClaim);

    if (status === CLAIM_UI_STATUS.CONFIRMED) {
      investorClaimRecoveryStore.remove(interestUid, claimId);
      updateClaimUi(claimId, {
        status: CLAIM_UI_STATUS.CONFIRMED,
        stage: '',
        txHash: returnedClaim?.txHash || txHash || '',
        confirmedAt: returnedClaim?.confirmedAt || '',
        errorCode: '',
        noticeTitle: '',
        message: '',
        noticeTone: '',
      });
    } else if (status === CLAIM_UI_STATUS.FAILED) {
      investorClaimRecoveryStore.remove(interestUid, claimId);
      updateClaimUi(claimId, {
        status: CLAIM_UI_STATUS.FAILED,
        stage: '',
        txHash: returnedClaim?.txHash || txHash || '',
        errorCode: returnedClaim?.failureReason || 'CLAIM_VERIFICATION_FAILED',
        noticeTitle: 'Claim verification failed',
        message: returnedClaim?.failureReason || 'The backend could not verify this claim transaction.',
        noticeTone: 'error',
      });
    } else if (status === CLAIM_UI_STATUS.WAITING) {
      updateClaimUi(claimId, {
        status: CLAIM_UI_STATUS.WAITING,
        stage: '',
        txHash: returnedClaim?.txHash || txHash || '',
        noticeTitle: 'Processing your claim',
        message: PENDING_GATHERING_MESSAGE,
        noticeTone: 'warning',
      });
    } else {
      updateClaimUi(claimId, {
        status: CLAIM_UI_STATUS.VERIFYING,
        stage: '',
        txHash: returnedClaim?.txHash || txHash || '',
        noticeTitle: 'Verification pending',
        message: PENDING_VERIFICATION_MESSAGE,
        noticeTone: 'warning',
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

    return status;
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
      noticeTitle: 'Verifying transaction',
      message: 'The wallet transaction was submitted. Waiting for backend confirmation of the exact on-chain claim.',
      noticeTone: 'info',
    });

    try {
      const response = await investorApi.submitClaim(claimId, {
        interestId: record.interestId,
        txHash,
      });
      const status = mergeVerificationResponse(claimId, response, txHash);

      if (notify && status === CLAIM_UI_STATUS.CONFIRMED) {
        toast.success('Claim confirmed', {
          description: 'The backend verified the submitted ONCHAINID claim transaction.',
        });
      }
    } catch (error) {
      if (isRetryableBackendError(error)) {
        updateClaimUi(claimId, {
          status: CLAIM_UI_STATUS.VERIFYING,
          stage: '',
          txHash,
          errorCode: backendErrorCode(error),
          noticeTitle: 'Verification pending',
          message: PENDING_VERIFICATION_MESSAGE,
          noticeTone: 'warning',
        });

        if (notify) {
          toast.warning('Verification pending', { description: PENDING_VERIFICATION_MESSAGE });
        }
      } else {
        const message = getErrorMessage(error, 'The backend rejected this claim transaction.');
        const code = backendErrorCode(error);
        investorClaimRecoveryStore.remove(record.interestId, claimId);
        updateClaimUi(claimId, {
          status: CLAIM_UI_STATUS.FAILED,
          stage: '',
          txHash,
          errorCode: code,
          noticeTitle: 'Claim verification failed',
          message,
          noticeTone: 'error',
        });

        if (notify) {
          toast.error('Claim verification failed', { description: message });
        }
      }
    } finally {
      verificationLocksRef.current.delete(claimId);
    }
  }, [mergeVerificationResponse, updateClaimUi]);

  const recoverPendingTransactions = useCallback(async ({ notify = false } = {}) => {
    if (!interestUid) return;
    const records = investorClaimRecoveryStore.list(interestUid);
    if (!records.length) return;

    await Promise.all(
      records.map((record) => verifySubmittedTransaction(record, { notify })),
    );
  }, [interestUid, verifySubmittedTransaction]);

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
      if (!tokenUid) throw new Error('The selected application does not include a token identifier.');

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
        throw new Error('The claim response does not match the selected investor application.');
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
              errorCode: claim?.failureReason || '',
              noticeTitle: 'Claim verification failed',
              message: claim?.failureReason || 'The previous claim submission failed backend verification.',
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
              noticeTitle: 'Processing your claim',
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
        toast.error(getErrorMessage(error, 'Unable to load the issuer-approved claims for this application.'));
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
    if (!interestUid) return undefined;

    const retry = async () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

      if (investorClaimRecoveryStore.list(interestUid).length) {
        await recoverPendingTransactions();
      }

      // A refresh can happen while the backend is unavailable. Keep retrying the
      // screen context silently so the page recovers without asking the investor to
      // create another blockchain transaction or manually reload the browser.
      if (!claimContext) {
        await loadClaimContext({ silent: true });
      }
    };

    const timer = window.setInterval(() => void retry(), RECOVERY_RETRY_INTERVAL_MS);
    const handleOnline = () => void retry();
    window.addEventListener('online', handleOnline);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('online', handleOnline);
    };
  }, [claimContext, interestUid, loadClaimContext, recoverPendingTransactions]);

  const displayClaims = useMemo(
    () =>
      (claimContext?.claims || []).map((claim, index) => {
        const metadata = claimTopicMetadata(token, claim);
        return {
          claim,
          metadata,
          claimId: claimIdOf(claim),
          topicNumber: claimTopicNumber(claim),
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

  const handleClaimSubmit = useCallback(async (claim, { allowWaiting = false } = {}) => {
    const claimId = claimIdOf(claim);
    if (!claimId || submissionLocksRef.current.has(claimId)) return;

    const currentStatus = claimUi[claimId]?.status || backendClaimStatus(claim);
    if (
      currentStatus === CLAIM_UI_STATUS.CONFIRMED ||
      currentStatus === CLAIM_UI_STATUS.SUBMITTING ||
      currentStatus === CLAIM_UI_STATUS.VERIFYING ||
      (currentStatus === CLAIM_UI_STATUS.WAITING && !allowWaiting)
    ) {
      return;
    }

    const recoveryRecord = investorClaimRecoveryStore.get(interestUid, claimId);
    if (recoveryRecord) {
      updateClaimUi(claimId, {
        status: CLAIM_UI_STATUS.VERIFYING,
        stage: '',
        txHash: recoveryRecord.txHash,
        noticeTitle: 'Verification pending',
        message: PENDING_VERIFICATION_MESSAGE,
        noticeTone: 'warning',
      });
      await verifySubmittedTransaction(recoveryRecord, { notify: true });
      return;
    }

    if (!wallet.isConnected || !wallet.address || !wallet.connector) {
      const message = 'Connect your registered investor wallet before submitting this claim.';
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
        noticeTitle: 'Preparing claim',
        message: 'Validating this claim with the backend before opening your wallet.',
        noticeTone: 'info',
      });

      const prepareResponse = await investorApi.prepareClaim(claimId, {
        interestId: interestUid,
      });
      preparedClaim = preparedClaimPayload(prepareResponse);

      const preparedClaimId = claimIdOf(preparedClaim);
      if (!preparedClaim || !preparedClaimId || preparedClaimId !== claimId) {
        const error = new Error('The backend returned claim preparation data for a different or invalid claim.');
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
        toast.success('Claim already confirmed', {
          description: 'The backend confirmed that this claim has already been completed. No new wallet transaction was created.',
        });
        submissionLocksRef.current.delete(claimId);
        void loadClaimContext({ silent: true });
        return;
      }

      if (preparedStatusValue !== 'pending') {
        const error = new Error('The backend did not return this claim in a submit-ready state. Refresh the claim requirements and try again.');
        error.code = 'CLAIM_NOT_PREPARED';
        throw error;
      }

      updateClaimUi(claimId, {
        status: CLAIM_UI_STATUS.SUBMITTING,
        stage: 'WALLET',
        errorCode: '',
        noticeTitle: 'Confirm in your wallet',
        message: 'Review the ONCHAINID claim transaction and confirm it in your connected wallet.',
        noticeTone: 'info',
      });
    } catch (error) {
      const message = getErrorMessage(error, 'The backend could not prepare this claim for submission.');
      const code = backendErrorCode(error) || String(error?.code || '');
      updateClaimUi(claimId, {
        status: CLAIM_UI_STATUS.PENDING,
        stage: '',
        txHash: '',
        errorCode: code,
        noticeTitle: 'Claim preparation failed',
        message,
        noticeTone: 'error',
      });
      toast.error('Claim preparation failed', { description: message });
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
        noticeTitle: 'Verifying transaction',
        message: 'Transaction submitted successfully. The backend is verifying the exact on-chain claim.',
        noticeTone: 'info',
      });

      await verifySubmittedTransaction(recovery, { notify: true });
    } catch (error) {
      if (isInvestorClaimWalletRejection(error)) {
        updateClaimUi(claimId, {
          status: CLAIM_UI_STATUS.PENDING,
          stage: '',
          txHash: '',
          errorCode: '',
          noticeTitle: 'Transaction cancelled',
          message: 'You cancelled the claim submission in your wallet.',
          noticeTone: 'neutral',
        });
        toast.info('Transaction cancelled', {
          description: 'You cancelled the claim submission in your wallet.',
        });
      } else {
        const message =
          error?.code === 'WRONG_WALLET_NETWORK'
            ? WRONG_NETWORK_MESSAGE
            : error?.code === 'WALLET_MISMATCH'
              ? WALLET_MISMATCH_MESSAGE
              : getErrorMessage(error, 'Unable to submit the claim transaction through your wallet.');
        updateClaimUi(claimId, {
          status: CLAIM_UI_STATUS.PENDING,
          stage: '',
          txHash: '',
          errorCode: String(error?.code || ''),
          noticeTitle:
            error?.code === 'WRONG_WALLET_NETWORK'
              ? 'Wrong network'
              : error?.code === 'WALLET_MISMATCH'
                ? 'Registered wallet required'
                : 'Transaction not submitted',
          message,
          noticeTone: 'error',
        });
        toast.error('Claim transaction not submitted', { description: message });
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

  const handlePendingClaimRetry = useCallback(async (claim) => {
    const claimId = claimIdOf(claim);
    if (!claimId || !interestUid || retryLocksRef.current.has(claimId)) return;

    const currentStatus = claimUi[claimId]?.status || backendClaimStatus(claim);
    if (currentStatus !== CLAIM_UI_STATUS.WAITING) return;

    retryLocksRef.current.add(claimId);
    updateClaimUi(claimId, {
      status: CLAIM_UI_STATUS.WAITING,
      retrying: true,
      errorCode: '',
      noticeTitle: 'Checking claim status',
      message: 'Checking the blockchain and syncing the latest claim status with the platform. No new transaction will be sent.',
      noticeTone: 'info',
    });

    try {
      // Retry is intentionally reconciliation-first. The backend checks the investor
      // Identity contract for an already-emitted ClaimAdded/ClaimChanged event before
      // the frontend considers creating another wallet transaction.
      const response = await investorApi.retryClaim(claimId, { interestId: interestUid });
      const returnedStatus = backendClaimStatus(response?.claim);

      if (response?.detected === true || returnedStatus === CLAIM_UI_STATUS.CONFIRMED) {
        mergeVerificationResponse(claimId, response, response?.claim?.txHash || '');
        toast.success('Claim status synced', {
          description: 'The on-chain claim was detected and the application status has been updated.',
        });
        await loadClaimContext({ silent: true });
        return;
      }

      // If we already know a transaction hash, never ask the investor to sign again.
      // Re-run phase 2 against that exact transaction instead. This covers the case
      // where the wallet transaction succeeded but the original backend sync failed.
      const localRecovery = investorClaimRecoveryStore.get(interestUid, claimId);
      const knownTxHash = [
        localRecovery?.txHash,
        claimUi[claimId]?.txHash,
        claim?.txHash,
        response?.claim?.txHash,
      ].find((candidate) => validTransactionHash(candidate));

      if (knownTxHash) {
        const recoveryRecord = investorClaimRecoveryStore.upsert({
          interestId: interestUid,
          claimId,
          txHash: knownTxHash,
          createdAt: localRecovery?.createdAt || claim?.submittedAt || new Date().toISOString(),
        });

        updateClaimUi(claimId, {
          status: CLAIM_UI_STATUS.VERIFYING,
          retrying: false,
          txHash: knownTxHash,
          errorCode: '',
          noticeTitle: 'Verifying existing transaction',
          message: 'An existing blockchain transaction was found. We are syncing it with the platform; your wallet will not open again.',
          noticeTone: 'info',
        });

        await verifySubmittedTransaction(recoveryRecord, { notify: true });
        await loadClaimContext({ silent: true });
        return;
      }

      // The backend did not detect a matching on-chain event and neither the backend
      // nor local recovery state has a transaction hash. In this case the previous
      // flow stopped before a blockchain transaction was created. Re-enter the normal
      // prepare -> wallet -> submit flow so MetaMask opens only after backend validation.
      updateClaimUi(claimId, {
        status: CLAIM_UI_STATUS.PENDING,
        retrying: false,
        txHash: '',
        errorCode: '',
        noticeTitle: 'No previous transaction detected',
        message: 'No existing claim transaction was found on-chain. We’ll validate the claim again and open your wallet so you can submit it.',
        noticeTone: 'info',
      });
      toast.info('No previous transaction detected', {
        description: 'Your wallet will open only after the backend prepares and validates the claim again.',
      });
      await handleClaimSubmit(claim, { allowWaiting: true });
      return;
    } catch (error) {
      const message = getErrorMessage(
        error,
        'We could not sync the claim status right now. Please wait a moment and retry the status check.',
      );
      updateClaimUi(claimId, {
        status: CLAIM_UI_STATUS.WAITING,
        retrying: false,
        errorCode: backendErrorCode(error),
        noticeTitle: 'Status check unavailable',
        message,
        noticeTone: 'warning',
      });
      toast.warning('Unable to sync claim status', { description: message });
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
    verifySubmittedTransaction,
  ]);

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
        <h1>{hasPendingRecovery ? 'Verification pending' : 'Claim submission unavailable'}</h1>
        <p>
          {hasPendingRecovery
            ? PENDING_VERIFICATION_MESSAGE
            : 'The investor application or issuer-approved claim data could not be loaded.'}
        </p>
        {hasPendingRecovery ? (
          <small className="submit-claim-recovery-count">
            {localPendingRecoveryCount} submitted claim transaction{localPendingRecoveryCount === 1 ? '' : 's'} waiting for backend verification.
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
        <h1>No claim action is currently required</h1>
        <p>This application is not in an issuer-verified or claim-submitted state. Review the latest application status before continuing.</p>
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
        <strong>Submit Claim</strong>
      </div>

      <header className="submit-claim-header">
        <div>
          <div className="submit-claim-title-line">
            <h1>Complete On-Chain Verification</h1>
            {allClaimsConfirmed ? (
              <span className="submit-claim-complete-badge"><CheckCircle2 size={13} /> Claims Confirmed</span>
            ) : processingClaimCount > 0 ? (
              <span className="submit-claim-processing-badge"><Clock3 size={13} /> In Progress</span>
            ) : (
              <span className="submit-claim-action-badge"><Circle size={8} fill="currentColor" /> Action Required</span>
            )}
          </div>
          <p>
            {allClaimsConfirmed ? (
              <>All required claims for <strong>{token.name} ({token.symbol})</strong> are confirmed on-chain and ready for the next registry step.</>
            ) : processingClaimCount > 0 ? (
              <>We’re processing the pending claim details for <strong>{token.name} ({token.symbol})</strong>. You do not need to submit another blockchain transaction while a claim is pending.</>
            ) : (
              <>Your off-chain eligibility has been confirmed by the issuer. Submit the issuer-approved claims required for <strong>{token.name} ({token.symbol})</strong> to complete the next verification step.</>
            )}
          </p>
        </div>
        <Button variant="secondary" icon={RefreshCw} loading={refreshing} onClick={() => void loadClaimContext({ silent: true })}>
          Refresh Claims
        </Button>
      </header>

      <Card className="submit-claim-context-card">
        <div>
          <span>Investor</span>
          <strong>{user?.name || user?.fullName || 'Current investor'}</strong>
        </div>
        <div>
          <span>Token</span>
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
              <span className="eyebrow">Required claims</span>
              <h2>Submit issuer-approved claims</h2>
            </div>
            <span className={`submit-claim-count${allClaimsConfirmed ? ' is-complete' : ''}`}>
              {confirmedClaimCount}/{displayClaims.length} confirmed
            </span>
          </div>

          {displayClaims.length ? (
            <div className="submit-claim-topic-list">
              {displayClaims.map(({ claim, metadata, claimId, topicNumber, label }, index) => {
                const Icon = claimTopicIcon(claim, metadata);
                const ui = claimUi[claimId] || { status: backendClaimStatus(claim) };
                const status = ui.status || CLAIM_UI_STATUS.PENDING;
                const stateMeta = claimStateMeta(status, ui.stage);
                const StateIcon = stateMeta.Icon;
                const isProcessing = [CLAIM_UI_STATUS.SUBMITTING, CLAIM_UI_STATUS.VERIFYING].includes(status);
                const isWaiting = status === CLAIM_UI_STATUS.WAITING;
                const isConfirmed = status === CLAIM_UI_STATUS.CONFIRMED;
                const isFailed = status === CLAIM_UI_STATUS.FAILED;
                const missingClaimId = !claimId;

                return (
                  <Card
                    key={claimId || `claim-${index}`}
                    className={`submit-claim-topic-card is-${stateMeta.tone}`}
                  >
                    <span className="submit-claim-topic-card__icon"><Icon size={22} /></span>
                    <div className="submit-claim-topic-card__content">
                      <div className="submit-claim-topic-card__title">
                        <h3>{label}</h3>
                        {topicNumber !== null ? <span>Topic {topicNumber}</span> : null}
                      </div>
                      <span className={`submit-claim-topic-card__state is-${stateMeta.tone}`}>
                        <StateIcon size={14} />
                        {stateMeta.label}
                      </span>
                      <p>
                        {isWaiting
                          ? 'No action is required while this claim is processing. If it remains stuck, Retry first checks the existing on-chain state and only reopens your wallet when no prior claim transaction is found.'
                          : claimTopicDescription(claim, metadata, label)}
                      </p>

                      {ui.message ? (
                        <div className={`submit-claim-notice is-${ui.noticeTone || 'info'}`} role={ui.noticeTone === 'error' ? 'alert' : 'status'}>
                          <strong>{ui.noticeTitle}</strong>
                          <span>{ui.message}</span>
                          {ui.errorCode ? <small>{ui.errorCode}</small> : null}
                        </div>
                      ) : null}
                    </div>
                    <div className="submit-claim-topic-card__action">
                      <div className="submit-claim-topic-card__action-buttons">
                        <Button
                          onClick={() => void handleClaimSubmit(claim)}
                          disabled={isConfirmed || isWaiting || isProcessing || missingClaimId}
                          loading={isProcessing}
                          variant={isFailed ? 'secondary' : 'primary'}
                        >
                          {isConfirmed
                            ? <><CheckCircle2 size={16} /> Claim Confirmed</>
                            : isWaiting
                              ? <><Clock3 size={16} /> Processing Claim</>
                              : status === CLAIM_UI_STATUS.SUBMITTING
                                ? ui.stage === 'PREPARING' ? 'Preparing Claim' : 'Waiting for Wallet'
                                : status === CLAIM_UI_STATUS.VERIFYING
                                  ? 'Verifying Claim'
                                  : isFailed
                                    ? <><RefreshCw size={16} /> Retry Claim</>
                                    : <>Submit Claim to Blockchain <WalletCards size={16} /></>}
                        </Button>
                        {isWaiting && !missingClaimId ? (
                          <Button
                            variant="secondary"
                            icon={RefreshCw}
                            loading={Boolean(ui.retrying)}
                            disabled={Boolean(ui.retrying)}
                            onClick={() => void handlePendingClaimRetry(claim)}
                          >
                            Retry Claim
                          </Button>
                        ) : null}
                      </div>
                      <small>
                        {missingClaimId
                          ? 'A valid claim identifier was not returned by the backend.'
                          : isWaiting
                            ? 'Retry checks existing on-chain state first. Your wallet opens only if no previous claim transaction is found.'
                          : ui.txHash
                            ? `Transaction ${ui.txHash.slice(0, 10)}…${ui.txHash.slice(-8)}`
                            : `Separate wallet transaction · ${web3Config.requiredChain.name}`}
                      </small>
                    </div>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card className="submit-claim-no-topics">
              <Info size={22} />
              <div>
                <strong>No issuer-approved claims were returned</strong>
                <p>The backend did not return any signed claims for this application. Refresh the page or contact the issuer before continuing.</p>
              </div>
            </Card>
          )}
        </main>

        <aside className="submit-claim-aside">
          <Card className="submit-claim-progress-card">
            <span className="submit-claim-aside-label">Submission Progress</span>
            <div className="submit-claim-progress-summary">
              <strong>{confirmedClaimCount} of {displayClaims.length} confirmed</strong>
              <span>
                {allClaimsConfirmed
                  ? 'All required claims are backend-confirmed.'
                  : processingClaimCount
                    ? `${processingClaimCount} claim${processingClaimCount === 1 ? ' is' : 's are'} being processed. No additional blockchain transaction is required.`
                    : failedClaimCount
                      ? `${failedClaimCount} claim${failedClaimCount === 1 ? '' : 's'} need${failedClaimCount === 1 ? 's' : ''} attention.`
                      : 'Submit each required claim independently.'}
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
                          ? 'Confirmed by backend'
                          : waiting
                            ? 'Processing — no further action required'
                          : submitting
                            ? preparing ? 'Backend validation in progress' : 'Waiting for wallet confirmation'
                            : verifying
                              ? 'Verifying submitted transaction'
                              : failed
                                ? 'Verification failed — retry available'
                                : 'Ready for on-chain submission'}
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
                  <strong>Registry Sync</strong>
                  <small>
                    {allClaimsConfirmed
                      ? 'Ready for the next registry step'
                      : processingClaimCount
                        ? 'Waiting for pending claim processing'
                        : 'Waiting for all required claims'}
                  </small>
                </div>
              </div>
            </div>
          </Card>

          <Card className="submit-claim-network-card">
            <div className="submit-claim-network-card__title"><Info size={18} /><strong>Network Information</strong></div>
            <p>
              Claims are submitted from your registered investor wallet on <strong>{web3Config.requiredChain.name}</strong>.
              The backend independently verifies each resulting transaction before the claim is shown as confirmed.
            </p>
          </Card>

          <Card className="submit-claim-help-card">
            <span className="submit-claim-help-card__icon"><HelpCircle size={19} /></span>
            <div>
              <strong>Need assistance?</strong>
              <p>Review your application details and issuer decision before starting the on-chain claim flow.</p>
              <button type="button" onClick={() => navigate(ROUTES.applicationDetail(interestUid))}>View Application Details</button>
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}
