import {
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  ExternalLink,
  Fingerprint,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import {
  AddressDisplay,
  StatusBadge,
} from '@/components/token-issuance/IssuancePrimitives';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { ROUTES } from '@/config/routes';
import { web3Config } from '@/config/web3';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useMyToken } from '@/hooks/useMyToken';
import { useTokenIssuanceStore } from '@/store/tokenIssuance.store';
import { getPlatformTokenPrice } from '@/services/blockchain/trexPlatformController.service';
import { readTrexTokenPaused } from '@/services/trexDeployment.service';
import { getDeploymentTransactionHash } from '@/utils/transactionHash';

const firstText = (...values) =>
  values
    .map((value) => String(value ?? '').trim())
    .find(Boolean) || '';

const canonicalDecimal = (value) => {
  const normalized = String(value ?? '').trim();
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return normalized;
  const [wholeRaw = '0', fractionRaw = ''] = normalized.split('.');
  const whole = wholeRaw.replace(/^0+(?=\d)/, '') || '0';
  const fraction = fractionRaw.replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole;
};

export default function DeploymentSuccessPage() {
  const navigate = useNavigate();
  const { tokenAddress: routeTokenId } = useParams();
  const token = useMyToken();
  const deployment = useTokenIssuanceStore((state) => state.deployment);
  const setDeployment = useTokenIssuanceStore((state) => state.setDeployment);
  const [chainReadiness, setChainReadiness] = useState('checking');
  const [chainIssue, setChainIssue] = useState(null);
  useDocumentTitle('Asset Created');

  const raw = token.token || {};
  const information = raw.tokenInformation || raw.information || raw;
  const tokenContractAddress = firstText(
    raw.tokenAddress,
    raw.contractAddress,
    raw.proxyAddress,
    raw.contracts?.token,
    raw.deployment?.contracts?.token,
    raw.deployment?.tokenAddress,
  );
  const desiredPrice = firstText(
    information.currentTokenPrice,
    raw.currentTokenPrice,
    information.initialTokenPrice,
    information.initialPrice,
    raw.initialTokenPrice,
    raw.initialPrice,
  );

  const backendTransactionHash = getDeploymentTransactionHash(raw);
  const confirmedResultHash =
    deployment.status === 'success'
      ? getDeploymentTransactionHash(deployment.result)
      : '';
  const transactionHash = backendTransactionHash || confirmedResultHash;

  useEffect(() => {
    if (token.isPending) return undefined;
    if (!tokenContractAddress) {
      setChainReadiness('unavailable');
      setChainIssue({ step: 'configuration', message: 'The token contract address is unavailable for the final on-chain check.' });
      return undefined;
    }

    let active = true;
    setChainReadiness('checking');
    setChainIssue(null);
    Promise.all([
      readTrexTokenPaused({ tokenAddress: tokenContractAddress }),
      desiredPrice
        ? getPlatformTokenPrice({ tokenAddress: tokenContractAddress })
        : Promise.resolve(null),
    ])
      .then(([paused, price]) => {
        if (!active) return;
        if (paused) {
          setChainReadiness('incomplete');
          setChainIssue({
            step: 'configuration',
            message: 'Transfer activation is not complete. The token contract is still paused.',
          });
          return;
        }
        if (
          desiredPrice &&
          canonicalDecimal(price?.currentTokenPrice) !== canonicalDecimal(desiredPrice)
        ) {
          setChainReadiness('incomplete');
          setChainIssue({
            step: 'price-confirmation',
            message: 'The live token price does not yet match the configured price.',
          });
          return;
        }
        setChainReadiness('ready');
      })
      .catch((error) => {
        if (!active) return;
        setChainReadiness('unavailable');
        setChainIssue({
          step: 'configuration',
          message: error?.message || 'The final on-chain state could not be verified.',
        });
      });

    return () => {
      active = false;
    };
  }, [desiredPrice, token.isPending, tokenContractAddress]);

  useEffect(() => {
    if (
      token.isPending ||
      !transactionHash ||
      ['checking', 'ready'].includes(chainReadiness)
    ) {
      return;
    }
    const retryMode =
      chainIssue?.step === 'price-confirmation' ? 'price-confirmation' : 'configuration';
    setDeployment({
      status: 'error',
      activeStage: 3,
      transactionHash,
      error: chainIssue?.message || 'The final on-chain state needs attention.',
      canRetry: true,
      retryMode,
      pendingSync: {
        transactionHash,
        deploymentAttemptUid: '',
        metadata: {
          tokenUid: token.tokenUid || firstText(raw.tokenUid, raw.uid, raw.id),
          tokenAddress: tokenContractAddress,
          configurationStatus:
            retryMode === 'price-confirmation'
              ? 'price_confirmation_required'
              : 'configuration_failed',
          onChainPaused:
            retryMode === 'price-confirmation'
              ? false
              : chainReadiness === 'incomplete'
                ? true
                : null,
          failedStep:
            retryMode === 'price-confirmation'
              ? 'price-confirmation'
              : 'activate-transfers',
        },
      },
      walletAction: null,
    });
  }, [
    chainIssue,
    chainReadiness,
    raw.id,
    raw.tokenUid,
    raw.uid,
    setDeployment,
    token.isPending,
    token.tokenUid,
    tokenContractAddress,
    transactionHash,
  ]);

  if (token.isPending) {
    return (
      <div className="deployment-success-page deployment-success-page--compact">
        <Skeleton height={390} />
      </div>
    );
  }

  // A readyToDeploy/locked record is not a successful deployment. The success page is
  // available only after the backend or the completed in-memory deployment result contains
  // a structurally valid confirmed transaction hash.
  if (!transactionHash) {
    const destination =
      deployment.status === 'processing' || deployment.retryMode === 'backend-sync'
        ? ROUTES.tokenDeploying
        : ROUTES.tokenIssuanceStep('review');
    return <Navigate to={destination} replace />;
  }

  if (token.tokenUid && routeTokenId && routeTokenId !== token.tokenUid) {
    return <Navigate to={ROUTES.tokenSuccess(token.tokenUid)} replace />;
  }

  const normalizedStatus = String(raw.status || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z]/g, '');
  const backendFinalized = ['deployed', 'completed', 'active'].includes(normalizedStatus) &&
    raw.isFinalized !== false;
  const localFinalized =
    deployment.status === 'success' &&
    deployment.result?.configurationStatus === 'ready_to_finalize' &&
    deployment.result?.onChainPaused === false;

  if (!backendFinalized && !localFinalized) {
    return <Navigate to={ROUTES.tokenDeploying} replace />;
  }

  if (chainReadiness === 'checking') {
    return (
      <div className="deployment-success-page deployment-success-page--compact">
        <Skeleton height={390} />
      </div>
    );
  }

  if (chainReadiness !== 'ready') {
    return <Navigate to={ROUTES.tokenDeploying} replace />;
  }

  const tokenName = firstText(information.tokenName, information.name, raw.tokenName, raw.name) ||
    'Investment Asset';
  const symbol = firstText(
    information.tokenSymbol,
    information.symbol,
    raw.tokenSymbol,
    raw.symbol,
  ) || 'TOKEN';
  const network =
    firstText(raw.network, raw.networkName, information.network, deployment.result?.network) ||
    web3Config.requiredChain.name;
  const tokenUid = token.tokenUid || firstText(raw.tokenUid, raw.uid, raw.id, deployment.result?.tokenUid);
  const deployedAt = firstText(
    raw.deployedAt,
    raw.deployment?.deployedAt,
    deployment.result?.deployedAt,
    raw.updatedAt,
  );
  const explorerBase = web3Config.requiredChain.blockExplorers?.default?.url || '';
  const transactionExplorer = explorerBase
    ? `${explorerBase}/tx/${transactionHash}`
    : undefined;

  return (
    <div className="deployment-success-page deployment-success-page--compact">
      <section className="deployment-complete-card">
        <div className="deployment-complete-card__seal" aria-hidden="true">
          <CheckCircle2 size={31} />
        </div>
        <StatusBadge status="valid">Created successfully on {network}</StatusBadge>
        <h1>Your investment asset is ready</h1>
        <p>
          <strong>{tokenName} ({symbol})</strong> has been created using the investor requirements and investment rules you reviewed. You can now open the asset dashboard and begin managing approved investors.
        </p>

        <div className="deployment-complete-card__records deployment-complete-card__records--single">
          <AddressDisplay
            label="Transaction ID"
            address={transactionHash}
            explorerUrl={transactionExplorer}
            showFullAddress
          />
        </div>

        <div className="deployment-complete-card__actions">
          <Button
            icon={ArrowRight}
            onClick={() => navigate(ROUTES.tokenDetails(tokenUid || transactionHash))}
          >
            View Asset
          </Button>
          <Button
            variant="secondary"
            icon={ExternalLink}
            onClick={() => window.open(transactionExplorer, '_blank', 'noopener,noreferrer')}
            disabled={!transactionExplorer}
          >
            View on Etherscan
          </Button>
        </div>

        <div className="deployment-complete-card__meta">
          <span><BadgeCheck size={17} /> Status: Ready</span>
          <span>
            <Fingerprint size={17} />
            {deployedAt
              ? `Created ${new Date(deployedAt).toLocaleString()}`
              : 'Creation confirmed securely'}
          </span>
        </div>
      </section>

      <section className="deployment-next-step-card">
        <span><Fingerprint size={21} /></span>
        <div>
          <strong>What happens next?</strong>
          <p>
            Open the asset dashboard to review the final settings, manage investors, and view technical transaction details if you need them.
          </p>
        </div>
      </section>
    </div>
  );
}
