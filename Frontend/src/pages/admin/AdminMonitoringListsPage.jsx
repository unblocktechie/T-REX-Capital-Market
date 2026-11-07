import { PriceValue } from '@/components/common/PriceValue';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowDown, ArrowUp, ArrowUpDown, ExternalLink, History, Users } from 'lucide-react';
import { CompactAddress } from '@/components/common/CompactAddress';
import { AdminAddressPill } from '@/components/admin/AdminAddressPill';
import { AdminTableSortHeading } from '@/components/admin/AdminTableSortHeading';
import { sortAdminInvestorPage, investorInitials } from '@/utils/adminInvestorSort';
import { adminTokenCurrentHolders, adminTokenCreatedDate } from '@/utils/adminTokenListDisplay';
import { useQuery } from '@tanstack/react-query';
import { adminApi, adminMonitoringApi, adminNetworkApi } from '@/api/admin';
import { ROUTES } from '@/config/routes';
import { useDebounce } from '@/hooks/useDebounce';
import { toast } from 'sonner';
import { getApplicationTokenLabel } from '@/utils/adminApplicationExplorer';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { AdminListIntro, ListTools, MonitoringTable, StateChip, display, shorten, when, formatStatus, capitalizeStatusOption } from '@/components/admin/AdminMonitoringParts';
import { ResponsiveTooltip } from '@/components/common/ResponsiveTooltip';
import { getChainRecordById, getChainRecordByUid } from '@/config/web3';
import { resolveChainExplorerUrl } from '@/utils/chainExplorerOverrides';
import { adminTokenAddressExplorerUrl } from '@/utils/adminTokenDisplay';
import { createMonitoringFilterState, DEFAULT_MONITORING_FILTERS, updateMonitoringFilterState, restoreMonitoringFilters } from './adminMonitoringFilters';
import { resolveAdminIssuerOrganizationUid } from '@/utils/adminIssuerNavigation';
import { sortAdminApplicationPage } from '@/utils/adminApplicationSort';
import { AdminTokenDetailsDialog, AdminApplicationHistoryDialog } from '@/components/admin/AdminMonitoringDetailDialogs';

const PAGE_SIZE = 20;
const APPLICATION_STAGES = [
  { value: 'pending', label: 'Investor documents pending' },
  { value: 'submitIntrest', label: 'Awaiting issuer review' },
  { value: 'verifiedByIssuer', label: 'Issuer verified' },
  { value: 'claimSubmitted', label: 'Claim submitted' },
  { value: 'registered', label: 'Registered' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'cancelled', label: 'Cancelled' },
];
// Keep each application's status readable at a glance. Detailed workflow guidance
// belongs in the tooltip, not repeated beneath the badge.
export const APPLICATION_STAGE_HELP = Object.freeze({
  pending: 'The investor still needs to provide the required documents.',
  submitIntrest: 'The investor has applied and is waiting for the issuer to review the request.',
  verifiedByIssuer: 'The issuer has reviewed the application. The investor can now complete the next step.',
  claimSubmitted: 'The investor has completed their step. Registration is being processed.',
  registered: 'The investor is registered for this investment.',
  approved: 'The application has been approved.',
  rejected: 'The application was declined.',
  cancelled: 'The application was cancelled.',
});

export const getApplicationStageHelp = ({ status, canResubmitClaim }) => {
  const explanation = APPLICATION_STAGE_HELP[status] || 'This is the latest recorded status for this application.';
  return canResubmitClaim === true || canResubmitClaim === 1
    ? `${explanation} The investor can retry the previous step.`
    : explanation;
};

function ApplicationStageLabel({ application }) {
  const explanation = getApplicationStageHelp(application);
  const statusLabel = formatStatus(application.status);
  const displayLabel = statusLabel.charAt(0).toUpperCase() + statusLabel.slice(1);
  return <ResponsiveTooltip
    content={explanation}
    ariaLabel={`${displayLabel}. ${explanation}`}
    className="cursor-help"
  >
    <StateChip value={application.status} label={displayLabel} />
  </ResponsiveTooltip>;
}

