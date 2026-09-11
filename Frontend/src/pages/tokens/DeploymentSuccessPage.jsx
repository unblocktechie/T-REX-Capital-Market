import {
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  ExternalLink,
  Fingerprint,
} from 'lucide-react';
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
import { getDeploymentTransactionHash } from '@/utils/transactionHash';

const firstText = (...values) =>
  values
    .map((value) => String(value ?? '').trim())
    .find(Boolean) || '';

export default function DeploymentSuccessPage() {
  const navigate = useNavigate();
  const { tokenAddress: routeTokenId } = useParams();
  const token = useMyToken();
  const deployment = useTokenIssuanceStore((state) => state.deployment);
  useDocumentTitle('Token Created');

  if (token.isPending) {
    return (
      <div className="deployment-success-page deployment-success-page--compact">
        <Skeleton height={390} />
      </div>
    );
  }

  const raw = token.token || {};
  const backendTransactionHash = getDeploymentTransactionHash(raw);
  const confirmedResultHash =
    deployment.status === 'success'
      ? getDeploymentTransactionHash(deployment.result)
      : '';
  const transactionHash = backendTransactionHash || confirmedResultHash;

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

  const information = raw.tokenInformation || raw.information || raw;
  const tokenName = firstText(information.tokenName, information.name, raw.tokenName, raw.name) ||
    'Security Token';
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
        <StatusBadge status="valid">Created on Sepolia</StatusBadge>
        <h1>Token Created Successfully</h1>
        <p>
          Your token <strong>{tokenName} ({symbol})</strong> has been successfully created and is ready to use.
          You can now invite investors from the Investors menu and start managing your investor list.
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
            Go to Token Dashboard
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
          <span><BadgeCheck size={17} /> Status: Created</span>
          <span>
            <Fingerprint size={17} />
            {deployedAt
              ? `Created ${new Date(deployedAt).toLocaleString()}`
              : 'Creation confirmed on-chain'}
          </span>
        </div>
      </section>

      <section className="deployment-next-step-card">
        <span><Fingerprint size={21} /></span>
        <div>
          <strong>What happens next?</strong>
          <p>
            Open the token dashboard to review your token details and the transaction information saved from
            this confirmed creation.
          </p>
        </div>
      </section>
    </div>
  );
}
