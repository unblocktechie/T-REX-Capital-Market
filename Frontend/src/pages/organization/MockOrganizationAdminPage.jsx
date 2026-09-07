import { CheckCircle2, RotateCcw, Send, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import { OrganizationStatusBadge } from '@/components/organization/OrganizationStatusBadge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ROUTES } from '@/config/routes';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useOrganization } from '@/hooks/useOrganization';
import { organizationMockService } from '@/services/organizationMockService';
import { ORGANIZATION_STATUSES } from '@/services/organizationStorageService';

export default function MockOrganizationAdminPage() {
  useDocumentTitle('Mock Organization Admin');
  const { organization } = useOrganization();
  const [resetting, setResetting] = useState(false);

  if (!import.meta.env.DEV) return <Navigate to={ROUTES.dashboard} replace />;

  const reset = async () => {
    setResetting(true);
    try {
      await organizationMockService.resetTestData();
      toast.success('Organization test data reset');
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="org-mock-admin-page">
      <header className="org-page-header">
        <div><span className="eyebrow">Development only</span><h1>Organization Mock Admin</h1><p>Simulate the local compliance workflow without creating backend or admin API dependencies.</p></div>
      </header>
      <Card className="org-mock-admin-card">
        <div className="org-mock-admin-card__status">
          <span><ShieldCheck size={25} /></span>
          <div><small>Current local status</small><strong>{organization.status.replaceAll('_', ' ')}</strong></div>
          <OrganizationStatusBadge status={organization.status} />
        </div>
        <dl className="org-detail-grid">
          <div><dt>Organization</dt><dd>{organization.company.legalName || 'No organization entered'}</dd></div>
          <div><dt>Current Step</dt><dd>{organization.currentStep} of 5</dd></div>
          <div><dt>Submitted At</dt><dd>{organization.submittedAt ? new Date(organization.submittedAt).toLocaleString() : '—'}</dd></div>
          <div><dt>Verified At</dt><dd>{organization.verifiedAt ? new Date(organization.verifiedAt).toLocaleString() : '—'}</dd></div>
        </dl>
        <div className="org-mock-admin-actions">
          <Button icon={Send} onClick={() => { organizationMockService.markSubmitted(); toast.success('Status changed to SUBMITTED'); }} disabled={[
              ORGANIZATION_STATUSES.SUBMITTED,
              ORGANIZATION_STATUSES.VERIFIED_SUCCESS_PENDING,
              ORGANIZATION_STATUSES.VERIFIED,
            ].includes(organization.status)}>
            Mark as Submitted
          </Button>
          <Button
            icon={CheckCircle2}
            disabled={organization.status !== ORGANIZATION_STATUSES.SUBMITTED}
            onClick={() => {
              organizationMockService.markVerified();
              toast.success('Organization approved', {
                description: 'The one-time verified screen will appear on the next Organization visit.',
              });
            }}
          >
            Mark as Verified
          </Button>
          <Button variant="danger" icon={RotateCcw} loading={resetting} onClick={reset}>Reset Test Data</Button>
        </div>
        <p className="org-mock-admin-note">This route and its reset control are included only in development builds.</p>
      </Card>
    </div>
  );
}