const INVESTOR_STATUSES = ['notStarted', 'draft', 'pending', 'submitted', 'approved', 'rejected', 'verified'].map((value) => ({ value, label: value === 'notStarted' ? 'Profile not started' : value }));
const TOKEN_STATUSES = ['draft', 'deployed', 'failed'].map((value) => ({ value, label: value }));
const info = {
  investors: { eyebrow: 'Investor monitoring', title: 'Investor accounts', description: 'View registered investors, including those who have not started a profile. Open an investor to inspect identity, token investments and applications.' },
  tokens: { eyebrow: 'Asset monitoring', title: 'Platform tokens', description: 'Review tokens across organizations and networks, including drafts. Historical token listings are not a measure of investor balances.' },
  applications: { eyebrow: 'Application monitoring', title: 'Investor applications', description: 'Track applications from all investors and issuers, including the steps awaiting an issuer review.' },
};

const linkClass = 'font-semibold text-slate-900 transition-colors hover:text-blue-700 hover:underline focus-visible:text-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600';
const detailsLinkClass = 'inline-flex min-h-10 items-center font-semibold text-blue-700 transition-colors hover:text-blue-900 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600';
const getInvestorColumns = (sortBy, sortOrder, onSort, filters) => [
  { key: 'investor', title: <AdminTableSortHeading label="Investor" field="investor" sortBy={sortBy} sortOrder={sortOrder} onSort={onSort}/>, sortDirection: sortBy === 'investor' ? sortOrder : undefined, render: (r) => {
    const name = display(r.fullName || [r.firstName, r.lastName].filter(Boolean).join(' ') || r.email);
    return <div className="flex min-w-0 items-center gap-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-slate-950 to-slate-700 text-xs font-semibold text-white" aria-hidden="true">{investorInitials(name)}</span>
      <div className="min-w-0">
        <Link className="block max-w-[260px] truncate font-semibold text-slate-950 transition-colors hover:text-blue-700 hover:underline" title={name} to={ROUTES.adminInvestor(r.userUid)} state={{ monitoringFilters: { ...filters } }}>{name}</Link>
        <p className="mb-0 mt-1 text-xs text-slate-500">{display(r.email)}</p>
      </div>
    </div>;
  } },
  { key: 'wallet', title: 'Wallet', render: (r) => <AdminAddressPill value={r.walletAddress} label="Investor wallet address" leading={10} trailing={8}/> },
  { key: 'emailVerified', title: <AdminTableSortHeading label="Email verified" field="emailVerified" sortBy={sortBy} sortOrder={sortOrder} onSort={onSort}/>, sortDirection: sortBy === 'emailVerified' ? sortOrder : undefined, render: (r) => <StateChip value={r.emailVerified ? 'Verified' : 'Pending'} /> },
  { key: 'profileStatus', title: <AdminTableSortHeading label="Profile" field="profileStatus" sortBy={sortBy} sortOrder={sortOrder} onSort={onSort}/>, sortDirection: sortBy === 'profileStatus' ? sortOrder : undefined, render: (r) => { const profileStatus = r.profileStatus || (r.investorUid ? 'Draft' : 'Not started'); return <StateChip value={profileStatus} label={capitalizeStatusOption(profileStatus)} />; } },
  { key: 'isActive', title: <AdminTableSortHeading label="Account" field="isActive" sortBy={sortBy} sortOrder={sortOrder} onSort={onSort}/>, sortDirection: sortBy === 'isActive' ? sortOrder : undefined, render: (r) => <StateChip value={r.isActive === false ? 'Inactive' : 'Active'} /> },
  { key: 'action', title: 'Details', render: (r) => <Link className={detailsLinkClass} to={ROUTES.adminInvestor(r.userUid)} state={{ monitoringFilters: { ...filters } }}>View investor →</Link> },
];
// Resolve the explorer from the token's OWN chain, never the admin's selected wallet.
// A missing address/explorer is rendered as non-clickable text, not a broken link.
const tokenExplorerLink = (token, chains) => {
  const matchingChain = chains.find((chain) => token.chainUid && chain.chainUid === token.chainUid)
    || chains.find((chain) => token.chainId && Number(chain.chainId) === Number(token.chainId))
    || getChainRecordByUid(token.chainUid)
    || getChainRecordById(token.chainId);
  const chainId = matchingChain?.chainId || token.chainId;
  const localChain = getChainRecordByUid(token.chainUid) || getChainRecordById(chainId);
  return adminTokenAddressExplorerUrl(
    token.tokenAddress,
    resolveChainExplorerUrl(chainId, matchingChain?.explorerUrl || localChain?.explorerUrl || ''),
  );
};

