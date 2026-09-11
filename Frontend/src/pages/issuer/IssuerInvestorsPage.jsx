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

const PAGE_SIZE = 5;

const INTEREST_STATUS_OPTIONS = [
  { value: 'all', label: 'All Requests', description: 'All visible investment request statuses' },
  { value: 'pending', label: 'Pending', description: 'Requests waiting for the next action' },
  { value: 'submitIntrest', label: 'Pending Review', description: 'Investment requests waiting for issuer review' },
  { value: 'verifiedByIssuer', label: 'Verification Approved', description: 'Requests whose investor verification has been approved' },
  { value: 'claimSubmitted', label: 'Verification Submitted', description: 'Requests where the investor completed the required verification' },
  { value: 'approved', label: 'Approved', description: 'Requests that have been approved' },
  { value: 'rejected', label: 'Rejected', description: 'Requests that were not approved' },
  { value: 'cancelled', label: 'Cancelled', description: 'Requests that are no longer active' },
];

const requestStatusMeta = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  const compact = normalized.replace(/[\s_-]+/g, '');
  if (['verifiedbyissuer', 'verified'].includes(compact)) return { label: 'Verification Approved', tone: 'success' };
  if (compact === 'claimsubmitted') return { label: 'Verification Submitted', tone: 'success' };
  if (normalized === 'approved') return { label: 'Approved', tone: 'success' };
  if (normalized === 'rejected') return { label: 'Rejected', tone: 'danger' };
  if (normalized === 'cancelled') return { label: 'Cancelled', tone: 'neutral' };
  if (normalized === 'pending') return { label: 'Pending', tone: 'pending' };
  if (['submitintrest', 'submitted', 'pending_review', 'under_review'].includes(normalized)) {
    return { label: 'Pending Review', tone: 'pending' };
  }
  return {
    label: normalized ? normalized.replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase()) : 'Pending Review',
    tone: 'neutral',
  };
};

function RequestStatusBadge({ status }) {
  const meta = requestStatusMeta(status);
  return <AppStatusBadge status={status} label={meta.label} tone={meta.tone} compact />;
}

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
          <div><strong>{request.investorName}</strong><small>{request.investorCode || request.email || 'Investor identity'}</small></div>
        </div>
      ),
    },
    { key: 'status', header: 'Status', render: (value) => <RequestStatusBadge status={value} /> },
    {
      key: 'requestedDate',
      header: 'Date',
      render: (value) => <div className="issuer-date-cell"><strong>{formatDate(value, 'MMM DD, YYYY')}</strong><small>{formatDate(value, 'hh:mm A')}</small></div>,
    },
    {
      key: 'actions',
      header: 'Action',
      align: 'end',
      render: (_value, request) => <Button variant="secondary" size="sm" icon={Eye} onClick={() => navigate(`${ROUTES.investors}/${request.interestUid}`)}>View Details</Button>,
    },
  ], [navigate]);

  const handleExport = () => {
    const header = ['Investor', 'Wallet', 'Status', 'Submitted At', 'Token', 'Interest UID'];
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
          <span className="issuer-redemptions-eyebrow">Investor investment requests</span>
          <h1>Investment Requests</h1>
          <p>Review investor requests for your organization&apos;s created tokens. Open a request to review the investor profile, required verification and submitted documents.</p>
        </div>
        <Button variant="secondary" icon={Download} disabled={!requests.length} onClick={handleExport}>Export CSV</Button>
      </header>

      <Card className="issuer-subscriptions-toolbar-card">
        <div className="issuer-subscriptions-toolbar">
          <Input
            aria-label="Search investment requests"
            placeholder="Search investor, token or request ID"
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
          <span>Statuses reflect the latest request state.</span>
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
