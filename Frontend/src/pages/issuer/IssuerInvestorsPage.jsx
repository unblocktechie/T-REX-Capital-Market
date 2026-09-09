import { useEffect, useMemo, useState } from 'react';
import { Download, Eye, Filter } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { AppStatusBadge } from '@/components/common/AppStatusBadge';
import { MarketplaceDropdown } from '@/components/investor-marketplace/MarketplaceDropdown';
import { DataTable } from '@/components/tables/DataTable';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ROUTES } from '@/config/routes';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { issuerInvestorSubscriptionsService } from '@/services/issuer/issuerInvestorSubscriptionsService';
import { formatDate } from '@/utils/date';
import { getErrorMessage } from '@/utils/error';

const INTEREST_STATUS_OPTIONS = [
  { value: 'all', label: 'All Requests', description: 'All visible investment request statuses' },
  { value: 'submitIntrest', label: 'Pending Review', description: 'Requests ready for issuer review' },
  { value: 'approved', label: 'Approved', description: 'Requests that have been approved' },
  { value: 'rejected', label: 'Rejected', description: 'Requests that were not approved' },
  { value: 'cancelled', label: 'Cancelled', description: 'Requests that are no longer active' },
];

const requestStatusMeta = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  const compact = normalized.replace(/[\s_-]+/g, '');
  if (compact === 'verifiedbyissuer') return { label: 'Verified', tone: 'success' };
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
  useDocumentTitle('Subscription Requests');
  const navigate = useNavigate();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');

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
  const requestLabel = statusFilter === 'all' ? 'request' : `${selectedStatusLabel} request`;

  return (
    <div className="page-stack issuer-investors-page issuer-investors-workspace">
      <header className="issuer-page-header">
        <div>
          <h1>Subscription Requests</h1>
          <p>Review investment interests submitted for your organization&apos;s deployed tokens. Open a request to inspect the investor identity summary, required claim topics, and submitted documents.</p>
        </div>
        <div className="issuer-page-header__actions">
          <MarketplaceDropdown
            value={statusFilter}
            options={INTEREST_STATUS_OPTIONS}
            onChange={setStatusFilter}
            icon={Filter}
            ariaLabel="Filter investment interests by status"
            className="issuer-status-dropdown"
          />
          <Button variant="secondary" icon={Download} disabled={!requests.length} onClick={handleExport}>Export CSV</Button>
        </div>
      </header>

      <Card className="issuer-table-card common-table-card">
        <DataTable
          columns={columns}
          rows={requests}
          loading={loading}
          rowKey="interestUid"
          loadingRows={4}
          emptyTitle={statusFilter === 'all' ? 'No requests found' : `No ${selectedStatusLabel} requests`}
          emptyDescription="Choose another request status to review other submissions."
        />
        <div className="issuer-table-footer">
          <span>Showing <strong>{requests.length}</strong> {requestLabel}{requests.length === 1 ? '' : 's'}</span>
          <span className="issuer-table-footer__status">Statuses reflect the latest request state.</span>
        </div>
      </Card>
    </div>
  );
}
