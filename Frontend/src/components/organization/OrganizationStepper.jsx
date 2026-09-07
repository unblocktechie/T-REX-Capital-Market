import { Check } from 'lucide-react';
import { ROUTES } from '@/config/routes';
import { cn } from '@/utils/cn';

export const organizationSteps = [
  {
    number: 1,
    title: 'Company Information',
    mobileTitle: 'Company',
    route: ROUTES.organizationCompany,
  },
  {
    number: 2,
    title: 'Jurisdiction',
    mobileTitle: 'Legal',
    route: ROUTES.organizationJurisdiction,
  },
  {
    number: 3,
    title: 'UBO Details',
    mobileTitle: 'UBO',
    route: ROUTES.organizationUbo,
  },
  {
    number: 4,
    title: 'Documentation',
    mobileTitle: 'Docs',
    route: ROUTES.organizationDocuments,
  },
  {
    number: 5,
    title: 'Review',
    mobileTitle: 'Review',
    route: ROUTES.organizationReview,
  },
];

export const getOrganizationStepRoute = (stepNumber) =>
  organizationSteps.find((step) => step.number === stepNumber)?.route || ROUTES.organizationCompany;

export function OrganizationStepper({ currentStep, highestStepReached = currentStep, onStepChange }) {
  const current = organizationSteps[currentStep - 1] || organizationSteps[0];
  const reachableStep = Math.max(currentStep, Number(highestStepReached) || currentStep);

  const selectStep = (stepNumber) => {
    if (!onStepChange || stepNumber === currentStep || stepNumber > reachableStep) return;
    onStepChange(stepNumber);
  };

  return (
    <div className="org-stepper" aria-label={`Organization onboarding step ${currentStep} of 5`}>
      <div className="org-stepper__mobile">
        <div className="org-stepper__mobile-summary">
          <div>
            <span>Step {currentStep} of 5</span>
            <strong>{current.title}</strong>
          </div>
          <b>{Math.round((currentStep / 5) * 100)}%</b>
        </div>

        <div className="org-stepper__mobile-track" aria-hidden="true">
          <i style={{ width: `${(currentStep / 5) * 100}%` }} />
        </div>

        <ol className="org-stepper__mobile-steps" aria-label="Organization onboarding steps">
          {organizationSteps.map((step) => {
            const complete = step.number !== currentStep && step.number < reachableStep;
            const active = step.number === currentStep;
            const visited = step.number <= reachableStep;
            const clickable = Boolean(onStepChange) && visited && !active;

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
        {organizationSteps.map((step) => {
          const complete = step.number < currentStep;
          const active = step.number === currentStep;
          const visited = step.number <= reachableStep;
          const clickable = Boolean(onStepChange) && visited && !active;
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
              {step.number < organizationSteps.length ? (
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
