import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  CheckCircle2,
  Clock3,
  Coins,
  Edit3,
  Gavel,
  Landmark,
  Network,
  RefreshCcw,
  Rocket,
  ShieldCheck,
  UsersRound,
  XCircle,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { DeploymentConfirmationModal } from '@/components/token-issuance/DeploymentConfirmationModal';
import {
  AddressDisplay,
  InfoCallout,
  StatusBadge,
} from '@/components/token-issuance/IssuancePrimitives';
import { IssuanceLayout } from '@/components/token-issuance/IssuanceLayout';
import { Button } from '@/components/ui/Button';
import { WalletControl } from '@/components/wallet/WalletControl';
import { TOKEN_CREATION_AGENT_ROLES, TOKEN_ISSUANCE_STEPS } from '@/config/tokenIssuance';
import { ROUTES } from '@/config/routes';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useWalletConnection } from '@/hooks/useWalletConnection';
import { useTokenIssuanceStore } from '@/store/tokenIssuance.store';
import { cn } from '@/utils/cn';
import {
  buildReviewChecklist,
  formatMoney,
  formatNumber,
  hasBlockingReviewErrors,
} from '@/utils/tokenIssuance';
import { getWalletErrorMessage } from '@/utils/wallet';

const statusIcons = {
  valid: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
  pending: Clock3,
};

function ReviewCard({ title, stepKey, icon: Icon, className, children, editLabel = 'Edit' }) {
  const navigate = useNavigate();

  return (
    <section className={cn('review-card', className)}>
      <header className="review-card__header">
        <div className="review-card__heading">
          {Icon ? (
            <span className="review-card__icon" aria-hidden="true">
              <Icon size={19} />
            </span>
          ) : null}
          <h2>{title}</h2>
        </div>
        {stepKey ? (
          <button
            type="button"
            className="review-card__edit"
            onClick={() => navigate(ROUTES.tokenIssuanceStep(stepKey))}
          >
            <Edit3 size={15} /> {editLabel}
          </button>
        ) : null}
      </header>
      <div className="review-card__body">{children}</div>
    </section>
  );
}

