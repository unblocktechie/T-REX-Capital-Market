import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  FileSpreadsheet,
  Filter,
  RefreshCw,
  RotateCcw,
  Search,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { CompactAddress } from '@/components/common/CompactAddress';
import { InvestorHistoryPagination } from '@/components/investor-marketplace/InvestorHistoryPagination';
import { MarketplaceDropdown } from '@/components/investor-marketplace/MarketplaceDropdown';
import { DataTable } from '@/components/tables/DataTable';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { getTokenRecordName, getTokenRecordSymbol, useMyToken } from '@/hooks/useMyToken';
import { useOrganization } from '@/hooks/useOrganization';
import { issuerTokenTransactionHistoryService } from '@/services/issuer/issuerTokenTransactionHistory.service';
import { transactionExplorerUrl } from '@/utils/blockExplorer';
import { getErrorMessage } from '@/utils/error';

const PAGE_SIZE = 10;

const ACTIVITY_FILTERS = [
  { value: 'all', label: 'All activity', description: 'Show all recorded blockchain activity' },
  { value: 'INVEST', label: 'Investments', description: 'Investor purchases confirmed on-chain' },
  { value: 'TRANSFER', label: 'Token transfers', description: 'Tokens sent between approved wallets' },
  { value: 'REDEMPTION', label: 'Redemptions', description: 'Investor redemptions confirmed on-chain' },
];

const DATE_FILTERS = [
  { value: 'all', label: 'All time', description: 'Show the complete available token history' },
  { value: '7', label: 'Last 7 days', description: 'Only movements from the last 7 days' },
  { value: '30', label: 'Last 30 days', description: 'Only movements from the last 30 days' },
  { value: '90', label: 'Last 90 days', description: 'Only movements from the last 90 days' },
];

const activityMeta = {
  issued: { icon: Sparkles },
  sent: { icon: ArrowUpRight },
  received: { icon: ArrowDownLeft },
  transfer: { icon: ArrowLeftRight },
  redeemed: { icon: RotateCcw },
};

const normalizeSearch = (value) => String(value || '').trim().toLowerCase();

const formatActivityDate = (timestamp) => {
  if (!timestamp) return { date: 'Date unavailable', time: 'Confirmed on-chain' };
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return { date: 'Date unavailable', time: 'Confirmed on-chain' };
  return {
    date: new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: '2-digit',
      year: 'numeric',
    }).format(date),
    time: new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    }).format(date),
  };
};

const isZeroAddress = (value) =>
  String(value || '').toLowerCase() === '0x0000000000000000000000000000000000000000';

function ActivityLabel({ type, label }) {
  const meta = activityMeta[type] || activityMeta.transfer;
  const Icon = meta.icon;
  return (
    <span className={`issuer-transaction-activity issuer-transaction-activity--${type}`}>
      <span className="issuer-transaction-activity__icon"><Icon size={15} aria-hidden="true" /></span>
      <span>
        <strong>{label}</strong>
      </span>
    </span>
  );
}

function WalletCell({ value, issuerAddresses, label }) {
  if (isZeroAddress(value)) {
    return <span className="issuer-transaction-system-wallet">{label}</span>;
  }
  const isIssuerWallet = issuerAddresses.some(
    (address) => address.toLowerCase() === String(value || '').toLowerCase(),
  );
  return (
    <div className="issuer-transaction-wallet-cell">
      {isIssuerWallet ? <small>Issuer wallet</small> : null}
      <CompactAddress
        value={value}
        label={isIssuerWallet ? 'Issuer wallet' : 'Wallet address'}
        leading={6}
        trailing={5}
      />
    </div>
  );
}

