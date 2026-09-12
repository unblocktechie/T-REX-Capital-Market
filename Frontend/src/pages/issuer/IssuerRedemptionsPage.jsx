import { useCallback, useEffect, useMemo, useState } from 'react';
import { Eye, Filter, RefreshCw, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { investmentApi } from '@/api/investments';
import { AppStatusBadge } from '@/components/common/AppStatusBadge';
import { MarketplaceDropdown } from '@/components/investor-marketplace/MarketplaceDropdown';
import { InvestorHistoryPagination } from '@/components/investor-marketplace/InvestorHistoryPagination';
import { DataTable } from '@/components/tables/DataTable';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { ROUTES } from '@/config/routes';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { formatDate } from '@/utils/date';
import { getErrorMessage } from '@/utils/error';
import {
  cleanRedemptionText,
  issuerRedemptionAmountLabel,
  issuerRedemptionInvestorLabel,
  issuerRedemptionStatus,
  issuerRedemptionStatusMeta,
  issuerRedemptionTokenLabel,
  issuerRedemptionUid,
} from '@/utils/issuerRedemption';

const PAGE_SIZE = 5;

const FILTERS = [
  { value: 'all', label: 'All redemptions', description: 'Show every redemption request' },
  { value: 'PENDING_ISSUER_APPROVAL', label: 'Needs your review', description: 'Requests waiting for your approve or reject decision' },
  { value: 'TOKENS_LOCKED', label: 'Ready for issuer', description: 'Issuer checks are ready and the organization can review and confirm the redemption' },
  { value: 'PAYMENT_SUBMITTED', label: 'Redemption submitted', description: 'The redemption is being confirmed' },
  { value: 'BURN_SUBMITTED', label: 'Finalizing redemption', description: 'Redemption is being completed' },
  { value: 'COMPLETED', label: 'Completed', description: 'Finished redemptions' },
  { value: 'MANUAL_REVIEW', label: 'Support review required', description: 'Requests that need additional support' },
];

const createdAt = (item) => cleanRedemptionText(item?.createdAt || item?.requestedAt || item?.submittedAt || item?.updatedAt);

export default function IssuerRedemptionsPage() {
  useDocumentTitle('Issuer Redemptions');
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const load = useCallback(async ({ quiet = false } = {}) => {
    quiet ? setRefreshing(true) : setLoading(true);
    try {
      const result = await investmentApi.listIssuerRedemptions();
      setRows(Array.isArray(result?.data) ? result.data : []);
    } catch (error) {
      setRows([]);
      toast.error(getErrorMessage(error, 'Unable to load redemption requests.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const visibleRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      const statusMatch = filter === 'all' || issuerRedemptionStatus(row) === filter;
      if (!statusMatch) return false;
      if (!query) return true;
      return [
        issuerRedemptionUid(row),
        issuerRedemptionInvestorLabel(row),
        issuerRedemptionTokenLabel(row),
        issuerRedemptionAmountLabel(row),
        row?.investorWalletAddress,
        row?.payment?.txHash,
      ].some((value) => cleanRedemptionText(value).toLowerCase().includes(query));
    });
  }, [filter, rows, search]);

  const totalPages = Math.max(1, Math.ceil(visibleRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return visibleRows.slice(start, start + PAGE_SIZE);
  }, [currentPage, visibleRows]);
  const pageStart = visibleRows.length ? ((currentPage - 1) * PAGE_SIZE) + 1 : 0;
  const pageEnd = visibleRows.length ? Math.min(currentPage * PAGE_SIZE, visibleRows.length) : 0;

  useEffect(() => {
    setPage(1);
  }, [filter, search]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const columns = useMemo(() => [
    {
      key: 'investor',
      header: 'Investor',
      render: (_value, row) => (
        <div className="issuer-redemption-primary-cell">
          <strong>{issuerRedemptionInvestorLabel(row)}</strong>
          <small>{issuerRedemptionUid(row) || 'Redemption request'}</small>
        </div>
      ),
    },
    {
      key: 'token',
      header: 'Asset',
      render: (_value, row) => (
        <div className="issuer-redemption-primary-cell">
          <strong>{issuerRedemptionTokenLabel(row)}</strong>
          <small>{issuerRedemptionAmountLabel(row)}</small>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (_value, row) => {
        const meta = issuerRedemptionStatusMeta(row?.status);
        return <AppStatusBadge status={row?.status} label={meta.label} tone={meta.tone} compact />;
      },
    },
    {
      key: 'createdAt',
      header: 'Requested',
      render: (_value, row) => {
        const value = createdAt(row);
        return value ? (
          <div className="issuer-date-cell"><strong>{formatDate(value, 'MMM DD, YYYY')}</strong><small>{formatDate(value, 'hh:mm A')}</small></div>
        ) : '—';
      },
    },
    {
      key: 'actions',
      header: 'Action',
      align: 'end',
      render: (_value, row) => (
        <Button
          variant="secondary"
          size="sm"
          icon={Eye}
          onClick={() => navigate(ROUTES.issuerRedemption(issuerRedemptionUid(row)))}
          disabled={!issuerRedemptionUid(row)}
        >
          Review
        </Button>
      ),
    },
  ], [navigate]);

  return (
    <div className="page-stack issuer-redemptions-page">
      <header className="issuer-page-header issuer-redemptions-header">
        <div>
          <span className="issuer-redemptions-eyebrow">Investor redemption requests</span>
          <h1>Redemptions</h1>
          <p>Review investor redemption requests, approve or reject each request, then review and confirm approved redemptions securely with Privy.</p>
        </div>
        <Button variant="secondary" size="sm" icon={RefreshCw} loading={refreshing} onClick={() => load({ quiet: true })}>Refresh</Button>
      </header>

      <Card className="issuer-redemptions-toolbar-card">
        <div className="issuer-redemptions-toolbar">
          <Input
            aria-label="Search redemptions"
            placeholder="Search investor, token or redemption ID"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            leading={Search}
          />
          <MarketplaceDropdown
            value={filter}
            options={FILTERS}
            onChange={setFilter}
            icon={Filter}
            ariaLabel="Filter issuer redemptions by status"
            align="end"
            className="issuer-redemptions-filter"
            menuClassName="issuer-redemptions-filter-menu"
            portal
          />
        </div>
        <div className="issuer-redemptions-toolbar__summary">
          <span>
            Showing <strong>{pageStart}{pageEnd > pageStart ? `–${pageEnd}` : ''}</strong> of {visibleRows.length} redemption{visibleRows.length === 1 ? '' : 's'}
            {visibleRows.length !== rows.length ? ` (${rows.length} total)` : ''}
          </span>
          <span>Statuses update as each redemption progresses.</span>
        </div>
      </Card>

      <Card className="issuer-table-card common-table-card issuer-redemptions-table-card">
        <DataTable
          columns={columns}
          rows={pageRows}
          loading={loading}
          rowKey={(row, index) => issuerRedemptionUid(row) || `redemption-${index}`}
          loadingRows={5}
          emptyTitle={filter === 'all' && !search.trim() ? 'No redemptions yet' : 'No matching redemptions'}
          emptyDescription={filter === 'all' && !search.trim() ? 'Investor redemption requests will appear here after investors submit them.' : 'Try changing the search text or status filter.'}
        />
        {!loading && totalPages > 1 ? (
          <div className="issuer-redemptions-pagination">
            <InvestorHistoryPagination
              page={currentPage}
              totalPages={totalPages}
              onPageChange={setPage}
              itemLabel="redemptions"
            />
          </div>
        ) : null}
      </Card>
    </div>
  );
}
