import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, ClipboardList, Eye, Search, ShieldCheck, Store } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { AppStatusBadge } from '@/components/common/AppStatusBadge';
import { MarketplaceTokenImage } from '@/components/investor-marketplace/MarketplaceTokenImage';
import { DataTable } from '@/components/tables/DataTable';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ROUTES } from '@/config/routes';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { investorMarketplaceService } from '@/services/investor/investorMarketplaceService';
import { getErrorMessage } from '@/utils/error';
import { getInvestmentJourney } from '@/utils/investmentJourney';

export default function MyApplicationsPage() {
  useDocumentTitle('My Applications');
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const selectedToken = searchParams.get('token');
  const [applications, setApplications] = useState([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    investorMarketplaceService
      .listApplications()
      .then((items) => active && setApplications(items || []))
      .catch((error) => active && toast.error(getErrorMessage(error, 'Unable to load your investment applications.')))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase();
    return applications.filter((application) => !search || [
      application.name,
      application.symbol,
      application.issuer,
      application.statusMeta?.label,
      getInvestmentJourney({ status: application.interest?.status || application.status, viewerRole: 'investor', canResubmit: application.interest?.canResubmit, rejectReasonType: application.interest?.rejectReasonType }).statusLabel,
    ].join(' ').toLowerCase().includes(search));
  }, [applications, query]);

  const columns = useMemo(() => [
    {
      key: 'name',
      header: 'Asset',
      render: (_value, application) => (
        <div className="marketplace-application-token">
          <MarketplaceTokenImage token={application} size="sm" />
          <div>
            <strong>{application.symbol || '—'}</strong>
            <small>{[application.name, application.issuer].filter((value) => value && value !== '—' && value !== 'Not available').join(' · ') || '—'}</small>
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Where you are',
      render: (_value, application) => {
        const journey = getInvestmentJourney({ status: application.interest?.status || application.status, viewerRole: 'investor', canResubmit: application.interest?.canResubmit, rejectReasonType: application.interest?.rejectReasonType });
        return <AppStatusBadge status={application.interest?.status || application.status} label={journey.statusLabel} tone={journey.tone} />;
      },
    },
    {
      key: 'nextStep',
      header: 'What happens now',
      render: (_value, application) => {
        const journey = getInvestmentJourney({ status: application.interest?.status || application.status, viewerRole: 'investor', canResubmit: application.interest?.canResubmit, rejectReasonType: application.interest?.rejectReasonType });
        return <div className="application-journey-table-copy"><strong>{journey.title}</strong><small>Next action: {journey.owner}</small></div>;
      },
    },
    { key: 'submittedAt', header: 'Submitted', render: (value) => <strong>{value ? new Date(value).toLocaleDateString() : '—'}</strong> },
    {
      key: 'action',
      header: 'Action',
      align: 'end',
      render: (_value, application) => <Button variant="secondary" icon={Eye} onClick={() => navigate(ROUTES.applicationDetail(application.interestUid || application.interest?.interestUid || application.id))}>View Progress</Button>,
    },
  ], [navigate]);

  return (
    <div className="page-stack investor-applications-page marketplace-applications-workspace">
      <header className="marketplace-page-header marketplace-applications-header">
        <div>
          <span className="eyebrow">Your investment progress</span>
          <h1>My Applications</h1>
          <p>See what is happening with each application, who needs to act next, and when you are ready to invest.</p>
        </div>
        <Button icon={Store} onClick={() => navigate(ROUTES.marketplace)}>Explore Marketplace <ArrowRight size={17} /></Button>
      </header>

      {loading || applications.length ? (
        <>
          <Card className="marketplace-application-toolbar">
            <label className="marketplace-application-search"><Search size={16} /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search applications" aria-label="Search investment applications" /></label>
            <span><ShieldCheck size={15} /> Open an application to see its full 5-step journey.</span>
          </Card>

          <Card className="marketplace-application-table-card common-table-card">
            <DataTable
              columns={columns}
              rows={filtered}
              loading={loading}
              rowKey={(row) => row.interestUid || row.id}
              rowClassName={(row) => selectedToken === row.id ? 'is-highlighted' : ''}
              emptyTitle="No matching applications"
              emptyDescription="Try another application search term."
            />
          </Card>
        </>
      ) : (
        <Card className="investor-portal-empty-card">
          <span className="investor-portal-empty-icon"><ClipboardList size={30} /></span>
          <h2>No applications yet</h2>
          <p>Your investment applications will appear here with a clear next step and who needs to act.</p>
          <Button variant="secondary" icon={Store} onClick={() => navigate(ROUTES.marketplace)}>Browse available offerings</Button>
        </Card>
      )}
    </div>
  );
}
