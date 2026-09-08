import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Edit3,
  Network,
  Rocket,
  ShieldCheck,
  WalletCards,
  XCircle,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { DeploymentConfirmationModal } from '@/components/token-issuance/DeploymentConfirmationModal';
import {
  AddressDisplay,
  InfoCallout,
  SectionCard,
  StatusBadge,
} from '@/components/token-issuance/IssuancePrimitives';
import { IssuanceLayout } from '@/components/token-issuance/IssuanceLayout';
import { WalletControl } from '@/components/wallet/WalletControl';
import { TOKEN_CREATION_AGENT_ROLES, TOKEN_ISSUANCE_STEPS } from '@/config/tokenIssuance';
import { ROUTES } from '@/config/routes';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useWalletConnection } from '@/hooks/useWalletConnection';
import { useTokenIssuanceStore } from '@/store/tokenIssuance.store';
import {
  buildReviewChecklist,
  formatMoney,
  formatNumber,
  hasBlockingReviewErrors,
} from '@/utils/tokenIssuance';

const statusIcons = {
  valid: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
  pending: Clock3,
};

function ReviewSection({ title, stepKey, children }) {
  const navigate = useNavigate();
  return (
    <section className="issuance-review-section">
      <header>
        <h3>{title}</h3>
        <button
          type="button"
          onClick={() => navigate(ROUTES.tokenIssuanceStep(stepKey))}
        >
          <Edit3 size={15} /> Edit
        </button>
      </header>
      {children}
    </section>
  );
}

