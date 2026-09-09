import { AlertTriangle, ArrowLeft, RefreshCcw, ShieldCheck } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { tokenApi } from '@/api/tokens';
import { DeploymentProgress } from '@/components/token-issuance/DeploymentProgress';
import {
  AddressDisplay,
  InfoCallout,
} from '@/components/token-issuance/IssuancePrimitives';
import { Button } from '@/components/ui/Button';
import { env } from '@/config/env';
import { ROUTES } from '@/config/routes';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useMyToken, myTokenQueryKey } from '@/hooks/useMyToken';
import { useTokenIssuanceBootstrap } from '@/hooks/useTokenIssuanceBootstrap';
import { useOrganization } from '@/hooks/useOrganization';
import { useWalletConnection } from '@/hooks/useWalletConnection';
import { pendingDeploymentService } from '@/services/pendingDeployment.service';
import { deployTrexSuite } from '@/services/trexDeployment.service';
import { useAuthStore } from '@/store/auth.store';
import { useTokenIssuanceStore } from '@/store/tokenIssuance.store';
import { getTokenApiErrorMessage } from '@/utils/tokenApiValidation';
import { isDuplicateTokenError } from '@/utils/tokenDuplicateProtection';
import {
  assertValidTransactionHash,
  getDeploymentTransactionHash,
} from '@/utils/transactionHash';

const FINALIZATION_POLL_INTERVAL_MS = 4_000;
const FINALIZATION_MAX_POLLS = 30;
const EXISTING_DEPLOYMENT_SYNC_RETRY_MODE = 'existing-deployment-sync';
const EXISTING_DEPLOYMENT_SYNC_MESSAGE =
  "Please wait while we sync your token. We've detected an existing blockchain deployment and are syncing it with your account. There's no need to deploy again. This should only take a few moments.";

const wait = (milliseconds) =>
  new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });

const getBackendErrorCode = (error) =>
  String(
    error?.response?.data?.code ||
      error?.response?.data?.error?.code ||
      error?.cause?.response?.data?.code ||
      error?.cause?.response?.data?.error?.code ||
      error?.code ||
      '',
  ).trim();

const DEPLOYMENT_IDEMPOTENCY_KEY_MAX_LENGTH = 99;

const normalizeDeploymentIdempotencyKey = (value) => {
  const normalized = String(value || '').trim();
  return normalized.length > 0 && normalized.length <= DEPLOYMENT_IDEMPOTENCY_KEY_MAX_LENGTH
    ? normalized
    : '';
};

const createDeploymentIdempotencyKey = ({ tokenUid }) => {
  const randomPart =
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const tokenKey = String(tokenUid || 'token').trim().slice(0, 36);

  // Keep the value below the backend's 100-character limit. A standard token UUID and
  // random UUID produce an 85-character key while preserving per-attempt uniqueness.
  return `trex-deploy:${tokenKey}:${randomPart}`.slice(
    0,
    DEPLOYMENT_IDEMPOTENCY_KEY_MAX_LENGTH,
  );
};

const getAttemptUid = (attempt) =>
  String(attempt?.deploymentAttemptUid || attempt?.uid || attempt?.id || '').trim();

const normalizeAttemptStatus = (attempt) =>
  String(attempt?.status || '')
    .trim()
    .toLowerCase();

const saveRecoveryRecordSafely = (status, values) => {
  try {
    return status === 'confirmed'
      ? pendingDeploymentService.saveConfirmed(values)
      : pendingDeploymentService.saveSubmitted(values);
  } catch (error) {
    console.warn('Deployment browser recovery storage is unavailable.', error);
    return {
      transactionHash: values.transactionHash,
      issuerWallet: values.issuerWallet,
      tokenUid: values.tokenUid,
      metadata: values.metadata || {},
    };
  }
};

const createBackendSyncError = (cause, transactionHash, message) => {
  const error = new Error(
    message ||
      getTokenApiErrorMessage(
        cause,
        'The blockchain transaction was submitted, but the backend could not continue its secure deployment verification.',
      ),
  );
  error.code = 'BACKEND_DEPLOYMENT_SYNC_FAILED';
  error.cause = cause;
  error.transactionHash = transactionHash;
  error.transactionSubmitted = true;
  error.syncOnly = true;
  return error;
};

const getDeploymentErrorText = (error) =>
  `${error?.name || ''} ${error?.code || ''} ${error?.shortMessage || ''} ${
    error?.details || ''
  } ${error?.message || ''} ${error?.cause?.message || ''}`;

const isWalletRejection = (error) =>
  /user rejected|user denied|request rejected|wallet request was rejected|signature was cancelled|signature was canceled|4001/i.test(
    getDeploymentErrorText(error),
  );

const isWalletTransportFailure = (error) =>
  error?.code === 'WALLET_TRANSPORT_TIMEOUT' ||
  /transport request timed out|transporttimeouterror|metamask:\/\/connect|does not have a registered handler|failed to launch/i.test(
    getDeploymentErrorText(error),
  );

