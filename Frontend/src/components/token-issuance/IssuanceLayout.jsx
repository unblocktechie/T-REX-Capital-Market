import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { TOKEN_ISSUANCE_STEPS } from '@/config/tokenIssuance';
import { ROUTES } from '@/config/routes';
import { useTokenIssuanceStore } from '@/store/tokenIssuance.store';
import { IssuanceStepper } from './IssuanceStepper';

export function IssuanceLayout({
  stepKey,
  title,
  description,
  children,
  sidebar,
  onContinue,
  continueLabel,
  continueIcon,
  continueDisabled = false,
  continueLoading = false,
  onBack,
  footerExtra,
  stepErrors,
}) {
  const navigate = useNavigate();
  const completedSteps = useTokenIssuanceStore((state) => state.completedSteps);
  const updatedAt = useTokenIssuanceStore((state) => state.updatedAt);
  const currentStep = TOKEN_ISSUANCE_STEPS.find((step) => step.key === stepKey);

  const navigateToStep = (targetStep) => navigate(ROUTES.tokenIssuanceStep(targetStep));

  return (
    <div className="issuance-page">
      <div className="issuance-page__topbar">
        <button type="button" className="issuance-back-link" onClick={() => navigate(ROUTES.createToken)}>
          <ArrowLeft size={17} /> Issuance overview
        </button>
        <span className="issuance-progress-copy">
          Step {currentStep?.number || 1} of {TOKEN_ISSUANCE_STEPS.length}
          {updatedAt ? <small>Draft autosaved</small> : null}
        </span>
      </div>

      <IssuanceStepper
        currentStepKey={stepKey}
        completedSteps={completedSteps}
        stepErrors={stepErrors}
        onStepClick={navigateToStep}
      />

      <header className="issuance-header">
        <div>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
      </header>

      <div className={sidebar ? 'issuance-content-grid' : 'issuance-content-grid issuance-content-grid--single'}>
        <div className="issuance-main-column">{children}</div>
        {sidebar ? <aside className="issuance-side-column">{sidebar}</aside> : null}
      </div>

      <footer className="issuance-footer-actions">
        <div className="issuance-footer-actions__secondary">
          <Button variant="secondary" icon={ArrowLeft} onClick={onBack || (() => navigate(-1))}>
            Back
          </Button>
        </div>
        <div className="issuance-footer-actions__primary">
          {footerExtra}
          <Button
            icon={continueIcon}
            onClick={onContinue}
            disabled={continueDisabled}
            loading={continueLoading}
          >
            {continueLabel}
          </Button>
        </div>
      </footer>
    </div>
  );
}
