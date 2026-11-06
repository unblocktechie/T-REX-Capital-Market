import { PriceValue } from '@/components/common/PriceValue';
import { useEffect, useMemo, useState } from 'react';
import { useIsFetching, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowLeft, ArrowUp, ArrowUpDown, CalendarDays, ChevronLeft, ChevronRight, Clock3, ExternalLink, FileText, History, ListFilter, Search, Users, RefreshCcw, Eye, TrendingUp } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Link, useLocation } from 'react-router-dom';
import { ROUTES } from '@/config/routes';
import { adminApi } from '@/api/admin';
import { resolveAdminIssuerOrganizationUid } from '@/utils/adminIssuerNavigation';
import { investorInitials } from '@/utils/adminInvestorSort';
import { AdminAddressPill } from '@/components/admin/AdminAddressPill';
import { sortAdminTokenInvestorsPage } from '@/utils/adminTokenModalSort';
import { adminMonitoringApi, adminNetworkApi } from '@/api/admin';
import { getErrorMessage } from '@/utils/error';
import { useDebounce } from '@/hooks/useDebounce';
import { display, shorten, when, StateChip, capitalizeStatusOption } from '@/components/admin/AdminMonitoringParts';
import { adminTokenAddressExplorerUrl } from '@/utils/adminTokenDisplay';
import { CompactAddress } from '@/components/common/CompactAddress';
import { adminHolderStatus, formatAdminHolderBalance } from '@/utils/adminHolderDisplay';
import { MarketplaceDropdown } from '@/components/investor-marketplace/MarketplaceDropdown';
import { AdminTokenPriceHistory } from '@/components/admin/AdminTokenPriceHistory';
import { getChainRecordById, getChainRecordByUid } from '@/config/web3';
import { resolveChainExplorerUrl } from '@/utils/chainExplorerOverrides';
import { getAdminApplicationTransactionUrl, getApplicationExplorerBase, getApplicationTokenLabel, getApplicationTokenContractUrl } from '@/utils/adminApplicationExplorer';
import { AdminApplicationDocumentViewer } from '@/components/admin/AdminApplicationDocumentViewer';
import '@/assets/styles/admin-monitoring.css';

const dialogButton = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-40';
const INVESTOR_LIMIT = 5;
const HOLDER_OPTIONS = [
  { value: 'all', label: 'All investors' },
  { value: 'current', label: 'Current holders' },
  { value: 'former', label: 'Former holders' },
];
const investorName = (investor) => display(investor.fullName || investor.investorName || investor.name || [investor.firstName, investor.lastName].filter(Boolean).join(' ') || investor.email);

function QueryFeedback({ query, retry, emptyLabel }) {
  if (query.isPending) return <div aria-live="polite" aria-busy="true" className="space-y-3 py-3">{[1, 2, 3].map((i) => <div key={i} className="h-12 animate-pulse rounded-xl bg-slate-100" />)}</div>;
  if (query.isError) return <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700">{getErrorMessage(query.error, emptyLabel)} <button className="ml-2 font-semibold underline" type="button" onClick={retry}>Try again</button></div>;
  return null;
}

function HolderBalance({ investor, token }) {
  const status = adminHolderStatus(investor);
  const balance = status === 'UNKNOWN' ? 'Unavailable' : formatAdminHolderBalance(investor.currentTokenBalance);
  const symbol = String(token?.tokenSymbol || '').trim();
  // Keep balance as the API's precise decimal string. Do not expose raw balance,
  // block/hash metadata, or verification tooltips in this compact admin table.
  return <span className={`inline-flex max-w-full flex-wrap items-center gap-1.5 font-semibold tabular-nums ${status === 'UNKNOWN' ? 'text-amber-800' : 'text-slate-900'}`}>
    <span className="break-all">{balance}</span>
    {status !== 'UNKNOWN' && symbol && <span className="text-xs font-medium text-slate-500">{symbol}</span>}
  </span>;
}

function HolderStatus({ investor }) {
  const status = adminHolderStatus(investor);
  if (status === 'CURRENT') return <StateChip value="active" label="Current" />;
  if (status === 'FORMER') return <StateChip value="neutral" label="Former" />;
  return <span title="The balance could not be verified" className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">Unavailable</span>;
}

// Read the explorer for the token's chain, never from the admin's currently selected network.
const tokenContractExplorer = (token, chains = []) => {
  const chain = chains.find((item) => token.chainUid && item.chainUid === token.chainUid)
    || chains.find((item) => token.chainId && Number(item.chainId) === Number(token.chainId))
    || getChainRecordByUid(token.chainUid) || getChainRecordById(token.chainId);
  const chainId = chain?.chainId || token.chainId;
  const local = getChainRecordByUid(token.chainUid) || getChainRecordById(chainId);
  return adminTokenAddressExplorerUrl(token.tokenAddress,
    resolveChainExplorerUrl(chainId, chain?.explorerUrl || local?.explorerUrl || ''));
};

