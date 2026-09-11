import { Check, LayoutDashboard } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { ROUTES } from '@/config/routes';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useOrganization } from '@/hooks/useOrganization';
import { ORGANIZATION_STATUSES } from '@/services/organizationStorageService';

export default function OrganizationVerifiedPage() {
  useDocumentTitle('Organization Verified');
  const navigate = useNavigate();
  const { organization, markUserNotified } = useOrganization();

  const eligibleForOneTimeScreen =
    organization.status === ORGANIZATION_STATUSES.VERIFIED_SUCCESS_PENDING &&
    !organization.isNotified;
  const enteredAsEligibleRef = useRef(eligibleForOneTimeScreen);
  const notificationRequestRef = useRef(null);

  useEffect(() => {
    if (!enteredAsEligibleRef.current || notificationRequestRef.current) return;

    notificationRequestRef.current = markUserNotified().catch(() => {
      // Do not block the success screen when acknowledgement temporarily fails.
      // A later visit will retry while the backend still reports isNotified = 0.
      notificationRequestRef.current = null;
    });
  }, [markUserNotified]);

  const shouldKeepSuccessScreenOpen =
    enteredAsEligibleRef.current || eligibleForOneTimeScreen;

  if (!shouldKeepSuccessScreenOpen) {
    if (
      organization.status === ORGANIZATION_STATUSES.VERIFIED ||
      organization.isNotified
    ) {
      return <Navigate to={ROUTES.organizationOverview} replace />;
    }
    return <Navigate to={ROUTES.organization} replace />;
  }

  return (
    <div className="org-verified-page">
      <section className="org-verified-hero">
        <div className="org-success-mark" aria-hidden="true">
          <span><Check size={44} strokeWidth={2.5} /></span>
          <i /><b />
        </div>
        <span className="eyebrow">Organization verification complete</span>
        <h1>Organization Verified</h1>
        <p>{organization.company.legalName || 'Your organization'} has completed organization verification. You can now create tokens and manage investor access.</p>
        <Button
          size="lg"
          icon={LayoutDashboard}
          onClick={() => navigate(ROUTES.dashboard, { replace: true })}
        >
          Go to Dashboard
        </Button>
      </section>
    </div>
  );
}