export default function IssuerTransactionHistoryPage() {
  useDocumentTitle('Transaction history');
  const tokenRecord = useMyToken();
  const { organization } = useOrganization();
  const tokenName = getTokenRecordName(tokenRecord.token) || 'Investment asset';
  const tokenSymbol = getTokenRecordSymbol(tokenRecord.token);
  const [history, setHistory] = useState({
    rows: [],
    issuerAddresses: [],
    chainId: null,
    networkName: '',
    completeHistory: true,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [activityFilter, setActivityFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [page, setPage] = useState(1);

  const canLoad = Boolean(
    tokenRecord.isDeployed
    && issuerTokenTransactionHistoryService.getTokenContractAddress(tokenRecord.token),
  );

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!canLoad) {
      setHistory({ rows: [], issuerAddresses: [], chainId: null, networkName: '', completeHistory: true });
      setLoading(false);
      setRefreshing(false);
      return;
    }

    quiet ? setRefreshing(true) : setLoading(true);
    setLoadError('');
    try {
      const result = await issuerTokenTransactionHistoryService.list({
        token: tokenRecord.token,
        organization,
      });
      setHistory(result);
    } catch (error) {
      const message = getErrorMessage(error, 'Transaction history could not be loaded right now.');
      setLoadError(message);
      if (quiet) toast.error(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [canLoad, organization, tokenRecord.token]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [search, activityFilter, dateFilter]);

  const filteredRows = useMemo(() => {
    const query = normalizeSearch(search);
    const days = dateFilter === 'all' ? null : Number(dateFilter);
    const cutoff = days ? Date.now() - days * 24 * 60 * 60 * 1000 : null;

    return history.rows.filter((row) => {
      if (activityFilter !== 'all' && String(row?.type || row?.action || '').toUpperCase() !== activityFilter) return false;
      if (cutoff && (!row.timestamp || row.timestamp < cutoff)) return false;
      if (!query) return true;
      return [
        row.transactionHash,
        row.from,
        row.to,
        row.activityLabel,
        row.amountExact,
      ].some((value) => String(value || '').toLowerCase().includes(query));
    });
  }, [activityFilter, dateFilter, history.rows, search]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filteredRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const start = filteredRows.length ? (currentPage - 1) * PAGE_SIZE + 1 : 0;
  const end = filteredRows.length ? Math.min(currentPage * PAGE_SIZE, filteredRows.length) : 0;

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const columns = useMemo(() => [
    {
      key: 'timestamp',
      header: 'Date & Time',
      render: (value) => {
        const formatted = formatActivityDate(value);
        return (
          <div className="issuer-transaction-date">
            <strong>{formatted.date}</strong>
            <small>{formatted.time}</small>
          </div>
        );
      },
    },
    {
      key: 'activityLabel',
      header: 'Activity',
      render: (value, row) => <ActivityLabel type={row.activityType} label={value} />,
    },
    {
      key: 'amountDisplay',
      header: 'Amount',
      render: (value) => (
        <div className="issuer-transaction-amount">
          <strong>{value}</strong>
          {tokenSymbol ? <small>{tokenSymbol}</small> : null}
        </div>
      ),
    },
    {
      key: 'from',
      header: 'From wallet',
      render: (value) => (
        <WalletCell
          value={value}
          issuerAddresses={history.issuerAddresses}
          label="Newly issued"
        />
      ),
    },
    {
      key: 'to',
      header: 'To wallet',
      render: (value) => (
        <WalletCell
          value={value}
          issuerAddresses={history.issuerAddresses}
          label="Redeemed / removed"
        />
      ),
    },
    {
      key: 'transactionHash',
      header: 'Transaction',
      render: (value) => (
        <CompactAddress
          value={value}
          label="Transaction ID"
          leading={7}
          trailing={6}
          href={transactionExplorerUrl(value, history.chainId)}
          linkLabel="View transaction on block explorer"
        />
      ),
    },
    {
      key: 'status',
      header: 'Status',
      align: 'end',
      render: (value, row) => {
        const status = String(row?.status || value || '').toUpperCase();
        if (status === 'FAILED') return <Badge tone="danger"><XCircle size={13} aria-hidden="true" /> Failed</Badge>;
        if (status === 'SUBMITTED') return <Badge tone="warning"><Clock3 size={13} aria-hidden="true" /> Submitted</Badge>;
        return <Badge tone="success"><CheckCircle2 size={13} aria-hidden="true" /> Confirmed</Badge>;
      },
    },
  ], [history.chainId, history.issuerAddresses, tokenSymbol]);

  const hasFilters = Boolean(search.trim() || activityFilter !== 'all' || dateFilter !== 'all');

  const handleExport = async () => {
    if (exporting || !canLoad) return;
    const days = dateFilter === 'all' ? null : Number(dateFilter);
    const fromDate = days ? new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString() : '';
    const type = activityFilter === 'all' ? '' : activityFilter;
    setExporting(true);
    try {
      const result = await issuerTokenTransactionHistoryService.export({
        token: tokenRecord.token,
        search: search.trim(),
        type,
        fromDate,
      });
      const blob = result?.blob;
      if (!(blob instanceof Blob)) throw new Error('The export file could not be created.');
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      const disposition = String(result?.headers?.get?.('content-disposition') || result?.headers?.['content-disposition'] || '');
      const filenameMatch = disposition.match(/filename\*?=(?:UTF-8''|")?([^";]+)/i);
      const safeSymbol = String(tokenSymbol || 'token').replace(/[^a-z0-9_-]+/gi, '-').toLowerCase();
      anchor.href = url;
      anchor.download = filenameMatch?.[1] ? decodeURIComponent(filenameMatch[1].replace(/"/g, '')) : `${safeSymbol || 'token'}-transaction-history.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      toast.success('Transaction history exported.');
    } catch (error) {
      toast.error(getErrorMessage(error, 'Transaction history could not be exported right now.'));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="page-stack issuer-transaction-history-page">
      <header className="issuer-page-header issuer-transaction-history-header">
        <div>
          <span className="issuer-redemptions-eyebrow">Token activity</span>
          <h1>Transaction History</h1>
          <p>
            Track canonical blockchain activity for {tokenName}{tokenSymbol ? ` (${tokenSymbol})` : ''}. Search or filter the list, then export the current view when you need a record.
          </p>
        </div>
        <div className="issuer-transaction-history-header__actions">
          <Button
            variant="secondary"
            icon={FileSpreadsheet}
            disabled={loading || exporting || !canLoad}
            loading={exporting}
            onClick={handleExport}
          >
            Export CSV
          </Button>
          <Button
            variant="secondary"
            icon={RefreshCw}
            loading={refreshing}
            disabled={!canLoad || tokenRecord.isLoading}
            onClick={() => load({ quiet: true })}
          >
            Refresh
          </Button>
        </div>
      </header>

      {!tokenRecord.isLoading && !canLoad ? (
        <Card className="issuer-transaction-history-empty">
          <EmptyState
            title={tokenRecord.hasToken ? 'Finish creating your asset to view transactions' : 'Create an asset to start tracking transactions'}
            description="Transaction history becomes available after your token contract has been successfully created."
          />
        </Card>
      ) : (
        <>
          <Card className="issuer-transaction-toolbar-card">
            <div className="issuer-transaction-toolbar">
              <Input
                aria-label="Search transaction history"
                placeholder="Search wallet or transaction ID"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                leading={Search}
                className="issuer-transaction-search"
              />
              <MarketplaceDropdown
                value={activityFilter}
                options={ACTIVITY_FILTERS}
                onChange={setActivityFilter}
                icon={Filter}
                ariaLabel="Filter by token activity"
                className="issuer-transaction-filter"
                menuClassName="issuer-transaction-filter-menu"
                portal
              />
              <MarketplaceDropdown
                value={dateFilter}
                options={DATE_FILTERS}
                onChange={setDateFilter}
                ariaLabel="Filter transactions by date"
                className="issuer-transaction-filter issuer-transaction-date-filter"
                menuClassName="issuer-transaction-filter-menu"
                portal
              />
            </div>
            <div className="issuer-transaction-toolbar__summary">
              <span>
                Showing <strong>{start}{end > start ? `–${end}` : ''}</strong> of {filteredRows.length} transaction{filteredRows.length === 1 ? '' : 's'}
              </span>
              <span>
                {history.networkName ? <><strong>{history.networkName}</strong> · </> : null}Canonical transaction history
              </span>
            </div>
          </Card>

          {!history.completeHistory && !loading ? (
            <div className="issuer-transaction-history-note" role="status">
              Older activity may be missing because the asset's original creation block could not be confirmed. Refresh after the asset record is fully available to load the complete history.
            </div>
          ) : null}

          {loadError && !loading ? (
            <Card className="issuer-transaction-history-error" role="alert">
              <strong>Transaction history could not be loaded</strong>
              <p>{loadError}</p>
              <Button variant="secondary" icon={RefreshCw} onClick={() => load()}>Try again</Button>
            </Card>
          ) : (
            <Card className="issuer-table-card common-table-card issuer-transaction-table-card">
              <DataTable
                columns={columns}
                rows={pageRows}
                loading={loading || tokenRecord.isLoading}
                rowKey={(row) => row.id}
                loadingRows={6}
                emptyTitle={hasFilters ? 'No matching transactions' : 'No token transactions yet'}
                emptyDescription={hasFilters ? 'Try changing your search, activity, or date filter.' : 'Confirmed token movements will appear here automatically after they occur.'}
              />
              {!loading && totalPages > 1 ? (
                <div className="issuer-transaction-pagination">
                  <InvestorHistoryPagination
                    page={currentPage}
                    totalPages={totalPages}
                    onPageChange={setPage}
                    disabled={loading}
                    itemLabel="transactions"
                  />
                </div>
              ) : null}
            </Card>
          )}
        </>
      )}
    </div>
  );
}
