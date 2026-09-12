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
    title: 'Asset Details',
    description: 'Add your asset name, symbol, price, payment details, and description.',
    impact: 'These details identify your asset and define how investors will recognize and value it.',
    icon: BadgeCheck,
  },
  {
    title: 'Who Can Invest',
    description: 'Choose the checks investors must pass before they can participate.',
    impact: 'Only investors who meet the requirements you select will be allowed to invest or receive the asset.',
    icon: Fingerprint,
  },
  {
    title: 'Investment Rules',
    description: 'Set limits and restrictions for your investors.',
    impact: 'These rules help control who can invest, how much they can hold, and where transfers are allowed.',
    icon: ShieldCheck,
  },
  {
    title: 'Who Manages This Asset',
    description: 'Review the approved organization account used to manage the asset.',
    impact: 'These permissions show what your approved organization account can manage after creation.',
    icon: LockKeyhole,
  },
  {
    title: 'Review & Create',
    description: 'Review all your settings and create the asset when everything is ready.',
    impact: 'Your final settings are checked before the asset is created and recorded on the blockchain.',
    icon: Rocket,
  },
];

const standardBenefits = [
  ['Verify investors before they invest', Fingerprint],
  ['Allow access only to approved investors', ShieldCheck],
  ['Apply your investment rules automatically', LockKeyhole],
  ['Keep investment activity securely recorded', BadgeCheck],
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
          <span className="eyebrow">Guided asset setup</span>
          <h1>Create Your Investment Asset</h1>
          <p>
            Set up your asset in a few simple steps. We’ll guide you through the information,
            investor requirements, and rules needed to launch.
          </p>
        </div>
        <Button
          icon={hasStartedWizard ? ArrowRight : Rocket}
          size="lg"
          onClick={openWizard}
        >
          {hasStartedWizard ? 'Continue Setup' : 'Start Setup'}
        </Button>
      </header>

      <div className="issuance-overview-grid">
        <section className="issuance-roadmap-card">
          <div className="issuance-card-heading">
            <span className="issuance-card-icon">
              <Rocket size={20} />
            </span>
            <div>
              <span className="eyebrow">Simple Setup</span>
              <h2>Set Up Your Asset in 5 Simple Steps</h2>
              <p>
                Complete each step to prepare your asset for investors. Your progress is saved automatically.
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
                    <small className="issuance-roadmap-list__impact">Why it matters: {step.impact}</small>
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
                <span className="eyebrow">Built-In Investor Checks</span>
                <h2>Your rules are checked automatically</h2>
              </div>
            </div>
            <p>
              Your investor requirements and investment rules are checked automatically before investments and transfers are completed.
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
              <h3>Fast, Automatic Processing</h3>
              <p>
                Once an investment meets your requirements, it can be processed automatically and securely recorded on the blockchain.
              </p>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