function AdminTokenName({ token, chains }) {
  const link = tokenExplorerLink(token, chains);
  // Match Investor Details: one weight for the entire token name and symbol.
  const title = <span className="font-semibold">{display(token.tokenName)} <span>({display(token.tokenSymbol)})</span>{link && <ExternalLink className="ml-1 inline-block size-3 align-[-1px] text-slate-400 group-hover:text-blue-600" aria-hidden="true" />}</span>;
  const address = <AdminAddressPill value={token.tokenAddress} label={`${display(token.tokenName)} token contract address`} leading={10} trailing={7} />;
  if (!link) return <div className="flex min-w-0 flex-col items-start gap-1.5">{title}{address}</div>;
  return <div className="flex min-w-0 flex-col items-start gap-1.5">
    <a href={link} target="_blank" rel="noopener noreferrer"
      aria-label={`View ${display(token.tokenName)} on the ${display(token.chainName || token.chainId)} blockchain explorer (opens in a new tab)`}
      title="View token contract in blockchain explorer"
      className="group inline-flex min-w-0 cursor-pointer rounded-md text-slate-900 transition-colors hover:text-blue-700 hover:underline focus-visible:text-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">{title}</a>
    {address}
  </div>;
}

function AdminTokenPrice({ value, label }) {
  return <PriceValue value={value} label={label} className="whitespace-nowrap text-slate-700" />;
}

// Use the same font weight and muted text color as the Investor Accounts table
// header. Sorting remains blue only on hover/focus and the active arrow.
const sortableHeaderClass = 'inline-flex min-h-8 items-center gap-1.5 rounded-md text-left font-semibold text-slate-500 hover:text-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600';

const tokenSortHeading = (label, key, sortBy, sortOrder, onSort) => <button
  type="button" onClick={() => onSort(key)}
  aria-label={`Sort by ${label} ${sortBy === key && sortOrder === 'asc' ? 'descending' : 'ascending'}`}
  title={`Sort by ${label}`} className={sortableHeaderClass}>
  {label.toUpperCase()}{sortBy === key ? (sortOrder === 'asc' ? <ArrowUp className="size-3.5 text-blue-600" aria-hidden="true"/> : <ArrowDown className="size-3.5 text-blue-600" aria-hidden="true"/>) : <ArrowUpDown className="size-3.5 text-slate-400" aria-hidden="true"/>}
</button>;

