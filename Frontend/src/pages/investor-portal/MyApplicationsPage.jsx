import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, ClipboardList, Eye, Search, ShieldCheck, Store } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { MarketplaceStatusBadge } from '@/components/investor-marketplace/MarketplaceStatusBadge';
import { MarketplaceTokenImage } from '@/components/investor-marketplace/MarketplaceTokenImage';
import { DataTable } from '@/components/tables/DataTable';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ROUTES } from '@/config/routes';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { investorMarketplaceService } from '@/services/investor/investorMarketplaceService';
import { getErrorMessage } from '@/utils/error';

const formatNumber = (value) => value == null ? '—' : Number(value).toLocaleString();
const formatPrice = (value, currency) => value == null ? '—' : `$${Number(value).toLocaleString()}${currency ? ` ${currency}` : ''}`;

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
      .catch((error) => active && toast.error(getErrorMessage(error, 'Unable to load your investment interests.')))
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
    ].join(' ').toLowerCase().includes(search));
  }, [applications, query]);

  const columns = useMemo(() => [
    {
      key: 'name',
      header: 'Token',
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
    { key: 'status', header: 'Status', render: (value) => <MarketplaceStatusBadge status={value} /> },
    { key: 'price', header: 'Token Price', render: (value, application) => <strong>{formatPrice(value, application.currency)}</strong> },
    { key: 'submittedAt', header: 'Submitted', render: (value) => <strong>{value ? new Date(value).toLocaleDateString() : '—'}</strong> },
    { key: 'maxBalance', header: 'Max Balance / Holder', render: (value, application) => <strong>{value == null ? '—' : `${formatNumber(value)} ${application.symbol}`}</strong> },
    { key: 'maxInvestors', header: 'Max Holders', render: (value) => <strong>{value == null ? '—' : formatNumber(value)}</strong> },
    {
      key: 'action',
      header: 'Action',
      align: 'end',
      render: (_value, application) => <Button variant="secondary" icon={Eye} onClick={() => navigate(ROUTES.applicationDetail(application.interestUid || application.interest?.interestUid || application.id))}>View Details</Button>,
    },
  ], [navigate]);

  return (
    <div className="page-stack investor-applications-page marketplace-applications-workspace">
      <header className="marketplace-page-header marketplace-applications-header">
        <div>
          <span className="eyebrow">Application tracking</span>
          <h1>My Applications</h1>
          <p>Track every investment interest submitted through the marketplace and follow the issuer&apos;s current decision status.</p>
        </div>
        <Button icon={Store} onClick={() => navigate(ROUTES.marketplace)}>Explore Marketplace <ArrowRight size={17} /></Button>
      </header>

      {loading || applications.length ? (
        <>
          <Card className="marketplace-application-toolbar">
            <label className="marketplace-application-search"><Search size={16} /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search applications" aria-label="Search investment applications" /></label>
            <span><ShieldCheck size={15} /> {applications.length} investment interest{applications.length === 1 ? '' : 's'}</span>
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
          <p>Investment interests you submit for token offerings will appear here with the issuer&apos;s current status.</p>
          <Button variant="secondary" icon={Store} onClick={() => navigate(ROUTES.marketplace)}>Browse available offerings</Button>
        </Card>
      )}
    </div>
  );
}
