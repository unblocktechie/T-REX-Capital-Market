import {
  ArrowRight,
  BadgeCheck,
  Fingerprint,
  LockKeyhole,
  Rocket,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { tokenStepFromCurrentStep } from '@/api/tokens/token.mapper';
import { Button } from '@/components/ui/Button';
import { ROUTES } from '@/config/routes';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useMyToken } from '@/hooks/useMyToken';
import { useTokenIssuanceStore } from '@/store/tokenIssuance.store';

const roadmap = [
  {
    title: 'Basics',
    description: 'Define the token name, symbol, decimals, price, treasury wallet and description.',
    icon: BadgeCheck,
  },
  {
    title: 'Investor Verification',
    description: 'Choose the identity and eligibility checks investors must complete.',
    icon: Fingerprint,
  },
  {
    title: 'Transfer Rules',
    description: 'Configure investor limits, balance limits and geographic restrictions.',
    icon: ShieldCheck,
  },
  {
    title: 'Platform Permissions',
    description: 'Review the authorized wallets used for token operations and investor approval.',
    icon: LockKeyhole,
  },
  {
    title: 'Review',
    description: 'Review all settings before creating the token.',
    icon: Rocket,
  },
];

const standardBenefits = [
  ['Investor verification before transfers', Fingerprint],
  ['Verified investor access', ShieldCheck],
  ['Clear verification and transaction records', BadgeCheck],
  ['Transfer rules checked before every transfer', LockKeyhole],
];

export default function TokenIssuanceOverviewPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const myToken = useMyToken();
  const backend = useTokenIssuanceStore((state) => state.backend);
  const completedSteps = useTokenIssuanceStore((state) => state.completedSteps);
  const resetIssuance = useTokenIssuanceStore((state) => state.resetIssuance);
  useDocumentTitle('Asset Issuance Wizard');

  const hasStartedWizard = Boolean(
    myToken.hasToken ||
      backend.tokenUid ||
      completedSteps.includes('token-information'),
  );

  const currentBackendStep =
    myToken.token?.currentStep ||
    myToken.token?.tokenCurrentStep ||
    backend.currentStep;

  let continueStep = tokenStepFromCurrentStep(currentBackendStep);

  // A token record is created only after the first step is saved successfully. Some older
  // backend responses can still report `information` immediately after that save, so continue
  // from the next incomplete step instead of sending the issuer back to an already-saved form.
  if (hasStartedWizard && continueStep === 'token-information') {
    continueStep = 'identity-claims';
  }

  const openWizard = () => {
    if (hasStartedWizard) {
      navigate(ROUTES.tokenIssuanceStep(continueStep));
      return;
    }

    resetIssuance();
    queryClient.removeQueries({ queryKey: ['token-issuance', 'bootstrap'] });
    navigate(ROUTES.tokenIssuanceStep('token-information'));
  };

  return (
    <div className="issuance-overview-page">
      <header className="issuance-overview-hero">
        <div>
          <span className="eyebrow">Guided token setup</span>
          <h1>Asset Issuance Wizard</h1>
          <p>
            Create a compliant security token through a guided setup designed for institutional
            issuers.
          </p>
        </div>
        <Button
          icon={hasStartedWizard ? ArrowRight : Rocket}
          size="lg"
          onClick={openWizard}
        >
          {hasStartedWizard ? 'Continue Wizard' : 'Start Wizard'}
        </Button>
      </header>

      <div className="issuance-overview-grid">
        <section className="issuance-roadmap-card">
          <div className="issuance-card-heading">
            <span className="issuance-card-icon">
              <Rocket size={20} />
            </span>
            <div>
              <span className="eyebrow">Setup Roadmap</span>
              <h2>Five focused stages from setup to launch</h2>
              <p>
                Each completed step is saved securely to your account, so your token configuration stays
                consistent as you move through the wizard.
              </p>
            </div>
          </div>
          <div className="issuance-roadmap-list">
            {roadmap.map((step, index) => {
              const Icon = step.icon;
              return (
                <article key={step.title}>
                  <span className="issuance-roadmap-list__number">{index + 1}</span>
                  <span className="issuance-roadmap-list__icon">
                    <Icon size={18} />
                  </span>
                  <div>
                    <strong>{step.title}</strong>
                    <p>{step.description}</p>
                  </div>
                  <ArrowRight size={17} aria-hidden="true" />
                </article>
              );
            })}
          </div>
        </section>

        <aside className="issuance-overview-sidebar">
          <section className="issuance-standard-card">
            <div className="issuance-card-heading issuance-card-heading--compact">
              <span className="issuance-card-icon">
                <ShieldCheck size={20} />
              </span>
              <div>
                <span className="eyebrow">Technical standard · ERC-3643</span>
                <h2>Investor eligibility built into every transfer</h2>
              </div>
            </div>
            <p>
              ERC-3643 helps enforce investor verification and transfer rules automatically.
              Technical blockchain details remain available when you need them.
            </p>
            <div className="issuance-benefit-list">
              {standardBenefits.map(([label, Icon]) => (
                <span key={label}>
                  <Icon size={16} /> {label}
                </span>
              ))}
            </div>
          </section>

          <section className="issuance-help-card issuance-instant-card">
            <span className="issuance-card-icon">
              <Zap size={20} />
            </span>
            <div>
              <h3>Instant Settlement</h3>
              <p>
                Approved token transfers settle on-chain after the investor and transfer requirements
                are satisfied.
              </p>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
