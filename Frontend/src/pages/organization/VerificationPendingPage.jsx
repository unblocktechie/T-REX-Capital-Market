import { Clock3, FileCheck2, LifeBuoy, LockKeyhole, ShieldCheck } from 'lucide-react';
import { Navigate } from 'react-router-dom';
import { Card } from '@/components/ui/Card';
import { VerificationTimeline } from '@/components/organization/VerificationTimeline';
import { ROUTES } from '@/config/routes';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useOrganization } from '@/hooks/useOrganization';
import { ORGANIZATION_STATUSES } from '@/services/organizationStorageService';

export default function VerificationPendingPage() {
  useDocumentTitle('Verification in Progress');
  const { organization } = useOrganization();

  if (organization.status === ORGANIZATION_STATUSES.REJECTED) {
    return <Navigate to={ROUTES.organizationRejected} replace />;
  }
  if (organization.status === ORGANIZATION_STATUSES.VERIFIED_SUCCESS_PENDING) {
    return <Navigate to={organization.verifiedScreenViewed ? ROUTES.organizationOverview : ROUTES.organizationVerified} replace />;
  }
  if (organization.status === ORGANIZATION_STATUSES.VERIFIED) {
    return <Navigate to={ROUTES.organizationOverview} replace />;
  }
  if (organization.status !== ORGANIZATION_STATUSES.SUBMITTED) {
    return <Navigate to={ROUTES.organization} replace />;
  }

  return (
    <div className="org-status-page">
      <Card className="org-status-hero">
        <div className="org-status-hero__content">
          <span className="org-status-pill"><FileCheck2 size={15} /> Application Received</span>
          <span className="org-status-hero__icon"><ShieldCheck size={34} /></span>
          <h1>Verification in Progress</h1>
          <p>The compliance team is reviewing your KYB documentation, legal entity details, and beneficial ownership disclosures.</p>
          <div className="org-wait-card">
            <Clock3 size={22} />
            <div><small>Estimated Wait Time</small><strong>2–3 Business Days</strong></div>
          </div>
          <div className="org-lock-message"><LockKeyhole size={16} /> Application submitted. All organization information is locked and read-only.</div>
        </div>
        <div className="org-status-hero__support">
          <LifeBuoy size={21} />
          <div>
            <strong>Compliance support</strong>
            <p>Keep your application reference available if the review team requests clarification.</p>
          </div>
        </div>
      </Card>
      <VerificationTimeline />
    </div>
  );
}
