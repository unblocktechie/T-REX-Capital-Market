import { Check } from 'lucide-react';
import { TOKEN_ISSUANCE_STEPS } from '@/config/tokenIssuance';
import { cn } from '@/utils/cn';

export function IssuanceStepper({ currentStepKey, completedSteps, stepErrors = {}, onStepClick }) {
  const currentIndex = TOKEN_ISSUANCE_STEPS.findIndex((step) => step.key === currentStepKey);
  const current = TOKEN_ISSUANCE_STEPS[currentIndex] || TOKEN_ISSUANCE_STEPS[0];
  const completedStepSet = new Set(completedSteps);

  const isStepUnlocked = (targetIndex) =>
    targetIndex === 0 ||
    TOKEN_ISSUANCE_STEPS.slice(0, targetIndex).every((step) =>
      completedStepSet.has(step.key),
    );

  const selectStep = (targetStep) => {
    if (!targetStep || !onStepClick) return;
    onStepClick(targetStep);
  };

  return (
    <div className="org-stepper issuance-stepper-org" aria-label={`Asset setup step ${current.number} of ${TOKEN_ISSUANCE_STEPS.length}`}>
      <div className="org-stepper__mobile">
        <div className="org-stepper__mobile-summary">
          <div>
            <span>Step {current.number} of {TOKEN_ISSUANCE_STEPS.length}</span>
            <strong>{current.label}</strong>
          </div>
          <b>{Math.round((current.number / TOKEN_ISSUANCE_STEPS.length) * 100)}%</b>
        </div>

        <div className="org-stepper__mobile-track" aria-hidden="true">
          <i style={{ width: `${(current.number / TOKEN_ISSUANCE_STEPS.length) * 100}%` }} />
        </div>

        <ol className="org-stepper__mobile-steps" aria-label="Asset setup steps">
          {TOKEN_ISSUANCE_STEPS.map((step, index) => {
            const complete = completedSteps.includes(step.key);
            const active = step.key === currentStepKey;
            const unlocked = isStepUnlocked(index);
            const visited = complete || active || index <= currentIndex || unlocked;
            const clickable = Boolean(onStepClick) && unlocked && !active;
            const hasError = Boolean(stepErrors?.[step.key]);

            return (
              <li
                key={step.key}
                className={cn(
                  complete && 'is-complete',
                  active && 'is-active',
                  visited && 'is-visited',
                  hasError && 'has-error',
                )}
              >
                <button
                  type="button"
                  disabled={!clickable}
                  aria-current={active ? 'step' : undefined}
                  aria-label={
                    active
                      ? `Current step ${step.number}: ${step.label}`
                      : clickable
                        ? `Go to step ${step.number}: ${step.label}`
                        : `Step ${step.number}: ${step.label}`
                  }
                  onClick={() => clickable && selectStep(step.key)}
                >
                  <span className="org-stepper__mobile-marker">
                    {complete ? <Check size={13} aria-hidden="true" /> : step.number}
                  </span>
                  <small>{step.shortLabel}</small>
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      <ol className="org-stepper__desktop">
        {TOKEN_ISSUANCE_STEPS.map((step, index) => {
          const complete = completedSteps.includes(step.key);
          const active = step.key === currentStepKey;
          const unlocked = isStepUnlocked(index);
          const visited = complete || active || index <= currentIndex || unlocked;
          const clickable = Boolean(onStepClick) && unlocked && !active;
          const hasError = Boolean(stepErrors?.[step.key]);
          const StepContent = clickable ? 'button' : 'div';

          return (
            <li
              key={step.key}
              className={cn(
                complete && 'is-complete',
                active && 'is-active',
                visited && 'is-visited',
                clickable && 'is-clickable',
                hasError && 'has-error',
              )}
              aria-current={active ? 'step' : undefined}
            >
              <StepContent
                className="org-stepper__button"
                {...(clickable
                  ? {
                      type: 'button',
                      onClick: () => selectStep(step.key),
                      'aria-label': `Go to step ${step.number}: ${step.label}`,
                    }
                  : {})}
              >
                <span className="org-stepper__marker">
                  {complete ? <Check size={16} aria-hidden="true" /> : step.number}
                </span>
                <span className="org-stepper__copy">
                  <small>Step {step.number}</small>
                  <strong>{step.label}</strong>
                </span>
              </StepContent>
              {step.number < TOKEN_ISSUANCE_STEPS.length ? (
                <span className="org-stepper__line" aria-hidden="true">
                  <i style={complete ? { width: '100%' } : undefined} />
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
