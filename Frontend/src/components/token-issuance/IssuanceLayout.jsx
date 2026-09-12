import { AlertTriangle, ArrowLeft, RefreshCcw } from 'lucide-react';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { InfoCallout } from '@/components/token-issuance/IssuancePrimitives';
import { Button } from '@/components/ui/Button';
import { TOKEN_ISSUANCE_STEPS } from '@/config/tokenIssuance';
import { ROUTES } from '@/config/routes';
import { useTokenIssuanceBootstrap } from '@/hooks/useTokenIssuanceBootstrap';
import { useTokenIssuanceStore } from '@/store/tokenIssuance.store';
import { cn } from '@/utils/cn';
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
  hideFooter = false,
  pageClassName,
}) {
  const navigate = useNavigate();
  const completedSteps = useTokenIssuanceStore((state) => state.completedSteps);
  const backend = useTokenIssuanceStore((state) => state.backend);
  const bootstrap = useTokenIssuanceBootstrap();
  const currentStep = TOKEN_ISSUANCE_STEPS.find((step) => step.key === stepKey);

  useEffect(() => {
    if (!backend.hydrated) return;

    if (backend.isLocked && stepKey !== 'review') {
      navigate(ROUTES.tokenIssuanceStep('review'), { replace: true });
      return;
    }

    const currentIndex = TOKEN_ISSUANCE_STEPS.findIndex((step) => step.key === stepKey);
    const unlocked =
      currentIndex <= 0 ||
      TOKEN_ISSUANCE_STEPS.slice(0, currentIndex).every((step) =>
        completedSteps.includes(step.key),
      );

    if (!unlocked) {
      const firstIncomplete = TOKEN_ISSUANCE_STEPS.find(
        (step) => step.key !== 'review' && !completedSteps.includes(step.key),
      );
      navigate(ROUTES.tokenIssuanceStep(firstIncomplete?.key || 'token-information'), {
        replace: true,
      });
    }
  }, [backend.hydrated, backend.isLocked, completedSteps, navigate, stepKey]);

  const navigateToStep = (targetStep) => navigate(ROUTES.tokenIssuanceStep(targetStep));
  const savedLabel = backend.lastSavedAt || backend.imageAvailable ? 'Saved securely' : '';
  const normalizedBackendStatus = String(backend.status || '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
  const backendBlocksContinue =
    bootstrap.isLoading || Boolean(bootstrap.error) || backend.isLocked;

  return (
    <div className={cn('issuance-page', pageClassName)}>
      <div className="issuance-page__topbar">
        <button type="button" className="issuance-back-link" onClick={() => navigate(ROUTES.createToken)}>
          <ArrowLeft size={17} /> Asset setup overview
        </button>
        <span className="issuance-progress-copy">
          Step {currentStep?.number || 1} of {TOKEN_ISSUANCE_STEPS.length}
          {savedLabel ? <small>{savedLabel}</small> : null}
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

      {currentStep?.guidance ? (
        <section className="issuance-step-guidance" aria-label="Step guidance">
          <span className="issuance-step-guidance__number">{currentStep.number}</span>
          <div>
            <strong>What to do</strong>
            <p>{currentStep.guidance}</p>
          </div>
          <div>
            <strong>Why it matters</strong>
            <p>{currentStep.impact}</p>
          </div>
        </section>
      ) : null}

      {bootstrap.error ? (
        <div className="issuance-backend-error">
          <InfoCallout title="Connection required" tone="warning" icon={AlertTriangle}>
            {bootstrap.error}
          </InfoCallout>
          <Button
            variant="secondary"
            icon={RefreshCcw}
            onClick={() => bootstrap.refresh()}
            loading={bootstrap.isFetching}
          >
            Retry
          </Button>
        </div>
      ) : null}

      {backend.isLocked ? (
        <InfoCallout title="Asset setup is locked" tone="info">
          {normalizedBackendStatus === 'deploymentpending'
            ? 'Asset creation is in progress. These settings cannot be changed while the required account actions are being submitted and verified.'
            : normalizedBackendStatus === 'deploymentfailed'
              ? 'The previous asset-creation action did not complete. Review its status before trying again; the saved settings remain unchanged.'
              : 'This asset setup has already been validated for creation. Its locked settings can no longer be changed.'}
        </InfoCallout>
      ) : null}

      <div className={sidebar ? 'issuance-content-grid' : 'issuance-content-grid issuance-content-grid--single'}>
        <div className="issuance-main-column">{children}</div>
        {sidebar ? <aside className="issuance-side-column">{sidebar}</aside> : null}
      </div>

      {!hideFooter ? (
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
              disabled={continueDisabled || backendBlocksContinue}
              loading={continueLoading || bootstrap.isLoading}
            >
              {continueLabel}
            </Button>
          </div>
        </footer>
      ) : null}
    </div>
  );
}
