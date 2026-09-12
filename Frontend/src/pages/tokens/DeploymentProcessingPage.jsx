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
import {
  activateTrexTransfers,
  deployTrexSuite,
  readTrexTokenPaused,
  recoverTrexDeploymentState,
} from '@/services/trexDeployment.service';
import {
  getPlatformTokenPrice,
  setPlatformTokenPrice,
  waitForPlatformTransactionReceipt,
} from '@/services/blockchain/trexPlatformController.service';
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
  "Please wait while we finish setting up your token. We found an existing token-creation transaction and are linking it to your account. You do not need to create the token again.";

const wait = (milliseconds) =>
  new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });

const canonicalDecimal = (value) => {
  const normalized = String(value ?? '').trim();
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return normalized;
  const [wholeRaw = '0', fractionRaw = ''] = normalized.split('.');
  const whole = wholeRaw.replace(/^0+(?=\d)/, '') || '0';
  const fraction = fractionRaw.replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole;
};

const mandatoryStepError = ({
  message,
  code,
  failedStep,
  deploymentTransactionHash,
  failedTransactionHash = '',
  tokenAddress = '',
  onChainPaused,
  cause,
}) => {
  const error = new Error(message, cause ? { cause } : undefined);
  error.code = code;
  error.failedStep = failedStep;
  error.transactionHash = deploymentTransactionHash;
  error.failedTransactionHash = failedTransactionHash;
  error.tokenAddress = tokenAddress;
  error.onChainPaused = onChainPaused;
  error.transactionSubmitted = true;
  error.deploymentConfirmed = true;
  error.mandatoryStepPending = true;
  return error;
};

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
        'The asset setup was submitted, but the final verification could not continue.',
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

  if (error?.code === 'TOKEN_CONFIGURATION_PENDING') {
    return {
      title: 'Transfer activation is still confirming',
      message: error.message,
      canRetry: true,
      retryMode: 'configuration',
    };
  }

  if (error?.code === 'TOKEN_CONFIGURATION_FAILED') {
    return {
      title: 'Token created — transfer activation needs attention',
      message: error.message,
      canRetry: true,
      retryMode: 'configuration',
    };
  }

  if (['TOKEN_PRICE_CONFIRMATION_REQUIRED', 'PRICE_CONFIRMATION_PENDING'].includes(error?.code)) {
    return {
      title: 'Token created — price confirmation needs attention',
      message: error.message,
      canRetry: true,
      retryMode: 'price-confirmation',
    };
  }

  if (error?.code === 'DEPLOYMENT_CONFIRMATION_PENDING') {
    return {
      title: 'Token creation is still confirming',
      message: error.message,
      canRetry: true,
      retryMode: 'configuration',
    };
  }

  if (backendCode === 'TOKEN_DEPLOYMENT_VERIFICATION_FAILED') {
    return {
      title: 'Token creation could not be verified',
      message: getTokenApiErrorMessage(
        error,
        'The token-creation transaction did not complete as expected. No additional wallet transaction will be requested automatically.',
      ),
      canRetry: false,
    };
  }

  if (['TRANSACTION_HASH_CONFLICT', 'CONTRACT_ADDRESS_CONFLICT'].includes(backendCode)) {
    return {
      title: 'Token creation needs review',
      message: getTokenApiErrorMessage(
        error,
        'This transaction ID or token address is already linked to another token. Contact support before trying again.',
      ),
      canRetry: false,
    };
  }

  if (backendCode === 'RPC_UNAVAILABLE') {
    return {
      title: 'Asset verification is temporarily unavailable',
      message:
        'The Sepolia network is temporarily unavailable. Retry the status check only; do not send another wallet transaction.',
      canRetry: true,
      retryMode: 'backend-sync',
    };
  }
  if (isWalletTransportFailure(error)) {
    return {
      title: 'Privy wallet did not respond',
      message:
        'Confirm that you are signed in with Privy and your organization secure account is ready, then try creating the asset again. No asset setup action was submitted.',
      canRetry: true,
      retryMode: 'deployment',
    };
  }

  if (error?.code === 'WALLET_NOT_CONNECTED') {
    return {
      title: 'Wallet connection expired',
      message:
        'The organization’s Privy secure account is unavailable in this browser session. Sign in with Privy and try again.',
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
        'The recorded transaction ID does not match the confirmed wallet transaction. The token status was not updated for your protection.',
      canRetry: false,
    };
  }

  if (error?.syncOnly || error?.code === 'BACKEND_DEPLOYMENT_SYNC_FAILED') {
    return {
      title: 'Transaction submitted — verification pending',
      message:
        error?.message ||
        'Your asset creation has already been submitted. Retry only the status check; do not submit it again.',
      canRetry: true,
      retryMode: 'backend-sync',
    };
  }

  if (isDuplicateTokenError(error)) {
    return {
      title: 'Existing token creation found',
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
        'One or more token settings could not be validated. Return to review and correct the highlighted step.',
      ),
    };
  }
  if (error?.response?.status === 403) {
    return {
      title: 'Token creation not authorized',
      message: 'Only a verified issuer with an approved organization can create a token.',
      canRetry: false,
    };
  }
  if (error?.response?.status === 409) {
    return {
      title: 'Token creation already in progress',
      message:
        'This token is already being created or verified. Refresh its status before trying again.',
      canRetry: false,
    };
  }
  if (error?.code === 'ECONNABORTED') {
    return {
      title: transactionSubmitted ? 'Status check timed out' : 'Token verification timed out',
      message: transactionSubmitted
        ? 'The asset creation was confirmed, but the final status check timed out. Retry the status check only.'
        : 'Token validation timed out. Refresh the token status before trying again.',
      canRetry: true,
      retryMode: transactionSubmitted ? 'backend-sync' : 'deployment',
    };
  }

  return {
    title: transactionSubmitted ? 'Token creation could not be confirmed' : 'Token creation not completed',
    message: getTokenApiErrorMessage(
      error,
      error?.message || 'The token could not be created.',
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
        throw new Error('The token status could not be confirmed. Please try again.');
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
      'The recorded transaction ID differs from the confirmed wallet transaction.',
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
  const supplyPricing = useTokenIssuanceStore((state) => state.supplyPricing);
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
  const retryInFlightRef = useRef(false);
  const idempotencyKeyRef = useRef(
    normalizeDeploymentIdempotencyKey(deployment.idempotencyKey),
  );
  useDocumentTitle('Creating Token');

  const completeBackendDeployment = useCallback(
    async ({ transactionHash, deploymentAttemptUid, metadata = {} }) => {
      const confirmedHash = assertValidTransactionHash(transactionHash);
      const configuredTokenPrice = String(supplyPricing?.initialPrice || '').trim();
      const priceConfirmed = !configuredTokenPrice ||
        ['success', 'already-confirmed'].includes(String(metadata?.priceSetup?.status || ''));
      if (
        metadata?.configurationStatus !== 'ready_to_finalize' ||
        metadata?.onChainPaused !== false ||
        !priceConfirmed
      ) {
        throw mandatoryStepError({
          message:
            'The asset record cannot be finalized until transfer access and the required price are confirmed.',
          code: !priceConfirmed
            ? 'TOKEN_PRICE_CONFIRMATION_REQUIRED'
            : 'TOKEN_CONFIGURATION_FAILED',
          failedStep: !priceConfirmed ? 'price-confirmation' : 'activate-transfers',
          deploymentTransactionHash: confirmedHash,
          failedTransactionHash:
            metadata?.failedTransactionHash ||
            metadata?.priceSetup?.transactionHash ||
            metadata?.unpauseTransactionHash ||
            '',
          tokenAddress: metadata?.tokenAddress || metadata?.contracts?.token || '',
          onChainPaused: metadata?.onChainPaused,
        });
      }
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
            title: 'Token verification is in progress',
            description:
              'The transaction is already on Sepolia. We are checking its confirmation and token-creation result; no additional Privy approval will be requested.',
          },
        });

        if (pollIndex === FINALIZATION_MAX_POLLS - 1) {
          const pendingError = createBackendSyncError(
            null,
            confirmedHash,
            'The token-creation transaction is still awaiting confirmation. Check the status again in a moment; do not send another wallet transaction.',
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

      toast.success('Asset setup completed', {
        id: 'token-deployment-recorded',
        description:
          'All required setup steps were confirmed and the final asset status was verified.',
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
      supplyPricing?.initialPrice,
      tokenRecord.tokenUid,
      tokenRecord.userKey,
    ],
  );

  const completeMandatoryConfiguration = useCallback(
    async ({ transactionHash, deploymentAttemptUid, metadata = {} }) => {
      const deployHash = assertValidTransactionHash(transactionHash);
      const approvedWallet = organization.walletAddress || tokenInformation.treasuryWallet;
      if (!approvedWallet) {
        throw new Error('The approved organization secure account could not be loaded.');
      }

      setDeployment({
        status: 'processing',
        activeStage: 3,
        deploymentAttemptUid,
        transactionHash: deployHash,
        canRetry: false,
        retryMode: 'configuration',
        walletAction: {
          key: 'configuration-reconcile',
          status: 'syncing',
          title: 'Checking the confirmed asset status',
          description:
            'We are checking the confirmed asset status before deciding whether another Privy confirmation is needed.',
        },
      });

      const recovered = await recoverTrexDeploymentState({
        transactionHash: deployHash,
        deploymentConfig: env.trex,
      });
      const tokenAddress = recovered.tokenAddress;
      let nextMetadata = {
        ...metadata,
        tokenAddress,
        contracts: recovered.contracts,
        blockNumber: recovered.blockNumber || metadata.blockNumber,
        deploymentAttemptUid,
        attemptStatus: 'confirmed',
        configurationStatus: 'configuration_pending',
        onChainPaused: recovered.paused,
      };

      saveRecoveryRecordSafely('confirmed', {
        transactionHash: deployHash,
        user: authUser,
        issuerWallet: approvedWallet,
        tokenUid: metadata.tokenUid || backend.tokenUid || tokenRecord.tokenUid,
        metadata: nextMetadata,
      });

      const previousUnpauseHash =
        nextMetadata.unpauseTransactionHash ||
        (nextMetadata.failedStep === 'activate-transfers'
          ? nextMetadata.failedTransactionHash
          : '');

      let transferResult;
      try {
        transferResult = await activateTrexTransfers({
          connector: wallet.connector,
          connectedAddress: wallet.address,
          issuerWalletAddress: approvedWallet,
          tokenAddress,
          deploymentTransactionHash: deployHash,
          contracts: recovered.contracts,
          previousTransactionHash: previousUnpauseHash,
          onWalletAction: (walletAction) => setDeployment({ walletAction }),
        });
      } catch (error) {
        const paused =
          typeof error?.onChainPaused === 'boolean'
            ? error.onChainPaused
            : await readTrexTokenPaused({ tokenAddress }).catch(() => null);
        nextMetadata = {
          ...nextMetadata,
          configurationStatus:
            error?.code === 'TOKEN_CONFIGURATION_PENDING'
              ? 'configuration_pending'
              : 'configuration_failed',
          onChainPaused: paused,
          failedStep: 'activate-transfers',
          failedTransactionHash:
            error?.failedTransactionHash || previousUnpauseHash || '',
          unpauseTransactionHash:
            error?.failedTransactionHash || previousUnpauseHash || '',
          configurationError: error?.message || 'Transfer activation did not complete.',
        };
        saveRecoveryRecordSafely('confirmed', {
          transactionHash: deployHash,
          user: authUser,
          issuerWallet: approvedWallet,
          tokenUid: nextMetadata.tokenUid,
          metadata: nextMetadata,
        });
        throw error;
      }

      const pausedAfterActivation = await readTrexTokenPaused({ tokenAddress });
      if (pausedAfterActivation) {
        const error = mandatoryStepError({
          message:
            'The transfer activation could not be verified. The token still reports paused, so it has not been finalized.',
          code: 'TOKEN_CONFIGURATION_FAILED',
          failedStep: 'activate-transfers',
          deploymentTransactionHash: deployHash,
          failedTransactionHash: transferResult?.transactionHash || previousUnpauseHash,
          tokenAddress,
          onChainPaused: true,
        });
        nextMetadata = {
          ...nextMetadata,
          configurationStatus: 'configuration_failed',
          onChainPaused: true,
          failedStep: 'activate-transfers',
          failedTransactionHash: error.failedTransactionHash,
          unpauseTransactionHash: error.failedTransactionHash,
          configurationError: error.message,
        };
        saveRecoveryRecordSafely('confirmed', {
          transactionHash: deployHash,
          user: authUser,
          issuerWallet: approvedWallet,
          tokenUid: nextMetadata.tokenUid,
          metadata: nextMetadata,
        });
        throw error;
      }

      nextMetadata = {
        ...nextMetadata,
        configurationStatus: 'configuration_confirmed',
        onChainPaused: false,
        unpauseTransactionHash:
          transferResult?.transactionHash || previousUnpauseHash || '',
        failedStep: '',
        failedTransactionHash: '',
        configurationError: '',
      };
      saveRecoveryRecordSafely('confirmed', {
        transactionHash: deployHash,
        user: authUser,
        issuerWallet: approvedWallet,
        tokenUid: nextMetadata.tokenUid,
        metadata: nextMetadata,
      });

      const configuredTokenPrice = String(
        supplyPricing?.initialPrice ||
          tokenRecord.token?.currentTokenPrice ||
          tokenRecord.token?.initialTokenPrice ||
          '',
      ).trim();

      if (configuredTokenPrice) {
        setDeployment({
          activeStage: 3,
          walletAction: {
            key: 'activate-token-price',
            step: 3,
            total: 3,
            status: 'syncing',
            title: 'Checking the current token price',
            description:
              'We are reading the live contract price first so a retry never sends a duplicate transaction.',
            gasRequired: false,
          },
        });

        let livePrice;
        try {
          livePrice = await getPlatformTokenPrice({
            tokenAddress,
            chainId: wallet.requiredChain.id,
          });
        } catch (cause) {
          const error = mandatoryStepError({
            message:
              'The token was created and transfers are active, but the current price could not be verified. Retry the status check before sending another transaction.',
            code: 'TOKEN_PRICE_CONFIRMATION_REQUIRED',
            failedStep: 'price-confirmation',
            deploymentTransactionHash: deployHash,
            tokenAddress,
            onChainPaused: false,
            cause,
          });
          nextMetadata = {
            ...nextMetadata,
            configurationStatus: 'price_confirmation_required',
            failedStep: 'price-confirmation',
            configurationError: error.message,
            priceSetup: {
              ...(nextMetadata.priceSetup || {}),
              status: 'verification-pending',
              error: error.message,
            },
          };
          saveRecoveryRecordSafely('confirmed', {
            transactionHash: deployHash,
            user: authUser,
            issuerWallet: approvedWallet,
            tokenUid: nextMetadata.tokenUid,
            metadata: nextMetadata,
          });
          throw error;
        }

        const desiredPrice = canonicalDecimal(configuredTokenPrice);
        let livePriceValue = canonicalDecimal(livePrice.currentTokenPrice);
        const previousPriceHash =
          nextMetadata.priceSetup?.transactionHash ||
          (nextMetadata.failedStep === 'price-confirmation'
            ? nextMetadata.failedTransactionHash
            : '');

        if (livePriceValue !== desiredPrice && /^0x[a-fA-F0-9]{64}$/.test(previousPriceHash)) {
          try {
            await waitForPlatformTransactionReceipt({
              txHash: previousPriceHash,
              chainId: wallet.requiredChain.id,
              timeout: 45_000,
            });
            livePrice = await getPlatformTokenPrice({
              tokenAddress,
              chainId: wallet.requiredChain.id,
            });
            livePriceValue = canonicalDecimal(livePrice.currentTokenPrice);
            if (livePriceValue !== desiredPrice) {
              throw mandatoryStepError({
                message:
                  'The previous price transaction succeeded, but the live token price does not match the configured price. No new transaction was sent.',
                code: 'TOKEN_PRICE_CONFIRMATION_REQUIRED',
                failedStep: 'price-confirmation',
                deploymentTransactionHash: deployHash,
                failedTransactionHash: previousPriceHash,
                tokenAddress,
                onChainPaused: false,
              });
            }
          } catch (cause) {
            if (cause?.code === 'TOKEN_PRICE_CONFIRMATION_REQUIRED') throw cause;
            if (!cause?.confirmedRevert) {
              const error = mandatoryStepError({
                message:
                  'The previous price transaction is still being confirmed. Wait for it before retrying; no new transaction was sent.',
                code: 'PRICE_CONFIRMATION_PENDING',
                failedStep: 'price-confirmation',
                deploymentTransactionHash: deployHash,
                failedTransactionHash: previousPriceHash,
                tokenAddress,
                onChainPaused: false,
                cause,
              });
              nextMetadata = {
                ...nextMetadata,
                configurationStatus: 'price_confirmation_required',
                failedStep: 'price-confirmation',
                failedTransactionHash: previousPriceHash,
                configurationError: error.message,
                priceSetup: {
                  ...(nextMetadata.priceSetup || {}),
                  status: 'pending',
                  transactionHash: previousPriceHash,
                  error: error.message,
                },
              };
              saveRecoveryRecordSafely('confirmed', {
                transactionHash: deployHash,
                user: authUser,
                issuerWallet: approvedWallet,
                tokenUid: nextMetadata.tokenUid,
                metadata: nextMetadata,
              });
              throw error;
            }
            // A confirmed revert is safe to retry with a new wallet transaction below.
          }
        }

        if (livePriceValue !== desiredPrice) {
          let priceResult;
          try {
            priceResult = await setPlatformTokenPrice({
              connector: wallet.connector,
              connectedAddress: wallet.address,
              issuerWalletAddress: approvedWallet,
              tokenAddress,
              currentTokenPrice: configuredTokenPrice,
              chainId: wallet.requiredChain.id,
              onStep: ({ stage, txHash }) => {
                setDeployment({
                  walletAction: {
                    key: 'activate-token-price',
                    step: 3,
                    total: 3,
                    status:
                      stage === 'price-confirmed'
                        ? 'confirmed'
                        : stage === 'price-confirming'
                          ? 'confirming'
                          : 'awaiting-signature',
                    title:
                      stage === 'price-confirmed'
                        ? 'Token price confirmed'
                        : stage === 'price-confirming'
                          ? 'Confirming token price'
                          : 'Transaction 3 of 3: Confirm token price',
                    description:
                      stage === 'price-confirmed'
                        ? 'The configured price is confirmed.'
                        : stage === 'price-confirming'
                          ? 'Waiting for network confirmation.'
                          : 'Approve this transaction to make the configured price active for purchases and redemptions.',
                    transactionHash: txHash || '',
                    gasRequired: true,
                  },
                });
              },
            });
          } catch (cause) {
            const failedHash = cause?.transactionHash || '';
            const error = mandatoryStepError({
              message:
                cause?.code === 'PRICE_CONFIRMATION_PENDING'
                  ? 'The price transaction was submitted and is still confirming. Do not submit another one yet.'
                  : 'The token was created, but the required price confirmation did not complete. Retry this step before the token is finalized.',
              code:
                cause?.code === 'PRICE_CONFIRMATION_PENDING'
                  ? 'PRICE_CONFIRMATION_PENDING'
                  : 'TOKEN_PRICE_CONFIRMATION_REQUIRED',
              failedStep: 'price-confirmation',
              deploymentTransactionHash: deployHash,
              failedTransactionHash: failedHash,
              tokenAddress,
              onChainPaused: false,
              cause,
            });
            nextMetadata = {
              ...nextMetadata,
              configurationStatus: 'price_confirmation_required',
              failedStep: 'price-confirmation',
              failedTransactionHash: failedHash,
              configurationError: error.message,
              priceSetup: {
                status: cause?.confirmedRevert ? 'failed' : failedHash ? 'pending' : 'failed',
                transactionHash: failedHash,
                currentTokenPrice: configuredTokenPrice,
                error: cause?.shortMessage || cause?.message || error.message,
              },
            };
            saveRecoveryRecordSafely('confirmed', {
              transactionHash: deployHash,
              user: authUser,
              issuerWallet: approvedWallet,
              tokenUid: nextMetadata.tokenUid,
              metadata: nextMetadata,
            });
            throw error;
          }

          nextMetadata = {
            ...nextMetadata,
            priceSetup: {
              status: 'success',
              transactionHash: priceResult.txHash,
              priceRaw: priceResult.priceRaw.toString(),
              currentTokenPrice: priceResult.currentTokenPrice,
              paymentToken: priceResult.paymentToken,
              error: '',
            },
          };
        } else {
          nextMetadata = {
            ...nextMetadata,
            priceSetup: {
              status: 'already-confirmed',
              transactionHash: previousPriceHash || '',
              priceRaw: livePrice.priceRaw?.toString?.() || '',
              currentTokenPrice: livePrice.currentTokenPrice,
              paymentToken: livePrice.paymentToken,
              error: '',
            },
          };
        }
      }

      nextMetadata = {
        ...nextMetadata,
        configurationStatus: 'ready_to_finalize',
        onChainPaused: false,
        failedStep: '',
        failedTransactionHash: '',
        configurationError: '',
      };
      saveRecoveryRecordSafely('confirmed', {
        transactionHash: deployHash,
        user: authUser,
        issuerWallet: approvedWallet,
        tokenUid: nextMetadata.tokenUid,
        metadata: nextMetadata,
      });

      setDeployment({
        activeStage: 4,
        deploymentAttemptUid,
        attemptStatus: 'confirming',
        transactionHash: deployHash,
        retryMode: 'backend-sync',
        pendingSync: {
          transactionHash: deployHash,
          deploymentAttemptUid,
          metadata: nextMetadata,
        },
        walletAction: {
          key: 'backend-sync',
          status: 'syncing',
          title: 'All required transactions are confirmed',
          description:
            'Transfers are active and the configured price is confirmed. We are now finalizing the token record.',
        },
      });

      await completeBackendDeployment({
        transactionHash: deployHash,
        deploymentAttemptUid,
        metadata: nextMetadata,
      });
    },
    [
      authUser,
      backend.tokenUid,
      completeBackendDeployment,
      organization.walletAddress,
      setDeployment,
      supplyPricing?.initialPrice,
      tokenInformation.treasuryWallet,
      tokenRecord.token,
      tokenRecord.tokenUid,
      wallet.address,
      wallet.connector,
      wallet.requiredChain.id,
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
        title: 'Checking token status',
        description:
          'Checking for an existing token-creation attempt before any wallet request is opened.',
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
          throw new Error('The approved organization secure account could not be loaded.');
        }

        setDeployment({
          activeStage: 0,
          walletAction: {
            key: 'deployment-authorization',
            status: 'syncing',
            title: 'Preparing token creation',
            description:
              'Checking your token settings, organization permissions, network and Privy wallet before requesting approval.',
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
        const cachedDeploymentHash = getDeploymentTransactionHash(cachedToken);
        const cachedStatus = String(cachedToken?.status || backend.status || '')
          .trim()
          .toLowerCase()
          .replace(/[^a-z]/g, '');
        const isExistingFinalizedRecord = ['deployed', 'completed', 'active'].includes(cachedStatus);
        const requiresMandatoryRecovery = [
          'deploymentconfirmed',
          'configurationpending',
          'configurationfailed',
          'priceconfirmationrequired',
        ].includes(cachedStatus);

        if (cachedDeploymentHash && requiresMandatoryRecovery) {
          await completeMandatoryConfiguration({
            transactionHash: cachedDeploymentHash,
            deploymentAttemptUid: getAttemptUid(activeAttempt),
            metadata: {
              ...recoveryMetadata,
              ...(localRecoveryMatchesToken ? localRecovery?.metadata || {} : {}),
            },
          });
          return;
        }

        // A previously finalized database record can still be repaired safely if an older
        // frontend version finalized after transaction #1. Never create a second token: use
        // the recorded deployment receipt and reconcile the live contract state first.
        if (
          cachedDeploymentHash &&
          isExistingFinalizedRecord &&
          ['configuration', 'price-confirmation'].includes(deployment.retryMode)
        ) {
          await completeMandatoryConfiguration({
            transactionHash: cachedDeploymentHash,
            deploymentAttemptUid: getAttemptUid(activeAttempt),
            metadata: {
              ...recoveryMetadata,
              ...(localRecoveryMatchesToken ? localRecovery?.metadata || {} : {}),
            },
          });
          return;
        }

        if (activeState?.tokenDeployed) {
          const deployedHash =
            activeState.deployTransactionHash ||
            activeState.transactionHash ||
            (localRecoveryMatchesToken ? localRecovery?.transactionHash : '') ||
            getDeploymentTransactionHash(cachedToken);

          if (deployedHash) {
            await completeMandatoryConfiguration({
              transactionHash: deployedHash,
              deploymentAttemptUid: getAttemptUid(activeAttempt),
              metadata: localRecoveryMatchesToken
                ? { ...recoveryMetadata, ...(localRecovery?.metadata || {}) }
                : recoveryMetadata,
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
            throw new Error('The active token-creation attempt belongs to a different network.');
          }
          if (activeWallet && activeWallet !== approvedWallet.toLowerCase()) {
            throw new Error('The active asset-creation attempt belongs to a different organization secure account.');
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
                'A submitted wallet transaction was found, but its transaction ID is not available for recovery.',
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
                title: 'Resuming token creation',
                description:
                  'The transaction ID is already recorded. We will verify it without requesting another Privy approval.',
              },
            });

            await completeMandatoryConfiguration({
              transactionHash,
              deploymentAttemptUid,
              metadata: localMatchesAttempt
                ? { ...recoveryMetadata, ...(localRecovery?.metadata || {}) }
                : recoveryMetadata,
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

            await completeMandatoryConfiguration({
              transactionHash,
              deploymentAttemptUid,
              metadata: localMatchesAttempt
                ? { ...recoveryMetadata, ...(localRecovery?.metadata || {}) }
                : recoveryMetadata,
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
              'An existing token-creation attempt cannot start another wallet transaction.',
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
              title: 'Recovering token creation',
              description:
                'A transaction ID is already stored in this browser. We will verify it before allowing any new wallet transaction.',
            },
          });

          await completeMandatoryConfiguration({
            transactionHash,
            deploymentAttemptUid,
            metadata: { ...recoveryMetadata, ...(localRecovery.metadata || {}) },
          });
          return;
        }

        // Wallet validation is required only when a new transaction may be sent. Submitted
        // attempts above resume through the backend without requesting another Privy approval.
        if (!wallet.isConnected || !wallet.connector) {
          throw new Error('Open the approved Privy secure account before creating the asset.');
        }
        if (!wallet.isCorrectNetwork) {
          throw new Error(`Your Privy secure account needs a quick setup check before asset creation can continue.`);
        }
        if (wallet.address?.toLowerCase() !== approvedWallet.toLowerCase()) {
          throw new Error('Restore the approved Privy secure account before creating the asset.');
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
              'The wallet transaction is not authorized for this token-creation attempt.',
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
                "We found an existing token-creation transaction and are linking it to your account. You do not need to create the token again.",
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
            contracts,
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
              tokenAddress: contracts?.token || '',
              contracts: contracts || {},
              configurationStatus: 'deployment_confirmed',
              onChainPaused: null,
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
          tokenAddress: chainResult.tokenAddress,
          contracts: chainResult.contracts,
          deploymentAttemptUid,
          idempotencyKey: idempotencyKeyRef.current,
          attemptStatus: 'confirmed',
          configurationStatus: 'configuration_confirmed',
          onChainPaused: false,
          unpauseTransactionHash: chainResult.unpause?.transactionHash || '',
        };

        const recoveryRecord = saveRecoveryRecordSafely('confirmed', {
          transactionHash,
          user: authUser,
          issuerWallet: approvedWallet,
          tokenUid: cachedTokenUid,
          metadata,
        });

        await completeMandatoryConfiguration({
          transactionHash,
          deploymentAttemptUid,
          metadata: recoveryRecord?.metadata || metadata,
        });
      } catch (caughtError) {
        let error = caughtError;
        console.error('Token deployment failed', error);
        const hash = error?.transactionHash || transactionHash;
        const submitted = Boolean(error?.transactionSubmitted || transactionSubmitted || hash);

        if (error?.mandatoryStepPending && hash) {
          const existingRecovery = pendingDeploymentService.getForUser(authUser);
          const failedStep = error?.failedStep || existingRecovery?.metadata?.failedStep || '';
          const failedTransactionHash =
            error?.failedTransactionHash ||
            existingRecovery?.metadata?.failedTransactionHash ||
            '';
          saveRecoveryRecordSafely('confirmed', {
            transactionHash: hash,
            user: authUser,
            issuerWallet: approvedWallet,
            tokenUid: cachedTokenUid,
            metadata: {
              ...recoveryMetadata,
              ...(existingRecovery?.metadata || {}),
              deploymentAttemptUid,
              tokenAddress:
                error?.tokenAddress || existingRecovery?.metadata?.tokenAddress || '',
              contracts: error?.contracts || existingRecovery?.metadata?.contracts || {},
              configurationStatus:
                failedStep === 'price-confirmation'
                  ? 'price_confirmation_required'
                  : error?.code === 'TOKEN_CONFIGURATION_PENDING'
                    ? 'configuration_pending'
                    : 'configuration_failed',
              onChainPaused:
                typeof error?.onChainPaused === 'boolean'
                  ? error.onChainPaused
                  : existingRecovery?.metadata?.onChainPaused,
              failedStep,
              failedTransactionHash,
              unpauseTransactionHash:
                failedStep === 'activate-transfers'
                  ? failedTransactionHash
                  : existingRecovery?.metadata?.unpauseTransactionHash || '',
              configurationError: error?.message || '',
              priceSetup:
                failedStep === 'price-confirmation'
                  ? {
                      ...(existingRecovery?.metadata?.priceSetup || {}),
                      status:
                        error?.code === 'PRICE_CONFIRMATION_PENDING' ? 'pending' : 'failed',
                      transactionHash: failedTransactionHash,
                      error: error?.message || '',
                    }
                  : existingRecovery?.metadata?.priceSetup || {},
            },
          });
        }

        // Never finalize the backend merely because transaction #1 was broadcast. First
        // reconcile the deployment receipt and every mandatory post-deployment transaction.
        // Configuration/price failures are intentionally left for an explicit retry so the
        // same failed step is not reopened automatically from this catch block.
        if (
          submitted &&
          hash &&
          deploymentAttemptUid &&
          !error?.syncOnly &&
          !error?.mandatoryStepPending &&
          error?.code !== 'DEPLOYMENT_TRANSACTION_REVERTED'
        ) {
          try {
            const savedRecovery = pendingDeploymentService.getForUser(authUser);
            await completeMandatoryConfiguration({
              transactionHash: hash,
              deploymentAttemptUid,
              metadata: {
                ...recoveryMetadata,
                ...(savedRecovery?.metadata || {}),
              },
            });
            return;
          } catch (verificationError) {
            error = verificationError;
          }
        }

        if (deploymentAttemptUid && error?.code === 'DEPLOYMENT_TRANSACTION_REVERTED') {
          try {
            await tokenApi.failDeploymentAttempt(deploymentAttemptUid, {
              status: 'failed',
              errorCode: 'DEPLOYMENT_TRANSACTION_REVERTED',
              errorMessage: error.message,
            });
            attemptStatus = 'failed';
            setBackendState({
              status: 'deploymentFailed',
              isDraft: false,
              isLocked: true,
            });
            queryClient.invalidateQueries({ queryKey: myTokenQueryKey(tokenRecord.userKey) });
          } catch (closeError) {
            console.error('Unable to record the reverted deployment transaction', closeError);
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
        const retryMode = existingDeploymentSync
          ? EXISTING_DEPLOYMENT_SYNC_RETRY_MODE
          : presentation.retryMode || (syncOnly ? 'backend-sync' : 'deployment');
        const savedRecovery = hash ? pendingDeploymentService.getForUser(authUser) : null;
        const failedAttemptStatus =
          error?.failedStep === 'price-confirmation'
            ? 'price_confirmation_required'
            : error?.failedStep === 'activate-transfers'
              ? error?.code === 'TOKEN_CONFIGURATION_PENDING'
                ? 'configuration_pending'
                : 'configuration_failed'
              : terminalVerificationFailure || error?.code === 'DEPLOYMENT_TRANSACTION_REVERTED'
                ? 'failed'
                : submitted
                  ? 'deployment_confirmed'
                  : attemptStatus;

        setDeployment({
          status: existingDeploymentSync ? 'processing' : 'error',
          activeStage: existingDeploymentSync ? 4 : submitted ? 3 : deployment.activeStage,
          deploymentAttemptUid,
          attemptStatus: failedAttemptStatus,
          error: presentation.message,
          transactionHash: hash || '',
          canRetry,
          retryMode,
          pendingSync:
            hash
              ? {
                  transactionHash: hash,
                  deploymentAttemptUid,
                  metadata: {
                    ...recoveryMetadata,
                    ...(savedRecovery?.metadata || {}),
                    deploymentAttemptUid,
                  },
                }
              : null,
          requestStartedAt: submitted || existingDeploymentSync ? new Date().toISOString() : null,
          walletAction:
            existingDeploymentSync || syncOnly ? null : deployment.walletAction,
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
    completeMandatoryConfiguration,
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
    supplyPricing,
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
          const localRecovery = pendingDeploymentService.getForUser(authUser);
          await completeMandatoryConfiguration({
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
              ...(localRecovery?.metadata || {}),
            },
          });
          return;
        }

        if (deploymentDetected && tokenUid) {
          throw new Error(
            'An asset record was found, but its confirmed creation reference is unavailable. The asset will not be treated as complete until the final status can be verified.',
          );
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
    authUser,
    backend.tokenUid,
    completeMandatoryConfiguration,
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
    if (!deployment.canRetry || retryInFlightRef.current) return;
    retryInFlightRef.current = true;

    try {
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
            title: 'Reloading token setup',
            description:
              'Your token, organization and creation status are being restored before any wallet request can open.',
          },
        });

        const result = await tokenBootstrap.refresh();
        if (result.error) {
          setDeployment({
            status: 'error',
            activeStage: 0,
            error: getTokenApiErrorMessage(
              result.error,
              'The token-creation status could not be restored. Please refresh and try again.',
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

      if (['configuration', 'price-confirmation'].includes(deployment.retryMode)) {
        const pending = deployment.pendingSync || {
          transactionHash: deployment.transactionHash,
          deploymentAttemptUid: deployment.deploymentAttemptUid,
          metadata: pendingDeploymentService.getForUser(authUser)?.metadata || {},
        };

        try {
          setDeployment({
            status: 'processing',
            activeStage: 3,
            error: '',
            canRetry: false,
            walletAction: {
              key: 'configuration-retry',
              status: 'syncing',
              title:
                deployment.retryMode === 'price-confirmation'
                  ? 'Checking the price confirmation'
                  : 'Checking transfer activation',
              description:
                'The live contract state is checked first. A new wallet transaction is requested only if the previous one is no longer pending and the required state is still incomplete.',
            },
          });
          await completeMandatoryConfiguration({
            transactionHash: pending.transactionHash,
            deploymentAttemptUid:
              pending.deploymentAttemptUid || deployment.deploymentAttemptUid || '',
            metadata: pending.metadata || {},
          });
        } catch (error) {
          const presentation = deploymentErrorPresentation(error, true);
          const recovery = pendingDeploymentService.getForUser(authUser);
          toast.error(presentation.title, {
            id: 'token-configuration-retry-error',
            description: presentation.message,
            duration: 8_000,
          });
          setDeployment({
            status: 'error',
            activeStage: 3,
            error: presentation.message,
            transactionHash: pending.transactionHash,
            deploymentAttemptUid:
              pending.deploymentAttemptUid || deployment.deploymentAttemptUid || '',
            attemptStatus:
              error?.failedStep === 'price-confirmation'
                ? 'price_confirmation_required'
                : error?.code === 'TOKEN_CONFIGURATION_PENDING'
                  ? 'configuration_pending'
                  : 'configuration_failed',
            requestStartedAt: new Date().toISOString(),
            canRetry: presentation.canRetry !== false,
            retryMode: presentation.retryMode || deployment.retryMode,
            pendingSync: {
              ...pending,
              metadata: recovery?.metadata || pending.metadata || {},
            },
            walletAction: null,
          });
        }
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
              title: 'Checking token status again',
              description:
                'Verification will resume from the existing transaction ID. No additional Privy approval or network fee will be requested.',
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

          await completeMandatoryConfiguration({
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
          const recovery = pendingDeploymentService.getForUser(authUser);
          const retryMode = presentation.retryMode || 'backend-sync';
          setDeployment({
            status: 'error',
            activeStage: ['configuration', 'price-confirmation'].includes(retryMode) ? 3 : 4,
            error: presentation.message,
            transactionHash: pending.transactionHash,
            deploymentAttemptUid:
              pending.deploymentAttemptUid || deployment.deploymentAttemptUid || '',
            attemptStatus: terminalVerificationFailure
              ? 'failed'
              : error?.failedStep === 'price-confirmation'
                ? 'price_confirmation_required'
                : error?.failedStep === 'activate-transfers'
                  ? 'configuration_failed'
                  : deployment.attemptStatus,
            requestStartedAt: new Date().toISOString(),
            canRetry: presentation.canRetry !== false,
            retryMode,
            pendingSync: {
              ...pending,
              metadata: recovery?.metadata || pending.metadata || {},
            },
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
    } finally {
      retryInFlightRef.current = false;
    }
  };

  const walletActionStatus = {
    'awaiting-signature': 'Approve in Privy',
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
  const configurationRetryPending = deployment.retryMode === 'configuration';
  const priceRetryPending = deployment.retryMode === 'price-confirmation';
  const existingDeploymentSyncPending =
    deployment.retryMode === EXISTING_DEPLOYMENT_SYNC_RETRY_MODE;
  const showDeploymentError = deployment.status === 'error' && !existingDeploymentSyncPending;
  const configuredInitialPrice = String(
    supplyPricing?.initialPrice ||
      tokenRecord.token?.currentTokenPrice ||
      tokenRecord.token?.initialTokenPrice ||
      '',
  ).trim();
  const walletActionCount = configuredInitialPrice ? 3 : 2;

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
          <span className="eyebrow">Creating on Sepolia</span>
          <h1>
            {existingDeploymentSyncPending
              ? 'Syncing your existing token'
              : deployment.status === 'error'
                ? backendSyncPending
                  ? 'Transaction submitted — verification pending'
                  : configurationRetryPending
                    ? 'Token created — transfer activation needs attention'
                    : priceRetryPending
                      ? 'Token created — price confirmation needs attention'
                      : 'Token creation needs attention'
                : backendSyncPending
                  ? 'Verifying token creation'
                  : 'Creating your security token'}
          </h1>
          <p>
            {existingDeploymentSyncPending
              ? "We found an existing token-creation transaction and are linking it to your account. No additional wallet transaction is required."
              : deployment.status === 'error'
                ? backendSyncPending
                  ? 'The asset creation already exists. Retry only the status check; no new secure confirmation will be requested.'
                  : configurationRetryPending
                    ? 'The asset already exists. We will check the live transfer state first and retry only the missing activation step when needed.'
                    : priceRetryPending
                      ? 'The asset already exists. We will check the live price first and retry only the missing price confirmation when needed.'
                      : 'Review the message below before retrying. Never send a duplicate transaction when a hash is already pending.'
                : backendSyncPending
                  ? 'The submitted transaction and token-creation result are being checked before your token is marked ready.'
                  : `Privy may request ${walletActionCount} approvals: create the asset, activate approved transfers${configuredInitialPrice ? ', and confirm the asset price' : ''}. Keep this page open until Sepolia confirms every required action.`}
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
              <small>Privy will show the transaction details before you approve this transaction.</small>
            ) : null}
          </div>
        ) : null}

        {deployment.error ? (
          <InfoCallout
            title={
              existingDeploymentSyncPending
                ? 'Existing token creation found'
                : backendSyncPending
                  ? 'Please wait while we sync your token.'
                  : 'Token creation not completed'
            }
            tone={existingDeploymentSyncPending ? 'info' : 'warning'}
            icon={existingDeploymentSyncPending ? ShieldCheck : AlertTriangle}
          >
            {deployment.error}
          </InfoCallout>
        ) : null}

        {deployment.transactionHash ? (
          <AddressDisplay
            label="Token creation transaction ID"
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
              <span>No new Privy confirmation or asset creation action will be requested.</span>
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
                  {backendSyncPending
                    ? 'Check token status'
                    : configurationRetryPending
                      ? 'Retry transfer activation'
                      : priceRetryPending
                        ? 'Retry price confirmation'
                        : 'Try token creation again'}
                </Button>
              ) : null}
            </>
          ) : (
            <span>
              Privy will show the transaction details before you approve a transaction.
            </span>
          )}
        </div>
      </section>
    </div>
  );
}
