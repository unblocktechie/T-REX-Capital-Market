import { Check } from 'lucide-react';
import { INVESTOR_STEPS } from '@/constants/investor';
import { cn } from '@/utils/cn';

export function InvestorStepper({ currentStep, highestStepReached = currentStep, onStepChange }) {
  const visibleSteps = INVESTOR_STEPS.slice(0, 4);
  const totalSteps = visibleSteps.length;
  const displayedStep = Math.min(Math.max(Number(currentStep) || 1, 1), totalSteps);
  const current = visibleSteps[displayedStep - 1] || visibleSteps[0];
  const reachableStep = Math.min(
    totalSteps,
    Math.max(displayedStep, Number(highestStepReached) || displayedStep),
  );

  const selectStep = (stepNumber) => {
    const isNavigableStep = stepNumber <= 4;
    if (!onStepChange || !isNavigableStep || stepNumber === displayedStep || stepNumber > reachableStep) return;
    onStepChange(stepNumber);
  };

  return (
    <nav className="org-stepper investor-onboarding-stepper" aria-label={`Investor onboarding step ${displayedStep} of ${totalSteps}`}>
      <div className="org-stepper__mobile">
        <div className="org-stepper__mobile-summary">
          <div>
            <span>Step {displayedStep} of {totalSteps}</span>
            <strong>{current.title}</strong>
          </div>
          <b>{Math.round((displayedStep / totalSteps) * 100)}%</b>
        </div>

        <div className="org-stepper__mobile-track" aria-hidden="true">
          <i style={{ width: `${(displayedStep / totalSteps) * 100}%` }} />
        </div>

        <ol className="org-stepper__mobile-steps" aria-label="Investor onboarding steps">
          {visibleSteps.map((step) => {
            const complete = step.number < displayedStep;
            const active = step.number === displayedStep;
            const visited = step.number <= reachableStep;
            const clickable = Boolean(onStepChange) && visited && !active && step.number <= 4;

            return (
              <li
                key={step.number}
                className={cn(
                  complete && 'is-complete',
                  active && 'is-active',
                  visited && 'is-visited',
                )}
              >
                <button
                  type="button"
                  disabled={!clickable}
                  aria-current={active ? 'step' : undefined}
                  aria-label={
                    active
                      ? `Current step ${step.number}: ${step.title}`
                      : clickable
                        ? `Go to step ${step.number}: ${step.title}`
                        : `Step ${step.number}: ${step.title}`
                  }
                  onClick={() => selectStep(step.number)}
                >
                  <span className="org-stepper__mobile-marker">
                    {complete ? <Check size={13} aria-hidden="true" /> : step.number}
                  </span>
                  <small>{step.mobileTitle}</small>
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      <ol className="org-stepper__desktop">
        {visibleSteps.map((step) => {
          const complete = step.number < displayedStep;
          const active = step.number === displayedStep;
          const visited = step.number <= reachableStep;
          const clickable = Boolean(onStepChange) && visited && !active && step.number <= 4;
          const StepContent = clickable ? 'button' : 'div';

          return (
            <li
              key={step.number}
              className={cn(
                complete && 'is-complete',
                active && 'is-active',
                visited && 'is-visited',
                clickable && 'is-clickable',
              )}
              aria-current={active ? 'step' : undefined}
            >
              <StepContent
                className="org-stepper__button"
                {...(clickable
                  ? {
                      type: 'button',
                      onClick: () => selectStep(step.number),
                      'aria-label': `Go to step ${step.number}: ${step.title}`,
                    }
                  : {})}
              >
                <span className="org-stepper__marker">
                  {complete ? <Check size={16} aria-hidden="true" /> : step.number}
                </span>
                <span className="org-stepper__copy">
                  <small>Step {step.number}</small>
                  <strong>{step.title}</strong>
                </span>
              </StepContent>
              {step.number < totalSteps ? (
                <span className="org-stepper__line" aria-hidden="true">
                  <i style={complete ? { width: '100%' } : undefined} />
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