// Asset summary is shared by the Investors and Price history tabs. Explorer
// destinations come from this token's own chain, never the selected wallet.
function TokenOverview({ token, chains, paymentSymbol, investorCount, issuerOrganizationUid, issuerBackTo }) {
  const contractLink = tokenContractExplorer(token, chains);
  const deployedAt = token.deployedAt;
  const deployedDate = deployedAt && !Number.isNaN(Date.parse(deployedAt))
    ? new Date(deployedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : '—';
  const chainName = display(token.chainName || token.chainId);
  const issuerName = display(token.legalCompanyName);
  const title = <>{display(token.tokenName)} <span className="font-normal">({display(token.tokenSymbol)})</span></>;

  return <section className="min-w-0 overflow-hidden rounded-2xl border border-blue-100 bg-white" aria-label="Investment asset overview">
    <div className="flex min-w-0 flex-wrap items-start justify-between gap-4 bg-blue-50/60 px-4 py-4 sm:px-5">
      <div className="min-w-0 flex-1">
        <p className="m-0 text-xs font-semibold uppercase tracking-wide text-blue-700">Investment asset</p>
        <h3 className="mb-1 mt-1 break-words text-xl font-semibold text-slate-900">
          {contractLink ? <a href={contractLink} target="_blank" rel="noopener noreferrer"
            title="View token contract in blockchain explorer"
            className="inline-flex max-w-full flex-wrap items-center gap-1 rounded-md text-slate-900 transition-colors hover:text-blue-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600">
            {title}<ExternalLink className="size-3.5 shrink-0" aria-hidden="true"/>
          </a> : title}
        </h3>
        {issuerOrganizationUid ? <Link to={ROUTES.adminOrganizationReview(encodeURIComponent(issuerOrganizationUid))}
          state={{ from: issuerBackTo }} className="inline-block max-w-full break-words text-sm font-medium text-slate-900 transition-colors hover:text-blue-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600">
          {issuerName}
        </Link> : <p className="m-0 break-words text-sm font-medium text-slate-700">{issuerName}</p>}
      </div>
      <div className="flex min-w-0 w-full flex-col items-end justify-between gap-4 self-stretch sm:w-auto sm:shrink-0">
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
          <span className="inline-flex max-w-full rounded-full border border-blue-200 bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-800">{chainName}</span>
          <StateChip value={token.status} label={capitalizeStatusOption(token.status)} />
        </div>
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-x-2 gap-y-1.5 text-xs">
          <span className="font-semibold text-slate-600">Token</span>
          {token.tokenAddress ? <CompactAddress value={token.tokenAddress} label="Token address" leading={10} trailing={7} /> : <span className="text-slate-500">—</span>}
        </div>
      </div>
    </div>
    <div className="grid min-w-0 grid-cols-1 border-t border-blue-100 sm:grid-cols-2 lg:grid-cols-4">
      {[
        ['Current price', token.currentTokenPrice, token.currentTokenPriceAt, 'Updated'],
        ['Initial price', token.initialTokenPrice, token.initialTokenPriceAt, 'Set'],
      ].map(([label, price, at, verb]) => <div key={label} className="min-w-0 border-b border-slate-100 px-4 py-4 sm:px-5 lg:border-b-0 lg:border-r lg:border-slate-200">
        <p className="m-0 text-xs font-medium text-slate-600">{label}</p>
        <div className="mt-1 flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1 text-xl font-semibold tabular-nums text-slate-900">
          <PriceValue value={price} label={label} />
          {paymentSymbol && <span className="text-xs font-medium text-slate-500">{paymentSymbol}</span>}
        </div>
        {at && !Number.isNaN(Date.parse(at)) && <p className="mb-0 mt-2 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
          <Clock3 className="size-3.5 shrink-0" aria-hidden="true" />
          <time dateTime={at} title={when(at)}>{verb} {when(at)}</time>
        </p>}
      </div>)}
      <div className="min-w-0 border-b border-slate-100 px-4 py-4 sm:border-b-0 sm:border-r sm:border-slate-200 sm:px-5">
        <p className="m-0 text-xs font-medium text-slate-600">Invested investors</p>
        <p className="mb-0 mt-1 text-xl font-semibold tabular-nums text-slate-900">{investorCount === null || investorCount === undefined || !Number.isSafeInteger(Number(investorCount)) || Number(investorCount) < 0 ? '—' : Number(investorCount).toLocaleString()}</p>
        <p className="mb-0 mt-2 text-xs text-slate-500">All invested investors</p>
      </div>
      <div className="min-w-0 px-4 py-4 sm:px-5">
        <p className="m-0 text-xs font-medium text-slate-600">Deployed on</p>
        <p className="mb-0 mt-1 flex flex-wrap items-center gap-1.5 text-lg font-semibold text-slate-900">
          <CalendarDays className="size-4 shrink-0 text-slate-500" aria-hidden="true" />
          {deployedAt && !Number.isNaN(Date.parse(deployedAt))
            ? <time dateTime={deployedAt} title={when(deployedAt)}>{deployedDate}</time>
            : deployedDate}
        </p>
      </div>
    </div>
  </section>;
}

// Same icon style and keyboard access as the sortable admin investor tables.
const modalSortHeading = (label, field, sortBy, sortOrder, onSort) => <button type="button"
  onClick={() => onSort(field)} aria-label={`Sort by ${label} ${sortBy === field && sortOrder === 'asc' ? 'descending' : 'ascending'}`}
  aria-pressed={sortBy === field}
  className="inline-flex min-h-8 items-center gap-1.5 rounded-md text-left font-semibold text-slate-500 transition-colors hover:text-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600">
  {label.toUpperCase()}{sortBy === field ? sortOrder === 'asc' ? <ArrowUp className="size-3.5 text-blue-600" aria-hidden="true"/> : <ArrowDown className="size-3.5 text-blue-600" aria-hidden="true"/> : <ArrowUpDown className="size-3.5 text-slate-400" aria-hidden="true"/>}
</button>;

function TokenInvestorsPagination({ pagination, onChange, pending }) {
  if (!pagination) return null;
  const { page, limit, total, totalPages } = pagination;
  const count = Math.max(1, totalPages || 1);
  const current = Math.min(Math.max(1, page), count);
  const firstPage = Math.max(1, Math.min(current - 1, Math.max(1, count - 2)));
  const shownPages = Array.from({ length: Math.min(3, count) }, (_, i) => firstPage + i);
  const start = total ? (current - 1) * limit + 1 : 0;
  const end = Math.min(current * limit, total);
  const navButton = 'inline-flex h-9 min-h-9 items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-2 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600';
  return <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-3 sm:flex-row sm:items-center sm:justify-between">
    <p className="m-0 text-center text-xs text-slate-500 sm:text-left" aria-live="polite">Showing {start}–{end} of {total} · Page {current} of {count}</p>
    {count > 1 && <nav aria-label="Investor pages" className="flex flex-wrap items-center justify-center gap-1 sm:justify-end">
      <button type="button" className={navButton} disabled={pending || current <= 1} onClick={() => onChange(current - 1)} aria-label="Previous page"><ChevronLeft className="size-4" aria-hidden="true"/><span className="hidden min-[420px]:inline">Previous</span></button>
      {shownPages.map((number) => <button type="button" key={number} aria-label={`Page ${number}`} aria-current={current === number ? 'page' : undefined} disabled={pending} onClick={() => onChange(number)} className={`token-investor-pagination__page ${current === number ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}>{number}</button>)}
      <button type="button" className={navButton} disabled={pending || current >= count} onClick={() => onChange(current + 1)} aria-label="Next page"><span className="hidden min-[420px]:inline">Next</span><ChevronRight className="size-4" aria-hidden="true"/></button>
    </nav>}
  </div>;
}

export function AdminTokenDetailsDialog({ tokenUid, chains = [], onClose }) {
  const queryClient = useQueryClient();
  const historyFetching = useIsFetching({ queryKey: ['admin', 'token-price-history', tokenUid] });
  const [tab, setTab] = useState('investors');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [holderStatus, setHolderStatus] = useState('all');
  const [investorSort, setInvestorSort] = useState({ field: '', order: 'asc' });
  const location = useLocation();
  const debouncedSearch = useDebounce(search, 350);
  const query = useQuery({
    queryKey: ['admin', 'token-details', tokenUid, page, debouncedSearch, holderStatus],
    queryFn: () => adminMonitoringApi.getTokenDetails(tokenUid, { page, limit: INVESTOR_LIMIT, search: debouncedSearch, holderStatus }),
    enabled: Boolean(tokenUid),
    staleTime: 20_000,
    // Keep the token header and both tabs mounted during search/filter/page changes.
    // Never reuse a different token's response as placeholder data.
    placeholderData: (previousData, previousQuery) => previousQuery?.queryKey?.[2] === tokenUid ? previousData : undefined,
  });
  const token = query.data?.token;
  const paymentTokensQuery = useQuery({
    queryKey: ['admin', 'payment-tokens-for-token', token?.chainUid, token?.chainId],
    queryFn: () => adminNetworkApi.listPaymentTokens(token.chainUid, token.chainId),
    enabled: Boolean(token && (token.chainUid || token.chainId)),
    staleTime: 60_000,
  });
  const paymentSymbol = (() => {
    const direct = token?.paymentTokenSymbol || token?.paymentToken?.symbol;
    if (direct) return String(direct).toUpperCase();
    const address = String(token?.paymentTokenAddress || '').toLowerCase();
    if (!address) return '';
    const payment = paymentTokensQuery.data?.find((item) => item.contractAddress?.toLowerCase() === address);
    return String(payment?.symbol || '').toUpperCase();
  })();
  const investors = query.data?.investors || [];
  const sortedInvestors = useMemo(() => sortAdminTokenInvestorsPage(investors, investorSort.field, investorSort.order), [query.data?.investors, investorSort]);
  const onInvestorSort = (field) => setInvestorSort((current) => ({ field, order: current.field === field && current.order === 'asc' ? 'desc' : 'asc' }));
  const pagination = query.data?.pagination;
  const investedCount = query.data?.holderSummary?.totalInvestors ?? query.data?.holderSummary?.investorCount ?? token?.holderSummary?.totalInvestors ?? token?.totalInvestors ?? token?.investedInvestorCount ?? token?.investorCount ?? (holderStatus === 'all' && !debouncedSearch ? query.data?.confirmedInvestorTotal : null);
  const organizationUid = resolveAdminIssuerOrganizationUid(token);
  const issuerDirectoryQuery = useQuery({
    queryKey: ['admin', 'organizations', 'issuer-link-directory'],
    queryFn: () => adminApi.listOrganizations({ page: 1, pageSize: 100 }),
    enabled: Boolean(token?.legalCompanyName && !organizationUid),
    staleTime: 60_000,
  });
  const resolvedOrganizationUid = resolveAdminIssuerOrganizationUid(token, issuerDirectoryQuery.data?.items || []);
  useEffect(() => {
    if (!query.isFetching && pagination && page > pagination.totalPages) setPage(Math.max(1, pagination.totalPages));
  }, [page, pagination?.totalPages, query.isFetching]);
  if (!tokenUid) return null;

  return <Modal open onClose={onClose} title="Token details & investors" trapFocus className="h-[92dvh] sm:max-w-[1200px]" dialogStyle={{ maxWidth: '1200px' }} bodyClassName="min-w-0 space-y-4 px-4 py-5 sm:px-6 lg:px-8" footer={<button type="button" className={dialogButton} onClick={onClose}>Close</button>}>
    <QueryFeedback query={query} retry={() => query.refetch()} emptyLabel="Unable to load token details." />
    {query.isSuccess && !token && <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">Token information is not available.</div>}
    {token && <>
      <TokenOverview token={token} chains={chains} paymentSymbol={paymentSymbol} investorCount={investedCount} issuerOrganizationUid={resolvedOrganizationUid} issuerBackTo={location.pathname}/>
      <div className="flex min-w-0 flex-wrap items-center gap-2 border-b border-slate-200 pb-3" role="tablist" aria-label="Token details sections">
        <button type="button" role="tab" aria-selected={tab === 'investors'} className={`${dialogButton} ${tab === 'investors' ? '!border-slate-900 !bg-slate-900 !text-white' : ''}`} onClick={() => setTab('investors')}><Users className="size-4"/>Invested investors</button>
        <button type="button" role="tab" aria-selected={tab === 'history'} className={`${dialogButton} ${tab === 'history' ? '!border-slate-900 !bg-slate-900 !text-white' : ''}`} onClick={() => setTab('history')}><TrendingUp className="size-4"/>Price history</button>
        <button type="button" aria-label={tab === 'history' ? 'Refresh price history' : 'Refresh token details'}
          disabled={tab === 'history' ? Boolean(historyFetching) : query.isFetching}
          onClick={() => tab === 'history'
            ? queryClient.invalidateQueries({ queryKey: ['admin', 'token-price-history', tokenUid] })
            : query.refetch()}
          className={`${dialogButton} ml-auto`}><RefreshCcw className={`size-4 ${(tab === 'history' ? historyFetching : query.isFetching) ? 'animate-spin' : ''}`}/>Refresh</button>
      </div>
      {tab === 'investors' ? <div className="space-y-4" role="tabpanel">
        <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(170px,220px)]">
          <label className="relative block min-w-0"><span className="sr-only">Search invested investors</span><Search className="absolute left-3 top-3 size-4 text-slate-400"/><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} maxLength={100} className="min-h-11 w-full rounded-xl border border-slate-200 bg-white py-2 pl-10 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" placeholder="Search investor name, email or wallet"/></label>
          <MarketplaceDropdown value={holderStatus} onChange={(value) => { setHolderStatus(value); setPage(1); }} options={HOLDER_OPTIONS} icon={ListFilter} ariaLabel="Filter by holder status" className={`admin-monitor-filter ${holderStatus !== 'all' ? 'admin-monitor-filter--selected' : ''}`} menuClassName="admin-monitor-filter__menu" placeholder="All investors" portal/>
        </div>
        <div className="flex min-w-0 items-center gap-2 lg:hidden">
          <label htmlFor="admin-token-investor-sort" className="shrink-0 text-xs font-semibold text-slate-600">Sort by</label>
          <select id="admin-token-investor-sort" value={investorSort.field} onChange={(event) => setInvestorSort({ field: event.target.value, order: 'asc' })}
            className="min-h-10 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-2 text-sm text-slate-900">
            <option value="">Default order</option><option value="investor">Investor</option><option value="accreditation">Accreditation</option><option value="balance">Current balance</option><option value="holdingStatus">Holding status</option>
          </select>
          <button type="button" className="min-h-10 rounded-xl border border-slate-200 px-3" aria-label="Reverse investor sort" onClick={() => setInvestorSort((current) => ({ ...current, order: current.order === 'asc' ? 'desc' : 'asc' }))}><ArrowUpDown className="size-4" aria-hidden="true"/></button>
        </div>
        <div className="relative min-w-0" aria-busy={query.isFetching}>
          {query.isFetching && !query.isPending && <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-center gap-2 rounded-t-xl bg-blue-50/95 px-3 py-2 text-xs font-medium text-blue-800" role="status"><RefreshCcw className="size-3.5 animate-spin" aria-hidden="true"/>Updating investors…</div>}
          {investors.length ? <>
            <div className="grid min-w-0 gap-3 lg:hidden" aria-label="Invested investors">
              {sortedInvestors.map((investor, index) => <article key={investor.userUid || investor.investorUid || index} className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex min-w-0 items-center gap-3 border-b border-slate-100 pb-3"><span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">{investorInitials(investorName(investor))}</span><div className="min-w-0"><p className="m-0 break-words text-sm font-semibold text-slate-900">{investorName(investor)}</p><p className="mt-1 mb-0 break-all text-xs text-slate-500">{display(investor.email)}</p></div></div>
                <dl className="mt-3 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="min-w-0"><dt className="text-xs font-medium text-slate-500">Wallet</dt><dd className="m-0 mt-1">{investor.walletAddress ? <AdminAddressPill value={investor.walletAddress} label="Investor wallet" leading={10} trailing={7} /> : '—'}</dd></div>
                  <div className="min-w-0"><dt className="text-xs font-medium text-slate-500">Accreditation</dt><dd className="mb-0 mt-1 break-words text-sm text-slate-700">{capitalizeStatusOption(investor.accreditationType)}</dd></div>
                  <div className="min-w-0"><dt className="text-xs font-medium text-slate-500">Current balance</dt><dd className="m-0 mt-1 text-sm"><HolderBalance investor={investor} token={token}/></dd></div>
                  <div className="min-w-0"><dt className="text-xs font-medium text-slate-500">Holding status</dt><dd className="m-0 mt-1"><HolderStatus investor={investor}/></dd></div>
                </dl>
              </article>)}
            </div>
            <div className="hidden min-w-0 overflow-x-auto rounded-xl border border-slate-200 lg:block">
              <table className="admin-data-table w-full min-w-[860px] table-fixed border-collapse text-left text-sm">
                <thead className="bg-slate-50 text-xs font-semibold tracking-wide text-slate-500"><tr>
                  <th scope="col" className="w-[24%] px-3 py-2">{modalSortHeading('Investor', 'investor', investorSort.field, investorSort.order, onInvestorSort)}</th>
                  <th scope="col" className="w-[21%] px-3 py-3">Wallet</th>
                  <th scope="col" className="w-[19%] px-3 py-2">{modalSortHeading('Accreditation', 'accreditation', investorSort.field, investorSort.order, onInvestorSort)}</th>
                  <th scope="col" className="w-[23%] px-3 py-2">{modalSortHeading('Current balance', 'balance', investorSort.field, investorSort.order, onInvestorSort)}</th>
                  <th scope="col" className="w-[13%] px-3 py-2">{modalSortHeading('Holding status', 'holdingStatus', investorSort.field, investorSort.order, onInvestorSort)}</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100">{sortedInvestors.map((investor, index) => <tr key={investor.userUid || investor.investorUid || index} className="hover:bg-slate-50">
                  <td className="min-w-0 px-3 py-3 align-middle"><div className="flex min-w-0 items-center gap-2.5"><span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">{investorInitials(investorName(investor))}</span><span className="min-w-0"><strong className="block break-words text-slate-900">{investorName(investor)}</strong><span className="block break-all text-xs text-slate-500">{display(investor.email)}</span></span></div></td>
                  <td className="px-3 py-3 align-middle">{investor.walletAddress ? <AdminAddressPill value={investor.walletAddress} label="Investor wallet" leading={10} trailing={7} /> : '—'}</td>
                  <td className="break-words px-3 py-3 align-middle">{capitalizeStatusOption(investor.accreditationType)}</td>
                  <td className="min-w-0 px-3 py-3 align-middle text-xs"><HolderBalance investor={investor} token={token}/></td>
                  <td className="px-3 py-3 align-middle"><HolderStatus investor={investor}/></td>
                </tr>)}</tbody>
              </table>
            </div>
          </> : <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">{search ? 'No investors match your search and holder filter.' : holderStatus !== 'all' ? `No ${holderStatus} holders found among these investors.` : 'No confirmed investors found for this token.'}</div>}
          <TokenInvestorsPagination pagination={pagination} onChange={setPage} pending={query.isFetching}/>
        </div>
      </div> : <div role="tabpanel"><AdminTokenPriceHistory token={token} tokenUid={tokenUid} paymentSymbol={paymentSymbol} /></div>}
    </>}
  </Modal>;
}

// Only registered activity has a confirmed on-chain registration transaction.
// Preserve the original note, but turn valid transaction hashes into safe external links.
function ApplicationEventNote({ note, eventType, explorerBase }) {
  if (!note) return null;
  if (String(eventType).toLowerCase() !== 'registered') {
    return <p className="mt-3 mb-0 break-words text-sm leading-6 text-slate-700">{note}</p>;
  }
  const chunks = String(note).split(/(0x[a-fA-F0-9]{64})/g);
  return <p className="mt-3 mb-0 break-words text-sm leading-6 text-slate-700">{chunks.map((chunk, index) => {
    const url = getAdminApplicationTransactionUrl(chunk, explorerBase);
    return url ? <a key={index} href={url} target="_blank" rel="noopener noreferrer" title="View registration transaction in the blockchain explorer" className="inline-flex max-w-full items-center gap-1 align-middle font-medium text-slate-900 transition-colors hover:text-blue-700 hover:underline focus-visible:rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"><span className="font-mono text-xs" title={chunk}>{shorten(chunk)}</span><ExternalLink className="ml-1 inline-block size-3" aria-hidden="true"/></a> : <span key={index}>{chunk}</span>;
  })}</p>;
}

// The application header must use this application's chain, not the admin's connected wallet.
// When the API omits a display name, prefer the chain directory for its recorded ID/UID.
const applicationChainName = (history, application, token, chains = []) => {
  const records = [history, history?.summary, history?.token, application, application?.token, token].filter(Boolean);
  const id = records.map((r) => r.chainId || r.chain?.chainId || r.network?.chainId).find(Boolean);
  const uid = records.map((r) => r.chainUid || r.chain?.chainUid || r.network?.chainUid).find(Boolean);
  const match = chains.find((chain) => id && Number(chain.chainId) === Number(id))
    || chains.find((chain) => uid && chain.chainUid === uid)
    || getChainRecordById(id) || getChainRecordByUid(uid);
  const recordedName = records.map((r) => r.chainName || r.chain?.chainName || r.network?.chainName || (typeof r.network === 'string' ? r.network : '')).find(Boolean);
  return String(match?.chainName || recordedName || match?.chainCode || '').trim();
};

const applicationIssuerName = (history, application, token) => String(
  history.organizationName || history?.legalCompanyName || history?.issuerName
  || history?.token?.legalCompanyName || application?.organizationName || application?.legalCompanyName
  || application?.issuerName || application?.token?.legalCompanyName || token?.legalCompanyName || '',
).trim();

const applicationContractAddress = (history, application, token) =>
  history?.tokenAddress || history?.token?.tokenAddress || application?.tokenAddress
  || application?.token?.tokenAddress || token?.tokenAddress || '';

const sortEvents = (events) => [...events].sort((a, b) => new Date(b.createdAt || b.date || b.occurredAt || 0).getTime() - new Date(a.createdAt || a.date || a.occurredAt || 0).getTime());

export function AdminApplicationHistoryDialog({ interestUid, application, onClose }) {
  const [activeDocument, setActiveDocument] = useState(null);
  const location = useLocation();
  const chainsQuery = useQuery({ queryKey: ['admin', 'chains'], queryFn: adminNetworkApi.listChains, enabled: Boolean(interestUid), staleTime: 60_000 });
  const query = useQuery({ queryKey: ['admin', 'application-history', interestUid], queryFn: () => adminMonitoringApi.getApplicationHistory(interestUid), enabled: Boolean(interestUid), staleTime: 20_000 });
  if (!interestUid) return null;
  const history = query.data || {};
  // Application rows/history may omit the contract address. Only in that case,
  // reuse the read-only token details endpoint to resolve the actual contract/network.
  const tokenUid = history.tokenUid || history.token?.tokenUid || application?.tokenUid || application?.token?.tokenUid;
  const knownAddress = history.tokenAddress || history.token?.tokenAddress || application?.tokenAddress || application?.token?.tokenAddress;
  const tokenQuery = useQuery({
    queryKey: ['admin', 'application-token-contract', tokenUid],
    queryFn: () => adminMonitoringApi.getTokenDetails(tokenUid, { page: 1, limit: 1 }),
    enabled: Boolean(interestUid && tokenUid && !knownAddress),
    staleTime: 60_000,
  });
  const resolvedToken = tokenQuery.data?.token || {};
  const explorerBase = getApplicationExplorerBase(history, { ...resolvedToken, ...application }, chainsQuery.data || []);
  const tokenLabel = getApplicationTokenLabel(history, application, resolvedToken);
  const tokenContractUrl = getApplicationTokenContractUrl(history, application, resolvedToken, explorerBase);
  const tokenAddress = applicationContractAddress(history, application, resolvedToken);
  const networkName = applicationChainName(history, application, resolvedToken, chainsQuery.data || []);
  const issuerName = applicationIssuerName(history, application, resolvedToken);
  // Resolve the issuer via its organization UID or an unambiguous directory match.
  // An issuer user UID must never be used as an organization route parameter.
  const directOrganizationUid = resolveAdminIssuerOrganizationUid(resolvedToken)
    || resolveAdminIssuerOrganizationUid(history) || resolveAdminIssuerOrganizationUid(application);
  const issuerDirectoryQuery = useQuery({
    queryKey: ['admin', 'organizations', 'issuer-link-directory'],
    queryFn: () => adminApi.listOrganizations({ page: 1, pageSize: 100 }),
    enabled: Boolean(interestUid && issuerName && !directOrganizationUid),
    staleTime: 60_000,
  });
  const issuerOrganizationUid = directOrganizationUid || resolveAdminIssuerOrganizationUid(
    { organizationName: issuerName }, issuerDirectoryQuery.data?.items || [],
  );
  const timeline = sortEvents(Array.isArray(history.timeline) ? history.timeline : []);
  return <Modal open title={activeDocument ? 'Secure document preview' : 'Application timeline'} onClose={onClose} trapFocus className="sm:max-w-5xl" dialogStyle={{ maxWidth: '960px' }} bodyClassName="space-y-5 px-4 py-5 sm:px-6 lg:px-8" footer={<>{activeDocument && <button type="button" className={dialogButton} onClick={() => setActiveDocument(null)}><ArrowLeft className="size-4"/>Back to timeline</button>}<button type="button" className={dialogButton} onClick={onClose}>Close</button></>}>
    {activeDocument ? <AdminApplicationDocumentViewer interestUid={interestUid} document={activeDocument} /> : <>
    <QueryFeedback query={query} retry={() => query.refetch()} emptyLabel="Unable to load application history." />
    {query.isSuccess && <>
      <section className="min-w-0 overflow-hidden rounded-2xl border border-blue-100 bg-blue-50/60" aria-label="Application investment asset">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-4 px-4 py-4 sm:px-5">
          <div className="min-w-0 flex-1">
            <p className="m-0 text-xs font-semibold uppercase tracking-wide text-blue-700">Investment asset</p>
            <h3 className="mb-1 mt-1 break-words text-lg font-semibold text-slate-900">
              {tokenContractUrl ? <a href={tokenContractUrl} target="_blank" rel="noopener noreferrer"
                title="View token contract in blockchain explorer"
                className="inline-flex max-w-full flex-wrap items-center gap-1.5 rounded-md text-slate-900 transition-colors hover:text-blue-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600">
                {tokenLabel}<ExternalLink className="size-4 shrink-0" aria-hidden="true" />
              </a> : tokenLabel}
            </h3>
            {issuerName && (issuerOrganizationUid ? <Link
              to={ROUTES.adminOrganizationReview(encodeURIComponent(issuerOrganizationUid))}
              state={{ from: location.pathname }}
              className="inline-block max-w-full break-words text-sm font-medium text-slate-900 transition-colors hover:text-blue-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600">
              {issuerName}
            </Link> : <p className="m-0 break-words text-sm font-medium text-slate-700">{issuerName}</p>)}
            <p className="mb-0 mt-1 break-all text-xs text-slate-600">Application ID: {display(history.interestUid || interestUid)}</p>
          </div>
          <div className="flex min-w-0 w-full flex-col items-end justify-between gap-4 self-stretch sm:w-auto sm:shrink-0">
            <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
              {networkName && <span className="inline-flex max-w-full rounded-full border border-blue-200 bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-800">{networkName}</span>}
              <StateChip value={history.status || history.summary?.status} label={capitalizeStatusOption(history.status || history.summary?.status)} />
            </div>
            <div className="flex min-w-0 flex-wrap items-center justify-end gap-x-2 gap-y-1.5 text-xs">
              <span className="font-semibold text-slate-600">Token</span>
              {tokenAddress ? <CompactAddress value={tokenAddress} label="Token address" leading={10} trailing={7} /> : <span className="text-slate-500">—</span>}
            </div>
          </div>
        </div>
      </section>
      {history.summary && (history.summary.submissionNumber != null || history.summary.rejectReasonType) && <dl className="grid gap-2 sm:grid-cols-3">
        {history.summary.submissionNumber != null && <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><dt className="text-xs text-slate-500">Latest version</dt><dd className="m-0 mt-1 text-sm font-semibold">{history.summary.submissionNumber}</dd></div>}
        {history.summary.rejectReasonType && <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><dt className="text-xs text-slate-500">Review feedback</dt><dd className="m-0 mt-1 text-sm font-semibold">{capitalizeStatusOption(history.summary.rejectReasonType)}</dd></div>}
      </dl>}
      <div className="flex items-center justify-between gap-3"><p className="m-0 flex items-center gap-2 text-sm font-semibold text-slate-900"><History className="size-4 text-blue-600" />{timeline.length} recorded event{timeline.length === 1 ? '' : 's'}</p><button type="button" className={dialogButton} onClick={() => query.refetch()} disabled={query.isFetching}><RefreshCcw className={`size-4 ${query.isFetching ? 'animate-spin' : ''}`}/>Refresh</button></div>
      {timeline.length ? <ol className="relative m-0 space-y-4 border-l-2 border-slate-200 pl-5">{timeline.map((event, index) => {
        const eventType = event.eventType || event.type || 'Activity recorded';
        const documents = Array.isArray(event.documents) ? event.documents : [];
        return <li key={event.id || event.eventUid || `${eventType}-${index}`} className="relative min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 before:absolute before:-left-[27px] before:top-5 before:size-2.5 before:rounded-full before:bg-blue-600 before:ring-4 before:ring-white">
          <div className="flex flex-wrap items-start justify-between gap-2"><h4 className="m-0 text-sm font-semibold text-slate-900">{capitalizeStatusOption(eventType)}</h4><span className="flex items-center gap-1 text-xs text-slate-500"><Clock3 className="size-3.5"/>{when(event.createdAt || event.date || event.occurredAt)}</span></div>
          <p className="mt-1 mb-0 text-xs text-slate-500">Recorded by: {display(event.actorName || event.actorRole || event.actorUserUid || 'System')}</p>
          {event.note && <ApplicationEventNote note={event.note} eventType={eventType} explorerBase={explorerBase} />}
          {event.rejectReason && <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"><strong>Reason:</strong> {event.rejectReason}</div>}
          {event.rejectReasonType && <p className="mt-2 mb-0 text-xs text-slate-600">Rejection type: {capitalizeStatusOption(event.rejectReasonType)}</p>}
          {(event.submissionNumber != null || event.resubmitAttempt != null) && <p className="mt-2 mb-0 text-xs text-slate-600">{event.submissionNumber != null ? `Submission version: ${event.submissionNumber}` : `Update attempt: ${event.resubmitAttempt}`}</p>}
          {Array.isArray(event.rejectedClaim) && event.rejectedClaim.length > 0 && <p className="mt-2 mb-0 text-xs text-slate-600">Documents requiring attention: {event.rejectedClaim.join(', ')}</p>}
          {documents.length > 0 && <div className="mt-3 min-w-0 rounded-lg bg-slate-50 p-3 sm:p-4"><p className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-700"><FileText className="size-4"/>Submitted documents ({documents.length})</p><ul className="m-0 list-none space-y-2 p-0">{documents.map((doc, docIndex) => <li key={doc.documentUid || doc.submissionDocumentUid || docIndex} className="flex min-w-0 flex-col gap-3 rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-600 md:flex-row md:items-center md:justify-between"><div className="min-w-0 break-words"><strong className="text-slate-800">{display(doc.documentTypeName || doc.name || doc.claimTopicCode || 'Document')}</strong></div>{doc.downloadUrl && (doc.documentUid || doc.submissionDocumentUid) ? <button type="button" onClick={() => setActiveDocument(doc)} className="inline-flex min-h-10 w-full shrink-0 items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 text-xs font-semibold text-blue-700 transition hover:bg-blue-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 md:w-auto"><Eye className="size-4" aria-hidden="true"/>View document</button> : <span className="text-xs text-slate-500">Not available</span>}</li>)}</ul></div>}
        </li>;
      })}</ol> : <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500"><CalendarDays className="mx-auto mb-2 size-6 text-slate-400"/>No application activity has been recorded yet.</div>}
    </>}
    </>}
  </Modal>;
}
