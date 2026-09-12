import { useEffect, useMemo, useState } from 'react';
import { Download, Eye, Filter, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { AppStatusBadge } from '@/components/common/AppStatusBadge';
import { InvestorHistoryPagination } from '@/components/investor-marketplace/InvestorHistoryPagination';
import { MarketplaceDropdown } from '@/components/investor-marketplace/MarketplaceDropdown';
import { DataTable } from '@/components/tables/DataTable';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { ROUTES } from '@/config/routes';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { issuerInvestorSubscriptionsService } from '@/services/issuer/issuerInvestorSubscriptionsService';
import { formatDate } from '@/utils/date';
import { getErrorMessage } from '@/utils/error';
import { getInvestmentJourney } from '@/utils/investmentJourney';

const PAGE_SIZE = 5;

const INTEREST_STATUS_OPTIONS = [
  { value: 'all', label: 'All Requests', description: 'Every investment request' },
  { value: 'submitIntrest', label: 'Needs My Review', description: 'Applications waiting for your review' },
  { value: 'claimSubmitted', label: 'Needs Final Approval', description: 'Investors who finished verification and need your approval' },
  { value: 'verifiedByIssuer', label: 'Waiting for Investor', description: 'Your review is complete and the investor must finish verification' },
  { value: 'pending', label: 'Investor Completing Application', description: 'The investor still needs to provide required information' },
  { value: 'approved', label: 'Approved', description: 'Requests that reached approval' },
  { value: 'rejected', label: 'Not Approved', description: 'Requests that were not approved' },
  { value: 'cancelled', label: 'Cancelled', description: 'Requests that are no longer active' },
];

function exportTextFile(filename, text) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

const csvEscape = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;

export default function IssuerInvestorsPage() {
  useDocumentTitle('Investment Requests');
  const navigate = useNavigate();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    let active = true;
    setLoading(true);
    issuerInvestorSubscriptionsService
      .listRequests({ status: statusFilter })
      .then((items) => active && setRequests(items || []))
      .catch((error) => {
        if (!active) return;
        setRequests([]);
        toast.error(getErrorMessage(error, 'Unable to load investment requests.'));
      })
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [statusFilter]);

  const visibleRequests = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return requests;

    return requests.filter((request) => [
      request.investorName,
      request.investorCode,
      request.email,
      request.tokenName,
      request.tokenSymbol,
      request.interestUid,
      request.requestReference,
    ].some((value) => String(value || '').toLowerCase().includes(query)));
  }, [requests, search]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(visibleRequests.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = useMemo(() => {
    const startIndex = (currentPage - 1) * PAGE_SIZE;
    return visibleRequests.slice(startIndex, startIndex + PAGE_SIZE);
  }, [currentPage, visibleRequests]);
  const pageStart = visibleRequests.length ? ((currentPage - 1) * PAGE_SIZE) + 1 : 0;
  const pageEnd = visibleRequests.length ? Math.min(currentPage * PAGE_SIZE, visibleRequests.length) : 0;

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const columns = useMemo(() => [
    {
      key: 'investorName',
      header: 'Investor',
      render: (_value, request) => (
        <div className="issuer-investor-cell">
          <div className="issuer-avatar">{request.investorName.slice(0, 1).toUpperCase()}</div>
          <div><strong>{request.investorName}</strong><small>{request.email || request.investorCode || 'Investor application'}</small></div>
        </div>
      ),
    },
    {
      key: 'tokenName',
      header: 'Asset',
      render: (_value, request) => <div className="application-journey-table-copy"><strong>{request.tokenName || '—'}</strong><small>{request.tokenSymbol || 'Investment asset'}</small></div>,
    },
    {
      key: 'status',
      header: 'Where it is',
      render: (_value, request) => {
        const journey = getInvestmentJourney({ status: request.status, viewerRole: 'issuer', canResubmit: request.canResubmit, rejectReasonType: request.rejectReasonType });
        return <AppStatusBadge status={request.status} label={journey.statusLabel} tone={journey.tone} compact />;
      },
    },
    {
      key: 'nextAction',
      header: 'Who acts next',
      render: (_value, request) => {
        const journey = getInvestmentJourney({ status: request.status, viewerRole: 'issuer', canResubmit: request.canResubmit, rejectReasonType: request.rejectReasonType });
        return <div className="application-journey-table-copy"><strong>{journey.title}</strong><small>Next action: {journey.owner}</small></div>;
      },
    },
    {
      key: 'requestedDate',
      header: 'Submitted',
      render: (value) => <div className="issuer-date-cell"><strong>{formatDate(value, 'MMM DD, YYYY')}</strong><small>{formatDate(value, 'hh:mm A')}</small></div>,
    },
    {
      key: 'actions',
      header: 'Action',
      align: 'end',
      render: (_value, request) => <Button variant="secondary" size="sm" icon={Eye} onClick={() => navigate(`${ROUTES.investors}/${request.interestUid}`)}>View Progress</Button>,
    },
  ], [navigate]);

  const handleExport = () => {
    const header = ['Investor', 'Investor Account', 'Status', 'Submitted At', 'Asset', 'Application ID'];
    const rows = requests.map((request) => [
      request.investorName,
      request.investorCode,
      request.status,
      request.requestedDate,
      request.tokenName,
      request.interestUid,
    ]);
    exportTextFile(`issuer-${statusFilter}-investment-interests.csv`, [header, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n'));
  };

  const selectedStatusLabel = INTEREST_STATUS_OPTIONS.find((item) => item.value === statusFilter)?.label.toLowerCase() || 'selected';

  return (
    <div className="page-stack issuer-investors-page issuer-investors-workspace">
      <header className="issuer-page-header issuer-subscriptions-header">
        <div>
          <span className="issuer-redemptions-eyebrow">Investor journey tracking</span>
          <h1>Investment Requests</h1>
          <p>See which requests need your action, which are waiting for the investor, and which are ready for final approval.</p>
        </div>
        <Button variant="secondary" icon={Download} disabled={!requests.length} onClick={handleExport}>Export CSV</Button>
      </header>

      <Card className="issuer-subscriptions-toolbar-card">
        <div className="issuer-subscriptions-toolbar">
          <Input
            aria-label="Search investment requests"
            placeholder="Search investor, asset or application ID"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            leading={Search}
          />
          <MarketplaceDropdown
            value={statusFilter}
            options={INTEREST_STATUS_OPTIONS}
            onChange={setStatusFilter}
            icon={Filter}
            ariaLabel="Filter investment requests by status"
            align="end"
            className="issuer-subscriptions-filter"
            menuClassName="issuer-subscriptions-filter-menu"
            portal
          />
        </div>
        <div className="issuer-subscriptions-toolbar__summary">
          <span>
            Showing <strong>{pageStart}{pageEnd > pageStart ? `–${pageEnd}` : ''}</strong> of {visibleRequests.length} request{visibleRequests.length === 1 ? '' : 's'}
            {visibleRequests.length !== requests.length ? ` (${requests.length} total)` : ''}
          </span>
          <span>Each status tells you who needs to act next.</span>
        </div>
      </Card>

      <Card className="issuer-table-card common-table-card issuer-subscriptions-table-card">
        <DataTable
          columns={columns}
          rows={pageRows}
          loading={loading}
          rowKey="interestUid"
          loadingRows={PAGE_SIZE}
          emptyTitle={search.trim() ? 'No matching requests' : statusFilter === 'all' ? 'No requests found' : `No ${selectedStatusLabel} requests`}
          emptyDescription={search.trim() ? 'Try changing your search text or request status filter.' : 'Choose another request status to review other submissions.'}
        />
        {!loading && totalPages > 1 ? (
          <div className="issuer-subscriptions-pagination">
            <InvestorHistoryPagination
              page={currentPage}
              totalPages={totalPages}
              onPageChange={setPage}
              disabled={loading}
              itemLabel="requests"
            />
          </div>
        ) : null}
      </Card>
    </div>
  );
}