function DetailItem({ label, children, full = false }) {
  return (
    <div className={cn('review-detail-item', full && 'review-detail-item--full')}>
      <dt>{label}</dt>
      <dd>{children || '—'}</dd>
    </div>
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
  const deployment = useTokenIssuanceStore((state) => state.deployment);
  const backend = useTokenIssuanceStore((state) => state.backend);
  const setDeployment = useTokenIssuanceStore((state) => state.setDeployment);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [startingDeployment, setStartingDeployment] = useState(false);
  const state = useMemo(
    () => ({ tokenInformation, supplyPricing, identityClaims, compliance, agents }),
    [agents, compliance, identityClaims, supplyPricing, tokenInformation],
  );
  const checks = buildReviewChecklist(state, wallet, tokenInformation.treasuryWallet);
  const normalizedBackendStatus = String(backend.status || '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
  const isReadyToDeploy = normalizedBackendStatus === 'readytodeploy';
  const isDeployed = normalizedBackendStatus === 'deployed';
  const blocking = hasBlockingReviewErrors(checks) || isDeployed;
  const validChecks = checks.filter((check) => check.status === 'valid').length;
  const kyc = identityClaims.claimTopics.find((topic) => topic.id === 'kyc');
  const accredited = identityClaims.claimTopics.find((topic) => topic.id === 'accredited');
  const enabledClaims = identityClaims.claimTopics.filter((topic) => topic.enabled);
  const networkLabel =
    wallet.requiredChain?.name || tokenInformation.network || 'Sepolia Testnet';
  const connectedNetworkLabel = wallet.isConnected
    ? wallet.chain?.name ||
      `Unsupported network${wallet.chainId ? ` (Chain ID ${wallet.chainId})` : ''}`
    : 'No network connected';
  useDocumentTitle('Review & Deploy');

  const switchToRequiredNetwork = async () => {
    if (!wallet.isConnected || wallet.isCorrectNetwork || wallet.isBusy) return;

    try {
      await wallet.switchChain(wallet.requiredChain.id);
      toast.success(`Switched to ${wallet.requiredChain.name}`, {
        description: 'The deployment wallet is now on the required network.',
      });
    } catch (error) {
      toast.error('Unable to switch network', {
        description: `${getWalletErrorMessage(
          error,
        )} Open the deployment wallet menu to reconnect if needed.`,
      });
    }
  };

  const openDeployment = () => {
    if (deployment.transactionHash && deployment.status !== 'success') {
      toast.error('A blockchain transaction has already been submitted.', {
        description:
          'Complete the pending backend synchronization instead of sending another deployment transaction.',
      });
      navigate(ROUTES.tokenDeploying);
      return;
    }

    if (isDeployed) {
      toast.info('This token is already deployed.');
      navigate(ROUTES.tokenDetails(backend.tokenUid || 'token'));
      return;
    }

    if (deployment.requestStartedAt && !deployment.canRetry) {
      toast.error('A previous deployment request still needs status reconciliation.', {
        description:
          'Check the submitted transaction status before starting another deployment.',
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

  return (
    <>
      <IssuanceLayout
        stepKey="review"
        title="Final Review & Validation"
        description={`Verify every parameter before signing the T-REX Gateway deployment on ${networkLabel}.`}
        onBack={() => navigate(ROUTES.tokenIssuanceStep('agents'))}
        onContinue={openDeployment}
        continueLabel="Deploy Token"
        continueIcon={Rocket}
        continueDisabled={blocking}
        hideFooter
        pageClassName="issuance-review-page"
      >
        <div className="review-dashboard">
          <div className="review-dashboard__top-grid">
            <ReviewCard
              title="Token Basics"
              stepKey="token-information"
              icon={Coins}
              className="review-token-card"
            >
              <div className="review-token-profile">
                <span className="review-token-logo">
                  {tokenInformation.logo?.dataUrl ? (
                    <img
                      src={tokenInformation.logo.dataUrl}
                      alt={`${tokenInformation.name || 'Token'} logo`}
                    />
                  ) : (
                    <Coins size={24} aria-hidden="true" />
                  )}
                </span>
                <div>
                  <span>Token configuration</span>
                  <strong>{tokenInformation.name || 'Unnamed token'}</strong>
                  <small>{tokenInformation.symbol || 'No symbol configured'}</small>
                </div>
              </div>

              <dl className="review-detail-grid review-detail-grid--token">
                <DetailItem label="Token Name">{tokenInformation.name}</DetailItem>
                <DetailItem label="Symbol">{tokenInformation.symbol}</DetailItem>
                <DetailItem label="Decimals">{tokenInformation.decimals}</DetailItem>
                <DetailItem label="Initial Token Price">
                  {supplyPricing.initialPrice
                    ? formatMoney(supplyPricing.initialPrice, 'USDT')
                    : '—'}
                </DetailItem>
                <DetailItem label="Treasury Wallet" full>
                  <AddressDisplay address={tokenInformation.treasuryWallet} compact />
                </DetailItem>
                <DetailItem label="Token Description" full>
                  <span className="review-description-text">
                    {tokenInformation.description || 'No description provided.'}
                  </span>
                </DetailItem>
              </dl>
            </ReviewCard>

            <ReviewCard
              title="Identity & Claims"
              stepKey="identity-claims"
              icon={BadgeCheck}
              className="review-identity-card"
            >
              <div className="review-integration-status">
                <span className="review-integration-status__icon">
                  <BadgeCheck size={19} />
                </span>
                <div>
                  <strong>ONCHAINID Integrated</strong>
                  <small>Identity Registry ready</small>
                </div>
                <StatusBadge status="valid">Verified</StatusBadge>
              </div>

              <div className="review-claims-block">
                <span>Required Claims</span>
                <div className="review-claim-tags">
                  {enabledClaims.length ? (
                    enabledClaims.map((topic) => (
                      <span key={topic.id}>{topic.shortName || topic.name}</span>
                    ))
                  ) : (
                    <small>No claim topics enabled</small>
                  )}
                </div>
              </div>

              <dl className="review-identity-list">
                <div>
                  <dt>KYC verification</dt>
                  <dd>
                    <StatusBadge status={kyc?.enabled ? 'valid' : 'error'}>
                      {kyc?.enabled ? 'Enabled' : 'Disabled'}
                    </StatusBadge>
                  </dd>
                </div>
                <div>
                  <dt>Accredited investor</dt>
                  <dd>
                    <StatusBadge status={accredited?.enabled ? 'valid' : 'neutral'}>
                      {accredited?.enabled ? 'Enabled' : 'Optional'}
                    </StatusBadge>
                  </dd>
                </div>
                <div>
                  <dt>Trusted claim issuer</dt>
                  <dd>
                    {identityClaims.trustedIssuer.mode === 'organization'
                      ? 'My organization'
                      : 'Not confirmed'}
                  </dd>
                </div>
              </dl>
            </ReviewCard>
          </div>

          <div className="review-dashboard__middle-grid">
            <ReviewCard title="Validation Checklist" icon={ShieldCheck} className="review-validation-card">
              <div className="review-validation-summary">
                <strong>{validChecks}/{checks.length}</strong>
                <span>validation checks passed</span>
              </div>
              <div className="review-checklist">
                {checks.map((check) => {
                  const Icon = statusIcons[check.status];
                  return (
                    <div
                      key={check.id}
                      className={cn('review-check', `review-check--${check.status}`)}
                    >
                      <Icon size={18} />
                      <span>{check.label}</span>
                      <StatusBadge status={check.status}>{check.status}</StatusBadge>
                    </div>
                  );
                })}
              </div>
            </ReviewCard>

            <ReviewCard title="Execution Agents & Transfer Rules" icon={Gavel} className="review-execution-card">
              <div className="review-execution-grid">
                <section className="review-rule-panel">
                  <header>
                    <div>
                      <UsersRound size={18} />
                      <h3>Primary Agents</h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => navigate(ROUTES.tokenIssuanceStep('agents'))}
                      aria-label="Edit governance agents"
                    >
                      <Edit3 size={14} /> Edit
                    </button>
                  </header>
                  <div className="review-agent-list">
                    {TOKEN_CREATION_AGENT_ROLES.map((role) => (
                      <AddressDisplay
                        key={role.key}
                        label={role.name}
                        address={agents[role.key]?.address}
                        compact
                      />
                    ))}
                  </div>
                </section>

                <section className="review-rule-panel">
                  <header>
                    <div>
                      <Landmark size={18} />
                      <h3>Transfer Constraints</h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => navigate(ROUTES.tokenIssuanceStep('compliance'))}
                      aria-label="Edit compliance rules"
                    >
                      <Edit3 size={14} /> Edit
                    </button>
                  </header>
                  <dl className="review-transfer-list">
                    <div>
                      <dt>Max Investors</dt>
                      <dd>
                        {compliance.maximumInvestors
                          ? formatNumber(compliance.maximumInvestors)
                          : 'Unlimited'}
                      </dd>
                    </div>
                    <div>
                      <dt>Max Balance per Holder</dt>
                      <dd>
                        {compliance.maximumBalance
                          ? formatNumber(compliance.maximumBalance)
                          : 'Unlimited'}
                      </dd>
                    </div>
                    <div className="review-transfer-jurisdictions">
                      <dt>Restricted Jurisdictions</dt>
                      <dd className="review-transfer-jurisdictions__count">
                        <StatusBadge status={compliance.countries.length ? 'warning' : 'valid'}>
                          {compliance.countries.length
                            ? `${compliance.countries.length} restricted`
                            : 'None'}
                        </StatusBadge>
                      </dd>
                      <dd className="review-transfer-jurisdictions__details">
                        {compliance.countries.length ? (
                          <div
                            className="review-jurisdiction-list"
                            aria-label={`${compliance.countries.length} restricted jurisdictions`}
                          >
                            {compliance.countries.map((country) => (
                              <span
                                key={country?.countryUid || country?.countryName || String(country)}
                                className="review-jurisdiction-chip"
                              >
                                {country?.countryName || country?.label || String(country)}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="review-jurisdiction-empty">
                            No country restrictions are configured. Eligible investors may proceed
                            from any jurisdiction, subject to identity and compliance checks.
                          </p>
                        )}
                      </dd>
                    </div>
                  </dl>
                </section>
              </div>
            </ReviewCard>
          </div>

          <section className="review-deployment-panel">
            <span className="review-deployment-panel__icon" aria-hidden="true">
              <Rocket size={25} />
            </span>
            <div className="review-deployment-panel__heading">
              <span>{isReadyToDeploy ? 'Proposal validated' : 'Ready for deployment'}</span>
              <h2>{`Deploy on ${networkLabel} through the T-REX Gateway`}</h2>
              <p>
                {isReadyToDeploy
                  ? 'The backend validation is complete. Confirm the issuer wallet to sign the on-chain deployment.'
                  : 'The backend will validate the proposal, then the connected issuer wallet will sign the Gateway transaction.'}
              </p>
            </div>

            <div className="review-deployment-wallet">
              <div className="review-deployment-wallet__control">
                <span className="review-deployment-wallet__label">Deployment wallet</span>
                <WalletControl expanded />
              </div>

              <div
                className={cn(
                  'review-deployment-network',
                  wallet.isConnected && wallet.isCorrectNetwork
                    ? 'review-deployment-network--ready'
                    : wallet.isConnected
                      ? 'review-deployment-network--error'
                      : 'review-deployment-network--pending',
                )}
              >
                <span className="review-deployment-network__icon" aria-hidden="true">
                  <Network size={21} />
                </span>
                <div className="review-deployment-network__content">
                  <small>Connected network</small>
                  <strong>{connectedNetworkLabel}</strong>
                  <span>
                    {wallet.isConnected
                      ? wallet.isCorrectNetwork
                        ? `Ready to deploy on ${networkLabel}`
                        : `${networkLabel} is required for deployment`
                      : `Connect your wallet to ${networkLabel}`}
                  </span>
                </div>
                {wallet.isConnected && !wallet.isCorrectNetwork ? (
                  <button
                    type="button"
                    className="review-deployment-network__action"
                    onClick={switchToRequiredNetwork}
                    disabled={wallet.isBusy}
                  >
                    {wallet.switchingChainId === wallet.requiredChain.id ? (
                      <RefreshCcw size={15} className="animate-spin" />
                    ) : (
                      <Network size={15} />
                    )}
                    Switch to {wallet.requiredChain.name}
                  </button>
                ) : (
                  <StatusBadge status={wallet.isConnected ? 'valid' : 'pending'}>
                    {wallet.isConnected ? 'Ready' : 'Waiting'}
                  </StatusBadge>
                )}
              </div>
            </div>

            {wallet.isConnected &&
            tokenInformation.treasuryWallet &&
            wallet.address?.toLowerCase() !== tokenInformation.treasuryWallet.toLowerCase() ? (
              <InfoCallout title="Authorized wallet required" tone="warning" icon={ShieldCheck}>
                Reconnect with the approved organization wallet shown in Token Information before
                deploying this token.
              </InfoCallout>
            ) : null}

            {wallet.isConnected && !wallet.isCorrectNetwork ? (
              <InfoCallout title="Network required" tone="warning" icon={Network}>
                Use the Switch to {wallet.requiredChain?.name || 'required network'} button
                above. If the wallet does not open, use the deployment wallet menu to reconnect and
                try again.
              </InfoCallout>
            ) : null}

            <div className="review-deployment-warning">
              <AlertTriangle size={19} />
              <div>
                <strong>Immutability Notice</strong>
                <p>
                  Deployment creates the ERC-3643 suite on Sepolia. Token name, symbol, decimals
                  and core contract settings cannot be changed after confirmation.
                </p>
              </div>
            </div>

            <div className="review-deployment-panel__actions">
              <Button
                variant="secondary"
                icon={ArrowLeft}
                onClick={() => navigate(ROUTES.tokenIssuanceStep('agents'))}
              >
                Back to Agents
              </Button>
              <Button
                icon={Rocket}
                onClick={openDeployment}
                disabled={blocking}
                loading={startingDeployment}
              >
                {isReadyToDeploy ? 'Sign and Deploy Token' : 'Validate and Deploy Token'}
              </Button>
            </div>
            <small className="review-deployment-panel__note">
              Your connected issuer wallet signs the deployment and pays the Sepolia gas fee.
            </small>
          </section>
        </div>
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
