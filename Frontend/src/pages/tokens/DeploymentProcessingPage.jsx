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
import { useOrganization } from '@/hooks/useOrganization';
import { useWalletConnection } from '@/hooks/useWalletConnection';
import { deployTrexSuite } from '@/services/trexDeployment.service';
import { useTokenIssuanceStore } from '@/store/tokenIssuance.store';
import { getTokenApiErrorMessage } from '@/utils/tokenApiValidation';
import {
  getDuplicateTokenMessage,
  isDuplicateTokenError,
} from '@/utils/tokenDuplicateProtection';
import {
  assertValidTransactionHash,
  getDeploymentTransactionHash,
} from '@/utils/transactionHash';

const createBackendSyncError = (cause, transactionHash, message) => {
  const error = new Error(
    message ||
      getTokenApiErrorMessage(
        cause,
        'The blockchain transaction is confirmed, but the backend could not store its transaction hash.',
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

const isWalletTransportFailure = (error) =>
  error?.code === 'WALLET_TRANSPORT_TIMEOUT' ||
  /transport request timed out|transporttimeouterror|metamask:\/\/connect|does not have a registered handler|failed to launch/i.test(
    getDeploymentErrorText(error),
  );

const deploymentErrorPresentation = (error, tokenInformation, transactionSubmitted) => {
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
      title: 'Transaction confirmed — backend update pending',
      message:
        error?.message ||
        'Your token transaction is confirmed. Retry only the backend synchronization; do not submit another blockchain transaction.',
      canRetry: true,
      retryMode: 'backend-sync',
    };
  }

  if (isDuplicateTokenError(error)) {
    return {
      title: 'Duplicate token blocked',
      message: getDuplicateTokenMessage({
        tokenName: tokenInformation.name,
        tokenSymbol: tokenInformation.symbol,
      }),
      canRetry: false,
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

const persistConfirmedTransactionHash = async (transactionHash) => {
  const confirmedHash = assertValidTransactionHash(transactionHash);
  let response;

  try {
    /* eslint-disable no-console -- Required to verify the backend deployment response. */
    console.groupCollapsed(`[Token deployment API] ${confirmedHash}`);
    try {
      console.log('POST /tokens/me/submit payload:', { transactionHash: confirmedHash });
      const submission = await tokenApi.submit(confirmedHash);
      response = submission?.data;
      console.log('POST /tokens/me/submit result:', {
        httpStatus: submission?.httpStatus,
        ok: submission?.ok,
        data: response,
      });

      if (!submission?.ok) {
        throw new Error('The backend did not acknowledge the confirmed transaction hash.');
      }
    } finally {
      console.groupEnd();
    }
    /* eslint-enable no-console */
  } catch (error) {
    // A retried idempotent request may return a conflict even though the same hash is already stored.
    // Reconcile only after the confirmed hash exists; never perform this read before wallet submission.
    if (isDuplicateTokenError(error)) {
      try {
        const existingRecord = await tokenApi.getMyToken();
        const existingHash = getDeploymentTransactionHash(existingRecord);
        if (existingHash.toLowerCase() === confirmedHash.toLowerCase()) {
          return { response: existingRecord, transactionHash: existingHash };
        }
      } catch (reconciliationError) {
        console.error('Deployment hash reconciliation failed', reconciliationError);
      }
    }

    throw createBackendSyncError(error, confirmedHash);
  }

  // A successful 2xx response is the backend acknowledgement. The already-confirmed
  // blockchain hash remains authoritative, so the API is not required to echo it.
  // When a hash is returned, still verify it to prevent displaying the wrong deployment.
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

  return { response, transactionHash: backendHash || confirmedHash };
};

export default function DeploymentProcessingPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  // Read cached token metadata only. No token submit/deploy write runs before the blockchain hash exists.
  const tokenRecord = useMyToken({ enabled: false });
  const { organization, isLoading: organizationLoading } = useOrganization({ enabled: false });
  const wallet = useWalletConnection();
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
  useDocumentTitle('Deploying Token');

  const completeBackendDeployment = useCallback(
    async ({ transactionHash, metadata = {} }) => {
      const persisted = await persistConfirmedTransactionHash(transactionHash);
      const deploymentResponse =
        persisted.response &&
        typeof persisted.response === 'object' &&
        !Array.isArray(persisted.response)
          ? persisted.response
          : {};
      const confirmedHash = persisted.transactionHash;
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
        result,
        error: '',
        transactionHash: confirmedHash,
        requestStartedAt: null,
        canRetry: false,
        retryMode: '',
        pendingSync: null,
      });

      queryClient.setQueryData(myTokenQueryKey(tokenRecord.userKey), (current) => ({
        ...(current || {}),
        ...deploymentResponse,
        tokenUid: tokenUid || current?.tokenUid || '',
        status: 'deployed',
        isDraft: false,
        deployTx: confirmedHash,
        transactionHash: confirmedHash,
        deployedAt,
        deployment: {
          ...(current?.deployment || {}),
          deployTx: confirmedHash,
          transactionHash: confirmedHash,
          deployedAt,
        },
        updatedAt: deployedAt,
      }));

      toast.success('Deployment recorded successfully', {
        id: 'token-deployment-recorded',
        description: 'The backend accepted the confirmed Sepolia transaction hash.',
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
    if (
      startedRef.current ||
      attemptInFlightRef.current ||
      deployment.status !== 'processing' ||
      organizationLoading
    ) {
      return;
    }
    startedRef.current = true;
    attemptInFlightRef.current = true;

    const deploy = async () => {
      let transactionSubmitted = false;
      let transactionHash = '';
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

      try {
        if (!wallet.isConnected || !wallet.connector) {
          throw new Error('Connect the approved organization wallet before deployment.');
        }
        if (!wallet.isCorrectNetwork) {
          throw new Error(`Switch the connected wallet to ${wallet.requiredChain.name}.`);
        }
        if (!organization.organizationUid) {
          throw new Error('The approved organization record could not be loaded.');
        }

        const approvedWallet = organization.walletAddress || tokenInformation.treasuryWallet;
        if (
          !approvedWallet ||
          wallet.address?.toLowerCase() !== approvedWallet.toLowerCase()
        ) {
          throw new Error('Reconnect with the approved organization wallet before deployment.');
        }

        // Do not call the backend submit endpoint before the blockchain transaction.
        // Wallet/network/organization checks above are local or already-hydrated checks only.
        // The confirmed Sepolia hash is submitted to the backend after deployTrexSuite completes.

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
                    transactionHash,
                    requestStartedAt: new Date().toISOString(),
                  }
                : {}),
            });
          },
        });

        transactionSubmitted = true;
        transactionHash = assertValidTransactionHash(chainResult.transactionHash);
        const metadata = {
          tokenUid: cachedTokenUid,
          tokenName: cachedTokenName,
          symbol: cachedTokenSymbol,
          network: chainResult.network,
          chainId: chainResult.chainId,
          blockNumber: chainResult.blockNumber,
          deployedAt: chainResult.deployedAt,
        };

        setDeployment({
          activeStage: 4,
          transactionHash,
          pendingSync: { transactionHash, metadata },
          retryMode: 'backend-sync',
        });

        // This is the only token submit call. It runs only after the wallet transaction
        // is confirmed and a structurally valid Sepolia transaction hash is available.
        await completeBackendDeployment({ transactionHash, metadata });
      } catch (error) {
        console.error('Token deployment failed', error);
        const hash = error?.transactionHash || transactionHash;
        const submitted = Boolean(error?.transactionSubmitted || transactionSubmitted || hash);
        const presentation = deploymentErrorPresentation(error, tokenInformation, submitted);
        const syncOnly = Boolean(error?.syncOnly || presentation.retryMode === 'backend-sync');
        const canRetry =
          presentation.canRetry ?? (!submitted || Boolean(error?.confirmedRevert));

        // Move the page into a terminal state before showing the toast. This prevents
        // a failed provider request from leaving the progress animation running.
        setDeployment({
          status: 'error',
          activeStage: submitted ? 4 : deployment.activeStage,
          error: presentation.message,
          transactionHash: hash || '',
          canRetry,
          retryMode: syncOnly ? 'backend-sync' : 'deployment',
          pendingSync:
            syncOnly && hash
              ? {
                  transactionHash: hash,
                  metadata: {
                    tokenUid: cachedTokenUid,
                    tokenName: cachedTokenName,
                    symbol: cachedTokenSymbol,
                    network: wallet.requiredChain.name,
                  },
                }
              : null,
          requestStartedAt: submitted ? new Date().toISOString() : null,
        });

        toast.dismiss('token-deployment-error');
        toast.error(presentation.title, {
          id: 'token-deployment-error',
          description: presentation.message,
          duration: 10_000,
        });
      } finally {
        attemptInFlightRef.current = false;
      }
    };

    deploy();
  }, [
    agents,
    backend.tokenUid,
    completeBackendDeployment,
    compliance,
    deployment.activeStage,
    deployment.status,
    identityClaims,
    organization,
    organizationLoading,
    setDeployment,
    tokenInformation,
    tokenRecord.token,
    tokenRecord.tokenUid,
    tokenRecord.userKey,
    wallet.address,
    wallet.connector,
    wallet.isConnected,
    wallet.isCorrectNetwork,
    wallet.requiredChain.name,
  ]);

  const retry = async () => {
    if (!deployment.canRetry) return;

    if (deployment.retryMode === 'backend-sync') {
      const pending = deployment.pendingSync || {
        transactionHash: deployment.transactionHash,
        metadata: {},
      };

      try {
        setDeployment({
          status: 'processing',
          activeStage: 4,
          error: '',
          canRetry: false,
        });
        await completeBackendDeployment(pending);
      } catch (error) {
        console.error('Backend deployment synchronization failed', error);
        const presentation = deploymentErrorPresentation(error, tokenInformation, true);
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
          requestStartedAt: new Date().toISOString(),
          canRetry: presentation.canRetry !== false,
          retryMode: 'backend-sync',
          pendingSync: pending,
        });
      }
      return;
    }

    startedRef.current = false;
    setDeployment({
      status: 'processing',
      activeStage: 0,
      error: '',
      transactionHash: '',
      requestStartedAt: null,
      canRetry: false,
      retryMode: '',
      pendingSync: null,
    });
  };

  const explorerBase = wallet.requiredChain.blockExplorers?.default?.url || '';
  const transactionExplorer =
    deployment.transactionHash && explorerBase
      ? `${explorerBase}/tx/${deployment.transactionHash}`
      : undefined;
  const backendSyncPending =
    deployment.retryMode === 'backend-sync' && Boolean(deployment.transactionHash);

  return (
    <div className="deployment-page">
      <section className="deployment-card">
        <div className="deployment-card__hero">
          <span
            className={
              deployment.status === 'error'
                ? 'deployment-loader deployment-loader--error'
                : 'deployment-loader'
            }
          >
            {deployment.status === 'error' ? (
              <AlertTriangle size={28} />
            ) : (
              <ShieldCheck size={28} />
            )}
          </span>
          <span className="eyebrow">Issuer-signed Sepolia deployment</span>
          <h1>
            {deployment.status === 'error'
              ? backendSyncPending
                ? 'Blockchain confirmed — saving deployment'
                : 'Deployment needs attention'
              : backendSyncPending
                ? 'Saving the confirmed transaction'
                : 'Deploying your T-REX token suite'}
          </h1>
          <p>
            {deployment.status === 'error'
              ? backendSyncPending
                ? 'The on-chain transaction already exists. Retry only the secure backend update; another wallet transaction will not be sent.'
                : 'Review the message below before retrying. Never send a duplicate transaction when a hash is already pending.'
              : backendSyncPending
                ? 'The confirmed transaction hash is being stored by the backend before the success page is opened.'
                : 'Approve the deployment and issuer unpause requests in your connected wallet, then keep this page open until Sepolia confirms the deployment.'}
          </p>
        </div>

        <DeploymentProgress
          activeStage={deployment.activeStage}
          status={deployment.status}
        />

        {deployment.error ? (
          <InfoCallout
            title={backendSyncPending ? 'Backend synchronization pending' : 'Deployment not completed'}
            tone="warning"
            icon={AlertTriangle}
          >
            {deployment.error}
          </InfoCallout>
        ) : null}

        {deployment.transactionHash ? (
          <AddressDisplay
            label="Confirmed transaction hash"
            address={deployment.transactionHash}
            explorerUrl={transactionExplorer}
            showFullAddress
          />
        ) : null}

        <div className="deployment-card__actions">
          {deployment.status === 'error' ? (
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
                  {backendSyncPending ? 'Retry backend update' : 'Retry deployment'}
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