const deploymentErrorPresentation = (error, transactionSubmitted) => {
  const backendCode = getBackendErrorCode(error);

  if (backendCode === 'TOKEN_DEPLOYMENT_VERIFICATION_FAILED') {
    return {
      title: 'Deployment transaction could not be verified',
      message: getTokenApiErrorMessage(
        error,
        'The backend verified that the deployment transaction reverted or did not emit the required T-REX deployment event.',
      ),
      canRetry: false,
    };
  }

  if (['TRANSACTION_HASH_CONFLICT', 'CONTRACT_ADDRESS_CONFLICT'].includes(backendCode)) {
    return {
      title: 'Deployment verification conflict',
      message: getTokenApiErrorMessage(
        error,
        'The transaction hash or deployed contract is already linked to another token record.',
      ),
      canRetry: false,
    };
  }

  if (backendCode === 'RPC_UNAVAILABLE') {
    return {
      title: 'Blockchain verification is temporarily unavailable',
      message:
        'The backend could not reach the configured Sepolia RPC provider. Retry the backend verification only; do not send another wallet transaction.',
      canRetry: true,
      retryMode: 'backend-sync',
    };
  }
  if (isWalletTransportFailure(error)) {
    return {
      title: 'MetaMask did not respond',
      message:
        'Open and unlock the MetaMask browser extension, confirm this site is connected to the approved issuer account, then retry deployment. No blockchain transaction was sent.',
      canRetry: true,
      retryMode: 'deployment',
    };
  }

  if (error?.code === 'WALLET_NOT_CONNECTED') {
    return {
      title: 'Wallet connection expired',
      message:
        'The approved issuer wallet is no longer connected to this browser tab. Return to review, reconnect MetaMask, and retry deployment.',
      canRetry: true,
      retryMode: 'deployment',
    };
  }
  if (
    transactionSubmitted &&
    /timed out.*transaction|transaction.*timed out|receipt.*not found|transactionreceipt.*not found|waitfortransactionreceipt/i.test(
      getDeploymentErrorText(error),
    )
  ) {
    return {
      title: 'Sepolia confirmation is taking longer',
      message:
        'The wallet transaction was submitted, but confirmation is still pending or temporarily unavailable. Retry the secure status check; do not send another wallet transaction.',
      canRetry: true,
      retryMode: 'backend-sync',
    };
  }

  if (error?.code === 'BACKEND_TRANSACTION_HASH_MISMATCH') {
    return {
      title: 'Transaction verification failed',
      message:
        'The transaction hash returned by the backend does not match the confirmed wallet transaction. Deployment display was blocked for security.',
      canRetry: false,
    };
  }

  if (error?.syncOnly || error?.code === 'BACKEND_DEPLOYMENT_SYNC_FAILED') {
    return {
      title: 'Transaction submitted — backend verification pending',
      message:
        error?.message ||
        'Your token transaction has already been submitted. Retry only the backend verification; do not submit another blockchain transaction.',
      canRetry: true,
      retryMode: 'backend-sync',
    };
  }

  if (isDuplicateTokenError(error)) {
    return {
      title: 'Existing blockchain deployment detected',
      message: EXISTING_DEPLOYMENT_SYNC_MESSAGE,
      canRetry: false,
      retryMode: EXISTING_DEPLOYMENT_SYNC_RETRY_MODE,
    };
  }

  if (error?.response?.status === 400) {
    return {
      title: 'Token settings need attention',
      message: getTokenApiErrorMessage(
        error,
        'The backend rejected one or more token settings. Return to review and correct the highlighted step.',
      ),
    };
  }
  if (error?.response?.status === 403) {
    return {
      title: 'Deployment not authorized',
      message: 'Only a verified issuer with an approved organization can deploy a token.',
      canRetry: false,
    };
  }
  if (error?.response?.status === 409) {
    return {
      title: 'Deployment request already in progress',
      message:
        'This token proposal is already locked or being processed. Refresh its status before attempting another deployment.',
      canRetry: false,
    };
  }
  if (error?.code === 'ECONNABORTED') {
    return {
      title: transactionSubmitted ? 'Backend update timed out' : 'Backend verification timed out',
      message: transactionSubmitted
        ? 'The blockchain transaction is confirmed, but the backend update timed out. Retry backend synchronization only.'
        : 'The backend validation timed out. Refresh the token status before retrying.',
      canRetry: true,
      retryMode: transactionSubmitted ? 'backend-sync' : 'deployment',
    };
  }

  return {
    title: transactionSubmitted ? 'Deployment could not be confirmed' : 'Deployment not completed',
    message: getTokenApiErrorMessage(
      error,
      error?.message || 'The T-REX deployment could not be completed.',
    ),
  };
};

const persistConfirmedTransactionHash = async ({
  transactionHash,
  deploymentAttemptUid,
}) => {
  const confirmedHash = assertValidTransactionHash(transactionHash);
  let response;
  let submission;

  try {
    /* eslint-disable no-console -- Required to verify the backend deployment response. */
    console.groupCollapsed(`[Token deployment API] ${confirmedHash}`);
    try {
      const payload = {
        transactionHash: confirmedHash,
        ...(deploymentAttemptUid ? { deploymentAttemptUid } : {}),
      };
      console.log('POST /tokens/me/submit payload:', payload);
      submission = await tokenApi.submit(payload);
      response = submission?.data;
      console.log('POST /tokens/me/submit result:', {
        httpStatus: submission?.httpStatus,
        ok: submission?.ok,
        pending: submission?.pending,
        data: response,
      });

      if (!submission?.ok) {
        throw new Error('The backend did not acknowledge the deployment verification request.');
      }
    } finally {
      console.groupEnd();
    }
    /* eslint-enable no-console */
  } catch (error) {
    if (isDuplicateTokenError(error)) {
      try {
        const existingRecord = await tokenApi.getMyToken();
        const existingHash = getDeploymentTransactionHash(existingRecord);
        if (existingHash.toLowerCase() === confirmedHash.toLowerCase()) {
          return {
            pending: false,
            response: existingRecord,
            transactionHash: existingHash,
            deploymentAttemptUid,
            attemptStatus: 'confirmed',
          };
        }
      } catch (reconciliationError) {
        console.error('Deployment hash reconciliation failed', reconciliationError);
      }
    }

    throw createBackendSyncError(error, confirmedHash);
  }

  if (submission?.pending) {
    return {
      pending: true,
      response,
      transactionHash: confirmedHash,
      deploymentAttemptUid: getAttemptUid(response) || deploymentAttemptUid || '',
      attemptStatus: normalizeAttemptStatus(response) || 'confirming',
    };
  }

  const backendHash = getDeploymentTransactionHash(response);
  if (backendHash && backendHash.toLowerCase() !== confirmedHash.toLowerCase()) {
    const error = createBackendSyncError(
      null,
      confirmedHash,
      'The backend returned a different transaction hash than the confirmed wallet transaction.',
    );
    error.code = 'BACKEND_TRANSACTION_HASH_MISMATCH';
    error.canRetry = false;
    throw error;
  }

  return {
    pending: false,
    response,
    transactionHash: backendHash || confirmedHash,
    deploymentAttemptUid: getAttemptUid(response) || deploymentAttemptUid || '',
    attemptStatus: normalizeAttemptStatus(response) || 'confirmed',
  };
};