const getTokenColumns = (chains, onViewToken, sortBy, sortOrder, onSort, renderIssuer) => [
  { key: 'token', title: tokenSortHeading('Token', 'tokenName', sortBy, sortOrder, onSort), render: (r) => <AdminTokenName token={r} chains={chains} /> },
  { key: 'issuer', title: tokenSortHeading('Issuer', 'legalCompanyName', sortBy, sortOrder, onSort), render: (r) => renderIssuer(r, r.legalCompanyName) },
  { key: 'network', title: tokenSortHeading('Network', 'chainName', sortBy, sortOrder, onSort), render: (r) => display(r.chainName || r.chainId) },
  { key: 'price', title: tokenSortHeading('Current price', 'currentTokenPrice', sortBy, sortOrder, onSort), render: (r) => <AdminTokenPrice value={r.currentTokenPrice} label="Current price"/> },
  { key: 'holders', title: tokenSortHeading('Current holders', 'currentHolders', sortBy, sortOrder, onSort), render: (r) => adminTokenCurrentHolders(r) },
  { key: 'status', title: tokenSortHeading('Status', 'status', sortBy, sortOrder, onSort), render: (r) => { const text = formatStatus(r.status); return <StateChip value={r.status} label={text.charAt(0).toUpperCase() + text.slice(1)} />; } },
  { key: 'created', title: tokenSortHeading('Created', 'createdAt', sortBy, sortOrder, onSort), render: (r) => <time dateTime={r.createdAt || undefined} title={r.createdAt ? when(r.createdAt) : undefined}>{adminTokenCreatedDate(r.createdAt)}</time> },
  { key: 'investors', title: <span className="font-semibold text-slate-500">INVESTORS</span>, render: (r) => <button type="button" disabled={!r.tokenUid} onClick={() => onViewToken(r.tokenUid)} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-50 hover:text-blue-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 disabled:opacity-40"><Users className="size-4" aria-hidden="true"/>View details</button> },
];
// Application sorting follows the token table's compact header controls.
// Clicking an active heading toggles direction and always returns to page one.
const applicationSortHeading = (label, key, sortBy, sortOrder, onSort) => <button
  type="button" onClick={() => onSort(key)}
  aria-label={`Sort by ${label} ${sortBy === key && sortOrder === 'asc' ? 'descending' : 'ascending'}`}
  aria-pressed={sortBy === key}
  title={`Sort by ${label}`}
  className={sortableHeaderClass}
>{label.toUpperCase()}{sortBy === key ? (sortOrder === 'asc' ? <ArrowUp className="size-3.5 text-blue-600" aria-hidden="true"/> : <ArrowDown className="size-3.5 text-blue-600" aria-hidden="true"/>) : <ArrowUpDown className="size-3.5 text-slate-400" aria-hidden="true"/>}</button>;

// Keep investor names, issuer links and token actions independent. A token opens
// the existing details dialog in place, leaving list filters and scroll intact.
const getApplicationColumns = (onViewHistory, onViewToken, renderIssuer, sortBy, sortOrder, onSort) => [
  { key: 'investor', title: applicationSortHeading('Investor', 'investorName', sortBy, sortOrder, onSort), render: (r) => {
    const name = display(r.investorName || r.investorEmail);
    return <div className="flex min-w-0 items-center gap-3">
      <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-slate-950 to-slate-700 text-xs font-semibold text-white">{investorInitials(name)}</span>
      <div className="min-w-0">
        {r.investorUserUid ? <Link className={`${linkClass} block max-w-[260px] truncate`} title={name} to={ROUTES.adminInvestor(r.investorUserUid)} state={{ from: ROUTES.adminInvestorApplications }}>{name}</Link>
          : <span className="block font-semibold text-slate-900">{name}</span>}
        <p className="mb-0 mt-1 break-all text-xs text-slate-500">{display(r.investorEmail)}</p>
      </div>
    </div>;
  } },
  { key: 'issuer', title: applicationSortHeading('Issuer', 'issuerName', sortBy, sortOrder, onSort), render: (r) => renderIssuer(r, r.issuerName || r.legalCompanyName || r.organizationName) },
  { key: 'token', title: applicationSortHeading('Token', 'tokenName', sortBy, sortOrder, onSort), render: (r) => <button
    type="button" onClick={() => onViewToken(r)}
    disabled={!r.tokenUid && !r.token?.tokenUid && !r.interestUid}
    title="View token details and investors"
    aria-label={`View token details for ${getApplicationTokenLabel(r, r)}`}
    className="max-w-[260px] min-h-10 cursor-pointer text-left font-semibold text-slate-950 transition-colors hover:text-blue-700 hover:underline focus-visible:rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 disabled:cursor-default disabled:opacity-60"
  >{getApplicationTokenLabel(r, r)}</button> },
  { key: 'chain', title: applicationSortHeading('Network', 'chainName', sortBy, sortOrder, onSort), render: (r) => display(r.chainName || r.chainId) },
  { key: 'stage', title: applicationSortHeading('Current Stage', 'status', sortBy, sortOrder, onSort), render: (r) => <ApplicationStageLabel application={r} /> },
  { key: 'submitted', title: applicationSortHeading('Submitted', 'submittedAt', sortBy, sortOrder, onSort), render: (r) => when(r.submittedAt || r.createdAt) },
  { key: 'history', title: 'HISTORY', render: (r) => <button type="button" disabled={!r.interestUid} onClick={() => onViewHistory(r)} className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-50 hover:text-blue-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-40"><History className="size-4" aria-hidden="true"/>View timeline</button> },
];

// Use a keyed inner component so search debounce, queries and pagination are
// recreated for each route. The parent keeps independent filter selections.
function AdminMonitoringListContent({ kind, filters, onFiltersChange }) {
  const location = useLocation();
  const [selectedTokenUid, setSelectedTokenUid] = useState(null);
  const [selectedInterestUid, setSelectedInterestUid] = useState(null);
  const [selectedApplication, setSelectedApplication] = useState(null);
  const config = info[kind] || info.investors;
  useDocumentTitle(config.title);
  const { page, search, status, chainUid } = filters;
  const sortBy = filters.sortBy || '';
  const sortOrder = filters.sortOrder || 'asc';
  const setPage = (value) => onFiltersChange({ page: value });
  const setSearch = (value) => onFiltersChange({ search: value });
  const setStatus = (value) => onFiltersChange({ status: value });
  const setChainUid = (value) => onFiltersChange({ chainUid: value });
  const onInvestorSort = useCallback((key) => onFiltersChange({ sortBy: key, sortOrder: sortBy === key && sortOrder === 'asc' ? 'desc' : 'asc', page: 1 }), [onFiltersChange, sortBy, sortOrder]);
  const onTokenSort = useCallback((key) => onFiltersChange({ sortBy: key, sortOrder: sortBy === key && sortOrder === 'asc' ? 'desc' : 'asc', page: 1 }), [onFiltersChange, sortBy, sortOrder]);
  const onApplicationSort = useCallback((key) => onFiltersChange({ sortBy: key, sortOrder: sortBy === key && sortOrder === 'asc' ? 'desc' : 'asc', page: 1 }), [onFiltersChange, sortBy, sortOrder]);
  const debouncedSearch = useDebounce(search, 350);
  const chainsQuery = useQuery({ queryKey: ['admin','chains'], queryFn: adminNetworkApi.listChains, staleTime: 60_000 });
  const params = useMemo(() => ({ page, limit: PAGE_SIZE, search: debouncedSearch, status, chainUid, ...((kind === 'tokens' || kind === 'applications') && sortBy ? { sortBy, sortOrder } : {}) }), [page, debouncedSearch, status, chainUid, kind, sortBy, sortOrder]);
  const query = useQuery({
    queryKey: ['admin','monitoring',kind,params],
    queryFn: () => kind === 'investors' ? adminMonitoringApi.listInvestors(params) : kind === 'tokens' ? adminMonitoringApi.listTokens(params) : adminMonitoringApi.listApplications(params),
    staleTime: 20_000,
  });
  useEffect(() => {
    if (!query.isFetching && query.data?.pagination?.totalPages && page > query.data.pagination.totalPages) setPage(query.data.pagination.totalPages);
  }, [page, query.data?.pagination?.totalPages, query.isFetching]);
  const change = (setter) => (value) => { setter(value); setPage(1); };
  const changeStatus = (value) => { setStatus(value); setPage(1); };
  const hasFilters = Boolean(search.trim() || status !== 'all' || chainUid);
  const hasSortFilter = Boolean(sortBy);
  const clearFilters = () => onFiltersChange({ ...DEFAULT_MONITORING_FILTERS, sortBy: '', sortOrder: 'asc' });
  const statusOptions = kind === 'investors' ? INVESTOR_STATUSES : kind === 'tokens' ? TOKEN_STATUSES : APPLICATION_STAGES;
  // Some older monitoring API responses have a legal/issuer name but no organizationUid.
  // Only resolve a name when it matches exactly one organization; never guess a destination.
  const rows = query.data?.items || [];
  const missingOrganizationUid = (kind === 'tokens' || kind === 'applications') && rows.some(
    (row) => !resolveAdminIssuerOrganizationUid(row),
  );
  const organizationDirectory = useQuery({
    queryKey: ['admin', 'organizations', 'issuer-link-directory'],
    queryFn: () => adminApi.listOrganizations({ page: 1, pageSize: 100 }),
    enabled: missingOrganizationUid,
    staleTime: 60_000,
  });
  const renderIssuer = useCallback((row, name) => {
    const uid = resolveAdminIssuerOrganizationUid(row, organizationDirectory.data?.items || []);
    return uid ? <Link className={linkClass} to={ROUTES.adminOrganizationReview(encodeURIComponent(uid))}
      state={{ from: location.pathname, backState: { monitoringFilters: { ...filters } } }}
    >{display(name)}</Link> : <span className="text-slate-900">{display(name)}</span>;
  }, [organizationDirectory.data?.items, location.pathname, filters]);
  const investorColumns = useMemo(() => getInvestorColumns(sortBy, sortOrder, onInvestorSort, filters), [sortBy, sortOrder, onInvestorSort, filters]);
  const investorRows = useMemo(() => kind === 'investors' ? sortAdminInvestorPage(rows, sortBy, sortOrder) : rows, [kind, rows, sortBy, sortOrder]);
  const tokenColumns = useMemo(() => getTokenColumns(chainsQuery.data || [], setSelectedTokenUid, sortBy, sortOrder, onTokenSort, renderIssuer), [chainsQuery.data, sortBy, sortOrder, onTokenSort, renderIssuer]);
  const openApplicationHistory = useCallback((application) => { setSelectedApplication(application); setSelectedInterestUid(application.interestUid); }, []);
  // Older application records can omit tokenUid. Recover it from the same
  // read-only history endpoint already used by View timeline, when needed.
  const openApplicationToken = useCallback(async (application) => {
    const directUid = application.tokenUid || application.token?.tokenUid;
    if (directUid) { setSelectedTokenUid(directUid); return; }
    if (!application.interestUid) return;
    try {
      const history = await adminMonitoringApi.getApplicationHistory(application.interestUid);
      const tokenUid = history?.tokenUid || history?.token?.tokenUid;
      if (tokenUid) setSelectedTokenUid(tokenUid);
      else toast.error('Token details are unavailable for this application.');
    } catch {
      toast.error('Could not open token details. Please try again.');
    }
  }, []);
  const applicationColumns = useMemo(() => getApplicationColumns(openApplicationHistory, openApplicationToken, renderIssuer, sortBy, sortOrder, onApplicationSort), [openApplicationHistory, openApplicationToken, renderIssuer, sortBy, sortOrder, onApplicationSort]);
  const applicationRows = useMemo(() => kind === 'applications' ? sortAdminApplicationPage(rows, sortBy, sortOrder) : rows, [kind, rows, sortBy, sortOrder]);
  return <div className={`space-y-6 ${kind === 'applications' ? 'admin-applications-list' : ''}`}>
    <AdminListIntro {...config}/>
    <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <ListTools search={search} onSearch={change(setSearch)} status={status} onStatus={changeStatus} statuses={statusOptions}
        chainUid={chainUid} onChain={change(setChainUid)} chains={chainsQuery.data || []} onRefresh={() => query.refetch()} refreshing={query.isFetching} onClear={clearFilters} hasFilters={hasFilters || hasSortFilter}
      />
    </div>
    <MonitoringTable columns={kind === 'investors' ? investorColumns : kind === 'tokens' ? tokenColumns : applicationColumns} items={kind === 'investors' ? investorRows : kind === 'applications' ? applicationRows : rows}
      loading={query.isLoading} pending={query.isFetching} error={query.error} onRetry={() => query.refetch()} pagination={query.data?.pagination} onPageChange={setPage} />
    {(kind === 'tokens' || kind === 'applications') && <AdminTokenDetailsDialog key={selectedTokenUid || 'closed-token'} tokenUid={selectedTokenUid} chains={chainsQuery.data || []} onClose={() => setSelectedTokenUid(null)}/>}
    {kind === 'applications' && <AdminApplicationHistoryDialog key={selectedInterestUid || 'closed-application'} interestUid={selectedInterestUid} application={selectedApplication} onClose={() => { setSelectedInterestUid(null); setSelectedApplication(null); }}/>}
  </div>;
}


export default function AdminMonitoringListsPage({ kind = 'investors' }) {
  const location = useLocation();
  // Restore the exact list view when returning from an organization detail page.
  const [filtersByKind, setFiltersByKind] = useState(() => restoreMonitoringFilters(kind, location.state?.monitoringFilters));
  const filters = filtersByKind[kind] || DEFAULT_MONITORING_FILTERS;
  const updateFilters = (changes) => setFiltersByKind((current) => updateMonitoringFilterState(current, kind, changes));

  return <AdminMonitoringListContent key={kind} kind={kind} filters={filters} onFiltersChange={updateFilters} />;
}