export default function ReviewDeployPage() {
  const navigate = useNavigate();
  const wallet = useWalletConnection();
  const tokenInformation = useTokenIssuanceStore((state) => state.tokenInformation);
  const supplyPricing = useTokenIssuanceStore((state) => state.supplyPricing);
  const identityClaims = useTokenIssuanceStore((state) => state.identityClaims);
  const compliance = useTokenIssuanceStore((state) => state.compliance);
  const agents = useTokenIssuanceStore((state) => state.agents);
  const completedSteps = useTokenIssuanceStore((state) => state.completedSteps);
  const markStepCompleted = useTokenIssuanceStore((state) => state.markStepCompleted);
  const deployment = useTokenIssuanceStore((state) => state.deployment);
  const setDeployment = useTokenIssuanceStore((state) => state.setDeployment);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [startingDeployment, setStartingDeployment] = useState(false);
  const state = useMemo(
    () => ({ tokenInformation, supplyPricing, identityClaims, compliance, agents }),
    [agents, compliance, identityClaims, supplyPricing, tokenInformation],
  );
  const checks = buildReviewChecklist(state, wallet);
  const blocking = hasBlockingReviewErrors(checks);
  const kyc = identityClaims.claimTopics.find((topic) => topic.id === 'kyc');
  const accredited = identityClaims.claimTopics.find((topic) => topic.id === 'accredited');
  useDocumentTitle('Review & Deploy');

  const openDeployment = () => {
    if (deployment.requestStartedAt && !deployment.canRetry) {
      toast.error('A previous deployment request still needs status reconciliation.', {
        description:
          'Check the backend or blockchain transaction status before starting another deployment.',
      });
      return;
    }

    const incompleteStep = TOKEN_ISSUANCE_STEPS.filter(
      (step) => step.key !== 'review',
    ).find((step) => !completedSteps.includes(step.key));

    if (incompleteStep) {
      toast.error('Complete all required steps before deployment.', {
        description: `${incompleteStep.label} still needs review.`,
      });
      navigate(ROUTES.tokenIssuanceStep(incompleteStep.key));
      return;
    }

    if (blocking) {
      toast.error('Resolve the blocking validation items before deployment.');
      return;
    }
    setConfirmationOpen(true);
  };

  const confirmDeployment = () => {
    if (startingDeployment) return;
    setStartingDeployment(true);
    markStepCompleted('review');
    setDeployment({
      status: 'processing',
      activeStage: 0,
      error: '',
      transactionHash: '',
      result: null,
      requestStartedAt: null,
      canRetry: false,
    });
    setConfirmationOpen(false);
    navigate(ROUTES.tokenDeploying);
  };

  const sidebar = (
    <div className="issuance-sidebar-stack">
      <section className="issuance-summary-card issuance-wallet-summary">
        <span className="issuance-card-icon">
          <WalletCards size={19} />
        </span>
        <h3>Wallet and Network</h3>
        <WalletControl expanded />
        {wallet.isConnected ? (
          <>
            <AddressDisplay label="Connected wallet" address={wallet.address} compact />
            <dl className="issuance-summary-list">
              <div>
                <dt>Network</dt>
                <dd>{wallet.chain?.name || 'Unsupported network'}</dd>
              </div>
              <div>
                <dt>Balance</dt>
                <dd>{wallet.balanceLabel}</dd>
              </div>
            </dl>
            {!wallet.isCorrectNetwork ? (
              <InfoCallout title="Network required" tone="warning" icon={Network}>
                Please switch the network.
              </InfoCallout>
            ) : null}
          </>
        ) : (
          <p>Connect the authorized organization wallet to complete deployment validation.</p>
        )}
      </section>

      <section className="issuance-summary-card validation-checklist-card">
        <span className="issuance-card-icon">
          <ShieldCheck size={19} />
        </span>
        <h3>Validation Checklist</h3>
        <div className="validation-checklist">
          {checks.map((check) => {
            const Icon = statusIcons[check.status];
            return (
              <div
                key={check.id}
                className={`validation-check validation-check--${check.status}`}
              >
                <Icon size={17} />
                <span>{check.label}</span>
                <StatusBadge status={check.status}>{check.status}</StatusBadge>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );

  return (
    <>
      <IssuanceLayout
        stepKey="review"
        title="Final Review and Validation"
        description="Review all entered information and resolve every required validation before deployment."
        sidebar={sidebar}
        onBack={() => navigate(ROUTES.tokenIssuanceStep('agents'))}
        onContinue={openDeployment}
        continueLabel="Deploy Token"
        continueIcon={Rocket}
        continueDisabled={blocking}
      >
        <SectionCard
          title="Deployment Configuration"
          description="Use Edit to return to a step without clearing the saved wizard data."
        >
          <div className="issuance-review-grid">
            <ReviewSection title="Token Basics" stepKey="token-information">
              <dl className="issuance-review-list">
                <div>
                  <dt>Token Name</dt>
                  <dd>{tokenInformation.name || '—'}</dd>
                </div>
                <div>
                  <dt>Token Symbol</dt>
                  <dd>{tokenInformation.symbol || '—'}</dd>
                </div>
                <div>
                  <dt>Decimals</dt>
                  <dd>{tokenInformation.decimals || '—'}</dd>
                </div>
                <div>
                  <dt>Initial Token Price</dt>
                  <dd>
                    {supplyPricing.initialPrice
                      ? formatMoney(supplyPricing.initialPrice, 'USDT')
                      : '—'}
                  </dd>
                </div>
                <div className="is-full">
                  <dt>Treasury Wallet Address</dt>
                  <dd>
                    <AddressDisplay address={tokenInformation.treasuryWallet} compact />
                  </dd>
                </div>
                <div className="is-full">
                  <dt>Token Description</dt>
                  <dd className="issuance-review-description">
                    {tokenInformation.description || '—'}
                  </dd>
                </div>
              </dl>
            </ReviewSection>

            <ReviewSection title="Identity and Claims" stepKey="identity-claims">
              <dl className="issuance-review-list">
                <div>
                  <dt>KYC</dt>
                  <dd>
                    <StatusBadge status={kyc?.enabled ? 'valid' : 'error'}>
                      {kyc?.enabled ? 'Enabled' : 'Disabled'}
                    </StatusBadge>
                  </dd>
                </div>
                <div>
                  <dt>Accredited Investor</dt>
                  <dd>
                    <StatusBadge status={accredited?.enabled ? 'valid' : 'neutral'}>
                      {accredited?.enabled ? 'Enabled' : 'Disabled'}
                    </StatusBadge>
                  </dd>
                </div>
                <div className="is-full">
                  <dt>Trusted Claim Issuer</dt>
                  <dd>
                    {identityClaims.trustedIssuer.mode === 'organization'
                      ? 'My organization'
                      : 'Not confirmed'}
                  </dd>
                </div>
              </dl>
            </ReviewSection>

            <ReviewSection title="Compliance Rules" stepKey="compliance">
              <dl className="issuance-review-list">
                <div>
                  <dt>Max Investors</dt>
                  <dd>
                    {compliance.maximumInvestors
                      ? formatNumber(compliance.maximumInvestors)
                      : '—'}
                  </dd>
                </div>
                <div>
                  <dt>Max Balance per Investor</dt>
                  <dd>
                    {compliance.maximumBalance
                      ? formatNumber(compliance.maximumBalance)
                      : '—'}
                  </dd>
                </div>
                <div className="is-full">
                  <dt>Selected Countries or Jurisdictions</dt>
                  <dd>{compliance.countries.length ? compliance.countries.join(', ') : 'None'}</dd>
                </div>
              </dl>
            </ReviewSection>

            <ReviewSection title="Execution Agents" stepKey="agents">
              <div className="issuance-agent-review-list">
                {TOKEN_CREATION_AGENT_ROLES.map((role) => (
                  <AddressDisplay
                    key={role.key}
                    label={role.name}
                    address={agents[role.key]?.address}
                    compact
                  />
                ))}
              </div>
            </ReviewSection>
          </div>
        </SectionCard>

        <InfoCallout title="Immutability Warning" tone="warning" icon={AlertTriangle}>
          Token name, symbol, decimals and parts of the initial ERC-3643 contract configuration
          may not be editable after deployment. Review every value before continuing.
        </InfoCallout>
      </IssuanceLayout>

      <DeploymentConfirmationModal
        open={confirmationOpen}
        onClose={() => setConfirmationOpen(false)}
        onConfirm={confirmDeployment}
        data={state}
        wallet={wallet}
        loading={startingDeployment}
      />
    </>
  );
}