export default function DeploymentProcessingPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  // The bootstrap keeps the complete token configuration available when this route is
  // opened directly or restored after a browser refresh. Deployment-attempt APIs remain
  // backend-authoritative for whether a wallet transaction may start.
  const tokenBootstrap = useTokenIssuanceBootstrap();
  const tokenRecord = useMyToken({ enabled: false });
  const { organization, isLoading: organizationLoading } = useOrganization();
  const wallet = useWalletConnection();
  const authUser = useAuthStore((state) => state.user);
  const tokenInformation = useTokenIssuanceStore((state) => state.tokenInformation);
  const identityClaims = useTokenIssuanceStore((state) => state.identityClaims);
  const compliance = useTokenIssuanceStore((state) => state.compliance);
  const agents = useTokenIssuanceStore((state) => state.agents);
  const backend = useTokenIssuanceStore((state) => state.backend);
  const deployment = useTokenIssuanceStore((state) => state.deployment);
  const setDeployment = useTokenIssuanceStore((state) => state.setDeployment);
  const setBackendState = useTokenIssuanceStore((state) => state.setBackendState);
  const markStepCompleted = useTokenIssuanceStore((state) => state.markStepCompleted);
  const startedRef = useRef(false);
  const attemptInFlightRef = useRef(false);
  const idempotencyKeyRef = useRef(
    normalizeDeploymentIdempotencyKey(deployment.idempotencyKey),
  );
  useDocumentTitle('Deploying Token');

  const completeBackendDeployment = useCallback(
    async ({ transactionHash, deploymentAttemptUid, metadata = {} }) => {
      const confirmedHash = assertValidTransactionHash(transactionHash);
      let persisted = null;

      for (let pollIndex = 0; pollIndex < FINALIZATION_MAX_POLLS; pollIndex += 1) {
        persisted = await persistConfirmedTransactionHash({
          transactionHash: confirmedHash,
          deploymentAttemptUid,
        });

        if (!persisted.pending) break;

        setBackendState({
          status: 'deploymentPending',
          isDraft: false,
          isLocked: true,
          error: '',
        });
        setDeployment({
          status: 'processing',
          activeStage: 4,
          deploymentAttemptUid:
            persisted.deploymentAttemptUid || deploymentAttemptUid || '',
          attemptStatus: persisted.attemptStatus || 'confirming',
          transactionHash: confirmedHash,
          requestStartedAt: new Date().toISOString(),
          canRetry: false,
          retryMode: 'backend-sync',
          pendingSync: {
            transactionHash: confirmedHash,
            deploymentAttemptUid:
              persisted.deploymentAttemptUid || deploymentAttemptUid || '',
            metadata,
          },
          walletAction: {
            key: 'backend-verification',
            status: 'syncing',
            title: 'Backend verification is in progress',
            description:
              'The transaction is already on Sepolia. The backend is independently checking its receipt and deployment event; MetaMask will not open again.',
          },
        });

        if (pollIndex === FINALIZATION_MAX_POLLS - 1) {
          const pendingError = createBackendSyncError(
            null,
            confirmedHash,
            'The deployment transaction is still awaiting backend confirmation. Retry the secure backend check in a moment; do not send another wallet transaction.',
          );
          pendingError.code = 'BACKEND_CONFIRMATION_PENDING';
          throw pendingError;
        }

        await wait(FINALIZATION_POLL_INTERVAL_MS);
      }

      const deploymentResponse =
        persisted?.response &&
        typeof persisted.response === 'object' &&
        !Array.isArray(persisted.response)
          ? persisted.response
          : {};
      const tokenUid =
        deploymentResponse.tokenUid ||
        deploymentResponse.uid ||
        deploymentResponse.id ||
        metadata.tokenUid ||
        backend.tokenUid ||
        tokenRecord.tokenUid;
      const deployedAt =
        deploymentResponse.deployedAt ||
        deploymentResponse.updatedAt ||
        metadata.deployedAt ||
        new Date().toISOString();
      const result = {
        ...metadata,
        ...deploymentResponse,
        tokenUid,
        status: 'deployed',
        isDraft: false,
        transactionHash: confirmedHash,
        deployTx: confirmedHash,
        deployedAt,
      };

      markStepCompleted('review');
      setBackendState({
        tokenUid,
        currentStep: 'review',
        status: 'deployed',
        isDraft: false,
        isLocked: true,
        lastSavedStep: 'review',
        lastSavedAt: deployedAt,
        error: '',
      });
      setDeployment({
        status: 'success',
        activeStage: 5,
        deploymentAttemptUid:
          persisted?.deploymentAttemptUid || deploymentAttemptUid || '',
        attemptStatus: 'confirmed',
        result,
        error: '',
        transactionHash: confirmedHash,
        requestStartedAt: null,
        canRetry: false,
        retryMode: '',
        pendingSync: null,
        walletAction: null,
      });

      pendingDeploymentService.clear(confirmedHash);

      queryClient.setQueryData(myTokenQueryKey(tokenRecord.userKey), (current) => ({
        ...(current || {}),
        ...deploymentResponse,
        tokenUid: tokenUid || current?.tokenUid || '',
        status: 'deployed',
        isDraft: false,
        deployTxHash: confirmedHash,
        contractTxnHash: confirmedHash,
        deployTx: confirmedHash,
        transactionHash: confirmedHash,
        deployedAt,
        deployment: {
          ...(current?.deployment || {}),
          deployTxHash: confirmedHash,
          deployTx: confirmedHash,
          transactionHash: confirmedHash,
          deployedAt,
        },
        updatedAt: deployedAt,
      }));

      toast.success('Deployment recorded successfully', {
        id: 'token-deployment-recorded',
        description:
          'The backend independently verified the Sepolia transaction and finalized the token.',
      });

      navigate(ROUTES.tokenSuccess(tokenUid || confirmedHash), { replace: true });
    },
    [
      backend.tokenUid,
      markStepCompleted,
      navigate,
      queryClient,
      setBackendState,
      setDeployment,
      tokenRecord.tokenUid,
      tokenRecord.userKey,
    ],
  );

  useEffect(() => {
    if (!tokenBootstrap.error || deployment.status === 'error') return;

    setDeployment({
      status: 'error',
      activeStage: 0,
      error: tokenBootstrap.error,
      canRetry: true,
      retryMode: 'bootstrap',
      walletAction: null,
    });
  }, [deployment.status, setDeployment, tokenBootstrap.error]);

  useEffect(() => {
    if (deployment.status !== 'idle') return;
    setDeployment({
      status: 'processing',
      activeStage: 0,
      error: '',
      canRetry: false,
      retryMode: '',
      walletAction: {
        key: 'deployment-resume-check',
        status: 'syncing',
        title: 'Checking deployment status',
        description:
          'The backend is checking for an existing deployment attempt before any wallet request is opened.',
      },
    });
  }, [deployment.status, setDeployment]);

  useEffect(() => {
    if (
      startedRef.current ||
      attemptInFlightRef.current ||
      deployment.status !== 'processing' ||
      tokenBootstrap.isLoading ||
      !backend.hydrated ||
      organizationLoading ||
      !authUser
    ) {
      return;
    }
    startedRef.current = true;
    attemptInFlightRef.current = true;

    const deploy = async () => {
      let transactionSubmitted = false;
      let transactionHash = '';
      let deploymentAttemptUid = deployment.deploymentAttemptUid || '';
      let attemptStatus = deployment.attemptStatus || '';
      const cachedToken = tokenRecord.token || {};
      const cachedTokenUid =
        cachedToken.tokenUid ||
        cachedToken.uid ||
        cachedToken.id ||
        backend.tokenUid ||
        tokenRecord.tokenUid;
      const cachedTokenName =
        cachedToken.tokenName || cachedToken.name || tokenInformation.name || '';
      const cachedTokenSymbol =
        cachedToken.tokenSymbol || cachedToken.symbol || tokenInformation.symbol || '';
      const approvedWallet = organization.walletAddress || tokenInformation.treasuryWallet;
      const recoveryMetadata = {
        tokenUid: cachedTokenUid,
        tokenName: cachedTokenName,
        symbol: cachedTokenSymbol,
        network: wallet.requiredChain.name,
        chainId: wallet.requiredChain.id,
      };

      try {
        if (!organization.organizationUid) {
          throw new Error('The approved organization record could not be loaded.');
        }
        if (!approvedWallet) {
          throw new Error('The approved organization wallet could not be loaded.');
        }

        setDeployment({
          activeStage: 0,
          walletAction: {
            key: 'deployment-authorization',
            status: 'syncing',
            title: 'Authorizing the deployment attempt',
            description:
              'The backend is validating the token, issuer permissions, network, wallet, and existing deployment state before MetaMask can open.',
          },
        });

        let activeState = null;
        try {
          activeState = await tokenApi.getActiveDeploymentAttempt();
        } catch (activeError) {
          if (activeError?.response?.status !== 404) throw activeError;
        }

        const activeAttempt = activeState?.attempt || null;
        const localRecovery = pendingDeploymentService.getForUser(authUser);
        const localRecoveryMatchesToken = Boolean(
          localRecovery &&
            (!localRecovery.tokenUid ||
              !cachedTokenUid ||
              localRecovery.tokenUid === cachedTokenUid),
        );

        if (activeState?.tokenDeployed) {
          const deployedHash =
            activeState.deployTransactionHash ||
            activeState.transactionHash ||
            (localRecoveryMatchesToken ? localRecovery?.transactionHash : '') ||
            getDeploymentTransactionHash(cachedToken);

          if (deployedHash) {
            await completeBackendDeployment({
              transactionHash: deployedHash,
              deploymentAttemptUid: getAttemptUid(activeAttempt),
              metadata: recoveryMetadata,
            });
            return;
          }

          const latestToken = await tokenApi.getMyToken();
          const deployedTokenUid =
            latestToken?.tokenUid || latestToken?.uid || latestToken?.id || cachedTokenUid;
          queryClient.setQueryData(myTokenQueryKey(tokenRecord.userKey), latestToken);
          navigate(ROUTES.tokenDetails(deployedTokenUid || 'token'), { replace: true });
          return;
        }

        if (activeAttempt) {
          deploymentAttemptUid = getAttemptUid(activeAttempt);
          attemptStatus = normalizeAttemptStatus(activeAttempt);
          const activeChainId = Number(activeAttempt.chainId);
          const activeWallet = String(activeAttempt.walletAddress || '').toLowerCase();

          if (activeChainId && activeChainId !== Number(wallet.requiredChain.id)) {
            throw new Error('The active deployment attempt belongs to a different network.');
          }
          if (activeWallet && activeWallet !== approvedWallet.toLowerCase()) {
            throw new Error('The active deployment attempt belongs to a different issuer wallet.');
          }

          setBackendState({
            status: 'deploymentPending',
            isDraft: false,
            isLocked: true,
            error: '',
          });
          setDeployment({
            deploymentAttemptUid,
            attemptStatus,
            idempotencyKey: normalizeDeploymentIdempotencyKey(deployment.idempotencyKey),
          });

          const localMatchesAttempt =
            localRecoveryMatchesToken &&
            (!localRecovery.metadata?.deploymentAttemptUid ||
              localRecovery.metadata.deploymentAttemptUid === deploymentAttemptUid);
          const activeHash =
            activeAttempt.transactionHash ||
            (localMatchesAttempt ? localRecovery?.transactionHash : '') ||
            '';

          if (['submitted', 'confirming', 'confirmed'].includes(attemptStatus)) {
            if (!activeHash) {
              throw new Error(
                'The backend reports an active broadcast transaction, but no transaction hash is available for recovery.',
              );
            }

            transactionSubmitted = true;
            transactionHash = assertValidTransactionHash(activeHash);
            saveRecoveryRecordSafely('submitted', {
              transactionHash,
              user: authUser,
              issuerWallet: approvedWallet,
              tokenUid: cachedTokenUid,
              metadata: {
                ...recoveryMetadata,
                deploymentAttemptUid,
                attemptStatus,
              },
            });

            setDeployment({
              activeStage: 4,
              deploymentAttemptUid,
              attemptStatus,
              transactionHash,
              retryMode: 'backend-sync',
              pendingSync: {
                transactionHash,
                deploymentAttemptUid,
                metadata: recoveryMetadata,
              },
              walletAction: {
                key: 'backend-resume',
                status: 'syncing',
                title: 'Resuming the submitted deployment',
                description:
                  'The backend already has the transaction hash. It will be independently verified without opening MetaMask again.',
              },
            });

            await completeBackendDeployment({
              transactionHash,
              deploymentAttemptUid,
              metadata: recoveryMetadata,
            });
            return;
          }

          if (attemptStatus === 'pending' && localMatchesAttempt && activeHash) {
            transactionSubmitted = true;
            transactionHash = assertValidTransactionHash(activeHash);
            await tokenApi.markDeploymentAttemptSubmitted(deploymentAttemptUid, {
              transactionHash,
              chainId: wallet.requiredChain.id,
              walletAddress: approvedWallet,
            });

            await completeBackendDeployment({
              transactionHash,
              deploymentAttemptUid,
              metadata: recoveryMetadata,
            });
            return;
          }

          const canInitiateActiveTransaction =
            activeAttempt.canInitiateTransaction === true ||
            activeState?.canInitiateTransaction === true;

          if (attemptStatus === 'pending' && canInitiateActiveTransaction) {
            // Reuse the existing backend-authorized attempt.
          } else if (
            !['expired', 'failed', 'wallet_rejected', 'cancelled'].includes(attemptStatus)
          ) {
            const conflict = new Error(
              'An existing deployment attempt cannot initiate another wallet transaction.',
            );
            conflict.code = 'DEPLOYMENT_ALREADY_IN_PROGRESS';
            throw conflict;
          } else {
            const terminalAttemptStatus = attemptStatus;
            deploymentAttemptUid = '';
            attemptStatus = '';
            setBackendState({
              status: terminalAttemptStatus === 'failed' ? 'deploymentFailed' : 'draft',
              isDraft: terminalAttemptStatus !== 'failed',
              isLocked: terminalAttemptStatus === 'failed',
              error: '',
            });
          }
        }

        if (!activeAttempt && localRecoveryMatchesToken && localRecovery?.transactionHash) {
          transactionSubmitted = true;
          transactionHash = assertValidTransactionHash(localRecovery.transactionHash);
          deploymentAttemptUid =
            localRecovery.metadata?.deploymentAttemptUid || deploymentAttemptUid || '';
          attemptStatus = localRecovery.metadata?.attemptStatus || localRecovery.status;

          setBackendState({
            status: 'deploymentPending',
            isDraft: false,
            isLocked: true,
            error: '',
          });
          setDeployment({
            activeStage: 4,
            deploymentAttemptUid,
            attemptStatus: attemptStatus || 'submitted',
            transactionHash,
            retryMode: 'backend-sync',
            pendingSync: {
              transactionHash,
              deploymentAttemptUid,
              metadata: localRecovery.metadata || recoveryMetadata,
            },
            walletAction: {
              key: 'browser-recovery',
              status: 'syncing',
              title: 'Recovering the submitted deployment',
              description:
                'A transaction hash is stored in this browser. The backend will reconcile and independently verify it before any new wallet transaction is allowed.',
            },
          });

          await completeBackendDeployment({
            transactionHash,
            deploymentAttemptUid,
            metadata: localRecovery.metadata || recoveryMetadata,
          });
          return;
        }

        // Wallet validation is required only when a new transaction may be sent. Submitted
        // attempts above resume through the backend without reopening MetaMask.
        if (!wallet.isConnected || !wallet.connector) {
          throw new Error('Connect the approved organization wallet before deployment.');
        }
        if (!wallet.isCorrectNetwork) {
          throw new Error(`Switch the connected wallet to ${wallet.requiredChain.name}.`);
        }
        if (wallet.address?.toLowerCase() !== approvedWallet.toLowerCase()) {
          throw new Error('Reconnect with the approved organization wallet before deployment.');
        }

        if (!deploymentAttemptUid) {
          const idempotencyKey =
            normalizeDeploymentIdempotencyKey(idempotencyKeyRef.current) ||
            createDeploymentIdempotencyKey({
              tokenUid: cachedTokenUid,
            });
          idempotencyKeyRef.current = idempotencyKey;

          const createdAttempt = await tokenApi.createDeploymentAttempt({
            chainId: wallet.requiredChain.id,
            walletAddress: approvedWallet,
            idempotencyKey,
            networkName: wallet.requiredChain.name,
            metadata: {
              tokenUid: cachedTokenUid,
              client: 'trex-capital-market-ui',
            },
          });

          deploymentAttemptUid = getAttemptUid(createdAttempt);
          attemptStatus = normalizeAttemptStatus(createdAttempt);

          if (
            !deploymentAttemptUid ||
            attemptStatus !== 'pending' ||
            createdAttempt?.canInitiateTransaction !== true
          ) {
            const invalidAttempt = new Error(
              'The backend did not authorize the wallet transaction for this deployment attempt.',
            );
            invalidAttempt.code = 'DEPLOYMENT_ATTEMPT_NOT_AUTHORIZED';
            throw invalidAttempt;
          }

          setBackendState({
            status: 'deploymentPending',
            isDraft: false,
            isLocked: true,
            error: '',
          });
          setDeployment({
            deploymentAttemptUid,
            attemptStatus,
            idempotencyKey,
          });
          queryClient.setQueryData(myTokenQueryKey(tokenRecord.userKey), (current) => ({
            ...(current || cachedToken || {}),
            status: 'deploymentPending',
            isDraft: false,
          }));
        }

        const chainResult = await deployTrexSuite({
          connector: wallet.connector,
          connectedAddress: wallet.address,
          organization,
          tokenInformation,
          identityClaims,
          compliance,
          agents,
          deploymentConfig: env.trex,
          onStageChange: (activeStage, values = {}) => {
            if (values.transactionHash) {
              transactionSubmitted = true;
              transactionHash = assertValidTransactionHash(values.transactionHash);
            }
            setDeployment({
              activeStage,
              ...(values.transactionHash
                ? {
                    deploymentAttemptUid,
                    attemptStatus: 'submitted',
                    transactionHash,
                    requestStartedAt: new Date().toISOString(),
                  }
                : {}),
            });
          },
          onWalletAction: (walletAction) => {
            setDeployment({ walletAction });
            if (walletAction?.status === 'awaiting-signature') {
              toast.info(walletAction.title, {
                id: 'token-wallet-action',
                description: walletAction.description,
                duration: 12_000,
              });
            }
          },
          onTransactionSubmitted: async ({
            transactionHash: submittedHash,
            network,
            chainId,
          }) => {
            transactionSubmitted = true;
            transactionHash = assertValidTransactionHash(submittedHash);
            const submittedMetadata = {
              ...recoveryMetadata,
              network,
              chainId,
              deploymentAttemptUid,
              idempotencyKey: idempotencyKeyRef.current,
              attemptStatus: 'submitted',
            };

            saveRecoveryRecordSafely('submitted', {
              transactionHash,
              user: authUser,
              issuerWallet: approvedWallet,
              tokenUid: cachedTokenUid,
              metadata: submittedMetadata,
            });

            try {
              await tokenApi.markDeploymentAttemptSubmitted(deploymentAttemptUid, {
                transactionHash,
                chainId,
                walletAddress: approvedWallet,
              });
            } catch (submissionError) {
              throw createBackendSyncError(
                submissionError,
                transactionHash,
                "We've detected an existing blockchain deployment and are syncing it with your account. There's no need to deploy again. This should only take a few moments.",
              );
            }

            setDeployment({
              deploymentAttemptUid,
              attemptStatus: 'submitted',
              transactionHash,
              requestStartedAt: new Date().toISOString(),
            });
          },
          onDeploymentConfirmed: ({
            transactionHash: confirmedTransactionHash,
            network,
            chainId,
            blockNumber,
          }) => {
            const confirmedHash = assertValidTransactionHash(confirmedTransactionHash);
            transactionSubmitted = true;
            transactionHash = confirmedHash;
            const confirmedMetadata = {
              ...recoveryMetadata,
              network,
              chainId,
              blockNumber,
              deployedAt: new Date().toISOString(),
              deploymentAttemptUid,
              idempotencyKey: idempotencyKeyRef.current,
              attemptStatus: 'confirming',
            };
            const recoveryRecord = saveRecoveryRecordSafely('confirmed', {
              transactionHash: confirmedHash,
              user: authUser,
              issuerWallet: approvedWallet,
              tokenUid: cachedTokenUid,
              metadata: confirmedMetadata,
            });

            setDeployment({
              deploymentAttemptUid,
              attemptStatus: 'confirming',
              transactionHash: confirmedHash,
              requestStartedAt: new Date().toISOString(),
              pendingSync: {
                transactionHash: confirmedHash,
                deploymentAttemptUid,
                metadata: recoveryRecord.metadata,
              },
            });
          },
        });

        transactionSubmitted = true;
        transactionHash = assertValidTransactionHash(chainResult.transactionHash);
        const metadata = {
          ...recoveryMetadata,
          network: chainResult.network,
          chainId: chainResult.chainId,
          blockNumber: chainResult.blockNumber,
          deployedAt: chainResult.deployedAt,
          deploymentAttemptUid,
          idempotencyKey: idempotencyKeyRef.current,
          attemptStatus: 'confirming',
        };

        const recoveryRecord = saveRecoveryRecordSafely('confirmed', {
          transactionHash,
          user: authUser,
          issuerWallet: approvedWallet,
          tokenUid: cachedTokenUid,
          metadata,
        });
        const pendingSync = {
          transactionHash,
          deploymentAttemptUid,
          metadata: recoveryRecord?.metadata || metadata,
        };

        const transfersActivated = ['success', 'already-unpaused'].includes(
          chainResult.unpause?.status,
        );
        setDeployment({
          activeStage: 4,
          deploymentAttemptUid,
          attemptStatus: 'confirming',
          transactionHash,
          pendingSync,
          retryMode: 'backend-sync',
          walletAction: {
            key: 'backend-sync',
            status: 'syncing',
            title: transfersActivated
              ? 'Both wallet confirmations are complete'
              : 'Token created — transfer activation is still pending',
            description: transfersActivated
              ? 'The backend is independently verifying the confirmed deployment transaction before finalizing your token.'
              : 'The token creation transaction is confirmed, but transfers remain paused. The backend will still verify and finalize the deployment safely.',
          },
        });

        if (!transfersActivated) {
          toast.warning('Token created, but transfers are still paused', {
            id: 'token-transfer-activation-pending',
            description:
              'The deployment will be finalized, but an authorized Token Agent must unpause the token before investors can transfer it.',
            duration: 10_000,
          });
        }

        await completeBackendDeployment(pendingSync);
      } catch (caughtError) {
        let error = caughtError;
        console.error('Token deployment failed', error);
        const hash = error?.transactionHash || transactionHash;
        const submitted = Boolean(error?.transactionSubmitted || transactionSubmitted || hash);

        // After broadcast, the backend owns the final receipt decision. This also handles
        // local receipt timeouts and reverted transactions without allowing a duplicate send.
        if (submitted && hash && deploymentAttemptUid && !error?.syncOnly) {
          try {
            await completeBackendDeployment({
              transactionHash: hash,
              deploymentAttemptUid,
              metadata: recoveryMetadata,
            });
            return;
          } catch (verificationError) {
            error = verificationError;
          }
        }

        if (deploymentAttemptUid && !submitted) {
          const failureStatus = isWalletRejection(error) ? 'wallet_rejected' : 'cancelled';
          try {
            await tokenApi.failDeploymentAttempt(deploymentAttemptUid, {
              status: failureStatus,
              errorCode:
                failureStatus === 'wallet_rejected'
                  ? 'USER_REJECTED_REQUEST'
                  : getBackendErrorCode(error) || 'PRE_BROADCAST_FAILURE',
              errorMessage:
                error?.shortMessage || error?.message || 'The wallet transaction was not broadcast.',
            });
            attemptStatus = failureStatus;
            setBackendState({
              status: 'draft',
              isDraft: true,
              isLocked: false,
            });
            queryClient.invalidateQueries({ queryKey: myTokenQueryKey(tokenRecord.userKey) });
            idempotencyKeyRef.current = '';
          } catch (closeError) {
            console.error('Unable to close the pre-broadcast deployment attempt', closeError);
          }
        }

        const backendErrorCode = getBackendErrorCode(error);
        const terminalVerificationFailure =
          backendErrorCode === 'TOKEN_DEPLOYMENT_VERIFICATION_FAILED';
        if (terminalVerificationFailure) {
          attemptStatus = 'failed';
          if (hash) pendingDeploymentService.clear(hash);
          setBackendState({
            status: 'deploymentFailed',
            isDraft: false,
            isLocked: true,
          });
          queryClient.invalidateQueries({ queryKey: myTokenQueryKey(tokenRecord.userKey) });
        }

        const presentation = deploymentErrorPresentation(error, submitted);
        const syncOnly = Boolean(error?.syncOnly || presentation.retryMode === 'backend-sync');
        const existingDeploymentSync =
          presentation.retryMode === EXISTING_DEPLOYMENT_SYNC_RETRY_MODE;
        const canRetry = presentation.canRetry ?? (!submitted || Boolean(error?.confirmedRevert));

        setDeployment({
          status: existingDeploymentSync ? 'processing' : 'error',
          activeStage: existingDeploymentSync ? 4 : submitted ? 4 : deployment.activeStage,
          deploymentAttemptUid,
          attemptStatus: terminalVerificationFailure
            ? 'failed'
            : submitted
              ? 'submitted'
              : attemptStatus,
          error: presentation.message,
          transactionHash: hash || '',
          canRetry,
          retryMode: existingDeploymentSync
            ? EXISTING_DEPLOYMENT_SYNC_RETRY_MODE
            : syncOnly
              ? 'backend-sync'
              : 'deployment',
          pendingSync:
            syncOnly && hash
              ? {
                  transactionHash: hash,
                  deploymentAttemptUid,
                  metadata: {
                    ...recoveryMetadata,
                    deploymentAttemptUid,
                  },
                }
              : null,
          requestStartedAt: submitted || existingDeploymentSync ? new Date().toISOString() : null,
          walletAction: existingDeploymentSync || syncOnly ? null : deployment.walletAction,
        });

        toast.dismiss('token-deployment-error');
        if (existingDeploymentSync) {
          toast.info(presentation.title, {
            id: 'token-deployment-error',
            description: presentation.message,
            duration: 8_000,
          });
        } else {
          toast.error(presentation.title, {
            id: 'token-deployment-error',
            description: presentation.message,
            duration: 10_000,
          });
        }
      } finally {
        attemptInFlightRef.current = false;
      }
    };

    deploy();
  }, [
    agents,
    authUser,
    backend.hydrated,
    backend.tokenUid,
    completeBackendDeployment,
    compliance,
    deployment.activeStage,
    deployment.attemptStatus,
    deployment.deploymentAttemptUid,
    deployment.idempotencyKey,
    deployment.status,
    deployment.walletAction,
    identityClaims,
    navigate,
    organization,
    organizationLoading,
    queryClient,
    setBackendState,
    setDeployment,
    tokenBootstrap.isLoading,
    tokenInformation,
    tokenRecord.token,
    tokenRecord.tokenUid,
    tokenRecord.userKey,
    wallet.address,
    wallet.connector,
    wallet.isConnected,
    wallet.isCorrectNetwork,
    wallet.requiredChain.id,
    wallet.requiredChain.name,
  ]);


  useEffect(() => {
    if (
      deployment.retryMode !== EXISTING_DEPLOYMENT_SYNC_RETRY_MODE ||
      deployment.status !== 'processing'
    ) {
      return undefined;
    }

    let cancelled = false;
    let timerId;
    let pollCount = 0;

    const scheduleNextCheck = () => {
      if (cancelled) return;
      timerId = window.setTimeout(checkExistingDeployment, FINALIZATION_POLL_INTERVAL_MS);
    };

    const checkExistingDeployment = async () => {
      pollCount += 1;

      try {
        const [activeResult, tokenResult] = await Promise.allSettled([
          tokenApi.getActiveDeploymentAttempt(),
          tokenApi.getMyToken(),
        ]);

        if (cancelled) return;

        const activeState =
          activeResult.status === 'fulfilled' ? activeResult.value : null;
        const latestToken = tokenResult.status === 'fulfilled' ? tokenResult.value : null;
        const activeAttempt = activeState?.attempt || null;
        const deploymentAttemptUid = getAttemptUid(activeAttempt);
        const transactionHash =
          activeState?.deployTransactionHash ||
          activeState?.transactionHash ||
          activeAttempt?.transactionHash ||
          getDeploymentTransactionHash(latestToken);
        const tokenUid =
          latestToken?.tokenUid ||
          latestToken?.uid ||
          latestToken?.id ||
          backend.tokenUid ||
          tokenRecord.tokenUid;
        const latestStatus = String(
          latestToken?.status || latestToken?.deployment?.status || '',
        )
          .trim()
          .toLowerCase();
        const deploymentDetected = Boolean(
          activeState?.tokenDeployed ||
            transactionHash ||
            ['deployed', 'active', 'success', 'completed'].includes(latestStatus),
        );

        if (transactionHash) {
          await completeBackendDeployment({
            transactionHash,
            deploymentAttemptUid,
            metadata: {
              tokenUid,
              tokenName:
                latestToken?.tokenName || latestToken?.name || tokenInformation.name,
              symbol:
                latestToken?.tokenSymbol || latestToken?.symbol || tokenInformation.symbol,
              network: wallet.requiredChain.name,
              chainId: wallet.requiredChain.id,
            },
          });
          return;
        }

        if (deploymentDetected && tokenUid) {
          queryClient.setQueryData(myTokenQueryKey(tokenRecord.userKey), latestToken);
          navigate(ROUTES.tokenDetails(tokenUid), { replace: true });
          return;
        }
      } catch (error) {
        console.warn('Existing deployment synchronization check failed.', error);
      }

      if (cancelled) return;

      if (pollCount >= FINALIZATION_MAX_POLLS) {
        setDeployment({
          status: 'error',
          activeStage: 4,
          error: EXISTING_DEPLOYMENT_SYNC_MESSAGE,
          canRetry: true,
          retryMode: EXISTING_DEPLOYMENT_SYNC_RETRY_MODE,
          walletAction: null,
        });
        return;
      }

      scheduleNextCheck();
    };

    checkExistingDeployment();

    return () => {
      cancelled = true;
      if (timerId) window.clearTimeout(timerId);
    };
  }, [
    backend.tokenUid,
    completeBackendDeployment,
    deployment.retryMode,
    deployment.status,
    navigate,
    queryClient,
    setDeployment,
    tokenInformation.name,
    tokenInformation.symbol,
    tokenRecord.tokenUid,
    tokenRecord.userKey,
    wallet.requiredChain.id,
    wallet.requiredChain.name,
  ]);

  const retry = async () => {
    if (!deployment.canRetry) return;

    if (deployment.retryMode === EXISTING_DEPLOYMENT_SYNC_RETRY_MODE) {
      setDeployment({
        status: 'processing',
        activeStage: 4,
        error: EXISTING_DEPLOYMENT_SYNC_MESSAGE,
        canRetry: false,
        retryMode: EXISTING_DEPLOYMENT_SYNC_RETRY_MODE,
        walletAction: null,
      });
      return;
    }

    if (deployment.retryMode === 'bootstrap') {
      setDeployment({
        status: 'processing',
        activeStage: 0,
        error: '',
        canRetry: false,
        walletAction: {
          key: 'deployment-bootstrap',
          status: 'syncing',
          title: 'Reloading token deployment data',
          description:
            'The token, organization, and deployment status are being restored before any wallet request can open.',
        },
      });

      const result = await tokenBootstrap.refresh();
      if (result.error) {
        setDeployment({
          status: 'error',
          activeStage: 0,
          error: getTokenApiErrorMessage(
            result.error,
            'The token deployment data could not be restored from the backend.',
          ),
          canRetry: true,
          retryMode: 'bootstrap',
          walletAction: null,
        });
        return;
      }

      startedRef.current = false;
      return;
    }

    if (deployment.retryMode === 'backend-sync') {
      const pending = deployment.pendingSync || {
        transactionHash: deployment.transactionHash,
        deploymentAttemptUid: deployment.deploymentAttemptUid,
        metadata: {},
      };

      try {
        const transactionHash = assertValidTransactionHash(pending.transactionHash);
        let deploymentAttemptUid =
          pending.deploymentAttemptUid || deployment.deploymentAttemptUid || '';
        const approvedWallet = organization.walletAddress || tokenInformation.treasuryWallet;

        setDeployment({
          status: 'processing',
          activeStage: 4,
          error: '',
          canRetry: false,
          walletAction: {
            key: 'backend-sync',
            status: 'syncing',
            title: 'Retrying backend verification',
            description:
              'The backend will resume from the existing transaction hash. MetaMask will not open and no additional gas will be charged.',
          },
        });

        const activeState = await tokenApi.getActiveDeploymentAttempt();
        const activeAttempt = activeState?.attempt || null;
        deploymentAttemptUid = getAttemptUid(activeAttempt) || deploymentAttemptUid;
        const activeStatus = normalizeAttemptStatus(activeAttempt);
        const backendHash = activeAttempt?.transactionHash
          ? assertValidTransactionHash(activeAttempt.transactionHash)
          : transactionHash;

        if (activeAttempt && activeStatus === 'pending') {
          await tokenApi.markDeploymentAttemptSubmitted(deploymentAttemptUid, {
            transactionHash: backendHash,
            chainId: wallet.requiredChain.id,
            walletAddress: approvedWallet,
          });
        }

        const recoveryRecord = saveRecoveryRecordSafely('submitted', {
          transactionHash: backendHash,
          user: authUser,
          issuerWallet: approvedWallet,
          tokenUid: pending.metadata?.tokenUid || backend.tokenUid,
          metadata: {
            ...(pending.metadata || {}),
            deploymentAttemptUid,
            attemptStatus: activeStatus || 'submitted',
          },
        });

        await completeBackendDeployment({
          transactionHash: recoveryRecord.transactionHash,
          deploymentAttemptUid,
          metadata: recoveryRecord.metadata,
        });
      } catch (error) {
        console.error('Backend deployment synchronization failed', error);
        const terminalVerificationFailure =
          getBackendErrorCode(error) === 'TOKEN_DEPLOYMENT_VERIFICATION_FAILED';
        if (terminalVerificationFailure) {
          pendingDeploymentService.clear(pending.transactionHash);
          setBackendState({
            status: 'deploymentFailed',
            isDraft: false,
            isLocked: true,
          });
          queryClient.invalidateQueries({ queryKey: myTokenQueryKey(tokenRecord.userKey) });
        }
        const presentation = deploymentErrorPresentation(error, true);
        toast.error(presentation.title, {
          id: 'token-deployment-sync-error',
          description: presentation.message,
          duration: 8_000,
        });
        setDeployment({
          status: 'error',
          activeStage: 4,
          error: presentation.message,
          transactionHash: pending.transactionHash,
          deploymentAttemptUid:
            pending.deploymentAttemptUid || deployment.deploymentAttemptUid || '',
          attemptStatus: terminalVerificationFailure ? 'failed' : deployment.attemptStatus,
          requestStartedAt: new Date().toISOString(),
          canRetry: presentation.canRetry !== false,
          retryMode: 'backend-sync',
          pendingSync: pending,
          walletAction: null,
        });
      }
      return;
    }

    startedRef.current = false;
    idempotencyKeyRef.current = '';
    setDeployment({
      status: 'processing',
      activeStage: 0,
      deploymentAttemptUid: '',
      attemptStatus: '',
      idempotencyKey: '',
      error: '',
      transactionHash: '',
      requestStartedAt: null,
      canRetry: false,
      retryMode: '',
      pendingSync: null,
      walletAction: null,
    });
  };

  const walletActionStatus = {
    'awaiting-signature': 'Open MetaMask',
    confirming: 'Waiting for Sepolia',
    confirmed: 'Confirmed',
    failed: 'Needs attention',
    syncing: 'No wallet action required',
  }[deployment.walletAction?.status] || 'In progress';

  const explorerBase = wallet.requiredChain.blockExplorers?.default?.url || '';
  const transactionExplorer =
    deployment.transactionHash && explorerBase
      ? `${explorerBase}/tx/${deployment.transactionHash}`
      : undefined;
  const backendSyncPending =
    deployment.retryMode === 'backend-sync' && Boolean(deployment.transactionHash);
  const existingDeploymentSyncPending =
    deployment.retryMode === EXISTING_DEPLOYMENT_SYNC_RETRY_MODE;
  const showDeploymentError = deployment.status === 'error' && !existingDeploymentSyncPending;

  return (
    <div className="deployment-page">
      <section className="deployment-card">
        <div className="deployment-card__hero">
          <span
            className={
              showDeploymentError
                ? 'deployment-loader deployment-loader--error'
                : 'deployment-loader'
            }
          >
            {showDeploymentError ? (
              <AlertTriangle size={28} />
            ) : (
              <ShieldCheck size={28} />
            )}
          </span>
          <span className="eyebrow">Issuer-signed Sepolia deployment</span>
          <h1>
            {existingDeploymentSyncPending
              ? 'Syncing your existing token'
              : deployment.status === 'error'
                ? backendSyncPending
                  ? 'Transaction submitted — verification pending'
                  : 'Deployment needs attention'
                : backendSyncPending
                  ? 'Verifying the deployment transaction'
                  : 'Deploying your T-REX token suite'}
          </h1>
          <p>
            {existingDeploymentSyncPending
              ? "We've detected an existing blockchain deployment and are securely linking it with your account. No additional wallet transaction is required."
              : deployment.status === 'error'
                ? backendSyncPending
                  ? 'The on-chain transaction already exists. Retry only the secure backend verification; another wallet transaction will not be sent.'
                  : 'Review the message below before retrying. Never send a duplicate transaction when a hash is already pending.'
                : backendSyncPending
                  ? 'The backend is independently checking the submitted transaction receipt and T-REX deployment event before the success page is opened.'
                  : 'MetaMask will request two approvals: first to create your token, then to activate token transfers. Keep this page open until Sepolia confirms both actions.'}
          </p>
        </div>

        <DeploymentProgress
          activeStage={deployment.activeStage}
          status={deployment.status}
        />

        {deployment.walletAction ? (
          <div className="deployment-wallet-action" role="status" aria-live="polite">
            <div className="deployment-wallet-action__header">
              <strong>{deployment.walletAction.title}</strong>
              <span>{walletActionStatus}</span>
            </div>
            <p>{deployment.walletAction.description}</p>
            {deployment.walletAction.gasRequired ? (
              <small>MetaMask will show the network gas fee before you approve this transaction.</small>
            ) : null}
          </div>
        ) : null}

        {deployment.error ? (
          <InfoCallout
            title={
              existingDeploymentSyncPending
                ? 'Existing blockchain deployment detected'
                : backendSyncPending
                  ? 'Please wait while we sync your token.'
                  : 'Deployment not completed'
            }
            tone={existingDeploymentSyncPending ? 'info' : 'warning'}
            icon={existingDeploymentSyncPending ? ShieldCheck : AlertTriangle}
          >
            {deployment.error}
          </InfoCallout>
        ) : null}

        {deployment.transactionHash ? (
          <AddressDisplay
            label="Deployment transaction hash"
            address={deployment.transactionHash}
            explorerUrl={transactionExplorer}
            showFullAddress
          />
        ) : null}

        <div className="deployment-card__actions">
          {existingDeploymentSyncPending ? (
            deployment.status === 'error' && deployment.canRetry ? (
              <Button icon={RefreshCcw} onClick={retry}>
                Check sync status
              </Button>
            ) : (
              <span>No new wallet approval or blockchain transaction will be requested.</span>
            )
          ) : deployment.status === 'error' ? (
            <>
              <Button
                variant="secondary"
                icon={ArrowLeft}
                onClick={() => navigate(ROUTES.tokenIssuanceStep('review'))}
              >
                Return to review
              </Button>
              {deployment.canRetry ? (
                <Button icon={RefreshCcw} onClick={retry}>
                  {backendSyncPending ? 'Retry backend verification' : 'Retry deployment'}
                </Button>
              ) : null}
            </>
          ) : (
            <span>
              The issuer wallet pays gas; no platform private key is used in the browser.
            </span>
          )}
        </div>
      </section>
    </div>
  );
}
