import { useOrganization } from '@/hooks/useOrganization';
import { isOrganizationReadyForSubmission } from '@/validations/organization.schemas';
import { OrganizationStepper } from './OrganizationStepper';

export function OrganizationPageLayout({
  step,
  eyebrow = 'Organization Verification (KYB)',
  title,
  description,
  children,
  side,
  onStepChange,
}) {
  const { organization } = useOrganization();
  const highestStepReached = Math.max(
    step,
    Number(organization.highestStepReached) || Number(organization.currentStep) || step,
    isOrganizationReadyForSubmission(organization) ? 5 : 1,
  );

  return (
    <div className="org-page">
      <OrganizationStepper
        currentStep={step}
        highestStepReached={highestStepReached}
        onStepChange={onStepChange}
      />
      <header className="org-page-header">
        <div>
          <span className="eyebrow">{eyebrow}</span>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
      </header>
      <div className={side ? 'org-layout-grid' : 'org-layout-grid org-layout-grid--single'}>
        <div className="org-main-column">{children}</div>
        {side}
      </div>
    </div>
  );
}
