import {
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  Fingerprint,
  ShieldCheck,
  UsersRound,
} from 'lucide-react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { AddressDisplay, StatusBadge } from '@/components/token-issuance/IssuancePrimitives';
import { Button } from '@/components/ui/Button';
import { ROUTES } from '@/config/routes';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useTokenIssuanceStore } from '@/store/tokenIssuance.store';

export default function DeploymentSuccessPage() {
  const navigate = useNavigate();
  const { tokenAddress } = useParams();
  const result = useTokenIssuanceStore((state) => state.deployment.result);
  useDocumentTitle('Deployment Successful');

  if (!result || (result.tokenAddress && tokenAddress !== result.tokenAddress)) {
    return <Navigate to={ROUTES.tokenDetails(tokenAddress)} replace />;
  }

  const explorerBase = result.explorerUrl?.replace(/\/$/, '');
  const tokenExplorer =
    explorerBase && result.tokenAddress
      ? `${explorerBase}/address/${result.tokenAddress}`
      : undefined;
  const transactionExplorer =
    explorerBase && result.transactionHash
      ? `${explorerBase}/tx/${result.transactionHash}`
      : undefined;
  const explorerUrl = transactionExplorer || tokenExplorer;

  return (
    <div className="deployment-success-page">
      <section className="deployment-success-hero">
        <span className="deployment-success-icon">
          <CheckCircle2 size={38} />
        </span>
        <StatusBadge status="valid">Blockchain confirmed</StatusBadge>
        <h1>Deployment Successful</h1>
        <p>
          {result.tokenName} ({result.symbol}) has been deployed successfully and is ready for
          compliant issuer operations.
        </p>
        <div className="deployment-success-actions">
          <Button
            icon={ArrowRight}
            onClick={() => navigate(ROUTES.tokenDetails(result.tokenAddress))}
          >
            Go to Token Dashboard
          </Button>
          {explorerUrl ? (
            <a
              className="button button--secondary"
              href={explorerUrl}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink size={17} /> View on Explorer
            </a>
          ) : null}
        </div>
      </section>

      <div className="deployment-success-grid">
        <section className="issuance-section-card">
          <header className="issuance-section-card__header">
            <div>
              <h2>Deployment Addresses</h2>
              <p>Confirmed contract addresses returned by the deployment service.</p>
            </div>
          </header>
          <div className="issuance-section-card__body deployment-address-list">
            <AddressDisplay
              label="Token Proxy Address"
              address={result.tokenAddress}
              explorerUrl={tokenExplorer}
            />
            <AddressDisplay
              label="Identity Registry Address"
              address={result.identityRegistryAddress}
              explorerUrl={
                explorerBase && result.identityRegistryAddress
                  ? `${explorerBase}/address/${result.identityRegistryAddress}`
                  : undefined
              }
            />
          </div>
        </section>

        <section className="issuance-section-card whats-next-card">
          <header className="issuance-section-card__header">
            <div>
              <h2>What’s Next?</h2>
              <p>Continue with the issuer operations currently available in your workspace.</p>
            </div>
          </header>
          <div className="issuance-section-card__body">
            <article>
              <Fingerprint size={19} />
              <div>
                <strong>Add or verify investors</strong>
                <p>Register eligible ONCHAINID identities and required claims.</p>
              </div>
            </article>
            <article>
              <ShieldCheck size={19} />
              <div>
                <strong>Review compliance settings</strong>
                <p>Confirm investor limits and geographic restrictions before distribution.</p>
              </div>
            </article>
            <article>
              <UsersRound size={19} />
              <div>
                <strong>Review governance access</strong>
                <p>Confirm the Token Agent and Identity Manager operational wallets.</p>
              </div>
            </article>
          </div>
        </section>
      </div>
    </div>
  );
}
