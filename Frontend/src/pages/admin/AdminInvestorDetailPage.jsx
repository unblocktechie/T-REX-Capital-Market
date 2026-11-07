import { PriceValue } from '@/components/common/PriceValue';
import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, RefreshCcw, History } from 'lucide-react';
import { CompactAddress } from '@/components/common/CompactAddress';
import { AdminAddressPill } from '@/components/admin/AdminAddressPill';
import { AdminTableSortHeading } from '@/components/admin/AdminTableSortHeading';
import { investorInitials, issuerInitials, sortAdminInvestorChainPage, sortAdminInvestorTokenPage, sortAdminInvestorApplicationPage } from '@/utils/adminInvestorSort';
import { adminApi, adminMonitoringApi, adminNetworkApi } from '@/api/admin';
import { ROUTES } from '@/config/routes';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { display, MonitoringTable, StateChip, when, capitalizeStatusOption } from '@/components/admin/AdminMonitoringParts';
import { getErrorMessage } from '@/utils/error';
import { cn } from '@/utils/cn';
import { ResponsiveTooltip } from '@/components/common/ResponsiveTooltip';
import { AdminApplicationHistoryDialog, AdminTokenDetailsDialog } from '@/components/admin/AdminMonitoringDetailDialogs';

const TAB_META = {
  chains: { label: 'Network access' },
  investedTokens: { label: 'Invested tokens' },
  applications: { label: 'Applications' },
};
const cols = {
  chains: [
    { key: 'chain', title: 'Network', render: (r) => <div className="font-semibold">{display(r.chainName)}<p className="mb-0 mt-1 text-xs text-slate-500">Chain ID: {display(r.chainId)}</p></div> },
    { key: 'wallet', title: 'Wallet', render: (r) => <AdminAddressPill value={r.walletAddress} label="Investor wallet address" leading={10} trailing={8}/> },
    { key: 'identity', title: 'Identity address', render: (r) => <AdminAddressPill value={r.identityAddress} label="Identity address" leading={10} trailing={8}/> },
    { key: 'status', title: 'Identity status', render: (r) => <StateChip value={r.status || 'LOCKED'}/> },
    { key: 'unlocked', title: 'Unlocked', render: (r) => <StateChip value={r.isUnlocked ? 'Unlocked' : 'Locked'}/> },
    { key: 'date', title: 'Unlocked at', render: (r) => when(r.unlockedAt) },
  ],
  investedTokens: [
    { key: 'issuer', title: 'Issuer', render: (r) => display(issuerDisplayName(r)) },
    { key: 'token', title: 'Token', render: (r) => <span className="font-semibold text-slate-950">{tokenDisplayName(r)}</span> },
    { key: 'address', title: 'Token address', render: (r) => <AdminAddressPill value={r.tokenAddress} label="Token address" leading={10} trailing={8}/> },
    { key: 'chain', title: 'Network', render: (r) => display(r.chainName || r.chainId) },
    { key: 'price', title: 'Current price', render: (r) => <InvestedTokenPrice value={r.currentTokenPrice} /> },
  ],
  applications: [
    { key: 'issuer', title: 'Issuer', render: (r) => display(issuerDisplayName(r)) },
    { key: 'token', title: 'Token', render: (r) => <span className="font-semibold text-slate-950">{tokenDisplayName(r)}</span> },
    { key: 'chain', title: 'Network', render: (r) => display(r.chainName || r.chainId) },
    { key: 'stage', title: 'Stage', render: (r) => <StateChip value={r.status} label={capitalizeStatusOption(r.status)} /> },
    { key: 'submitted', title: 'Submitted', render: (r) => when(r.submittedAt || r.createdAt) },
  ],
};
const issuerDisplayName = (row) => row.legalCompanyName || row.issuerName || row.issuer?.legalCompanyName || row.organizationName || '';
const tokenDisplayName = (row) => {
  const name = String(row.tokenName || row.token?.name || row.tokenSymbol || '').trim();
  const symbol = String(row.tokenSymbol || row.token?.symbol || '').trim();
  return symbol && name && name.toLowerCase() !== symbol.toLowerCase() ? `${name} (${symbol})` : display(name || symbol);
};
const applicationHistoryColumn = (onViewHistory) => ({
  key: 'history',
  title: 'History',
  render: (application) => <button
    type="button"
    disabled={!application.interestUid}
    onClick={() => onViewHistory(application)}
    className="inline-flex min-h-10 items-center gap-2 whitespace-nowrap rounded-lg px-3 text-sm font-semibold text-blue-700 transition hover:bg-blue-50 hover:text-blue-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-40"
  ><History className="size-4" aria-hidden="true"/>View timeline</button>,
});

function InvestedTokenPrice({ value }) {
  return <PriceValue value={value} className="inline-block max-w-full whitespace-nowrap text-slate-700" />;
}
const textBox = 'rounded-xl border border-slate-200 bg-slate-50 px-4 py-3';
function DataField({ label, value, copyable = false }) {
  return <div className={cn(textBox, 'min-w-0', copyable && label === 'Wallet address' && 'admin-investor-detail-wallet')}>
    <dt className="text-xs font-medium text-slate-500">{label}</dt>
    <dd className="mb-0 mt-1 break-words text-sm font-semibold text-slate-900">
      {copyable && value ? <CompactAddress value={value} label={label} showFull className="max-w-full text-slate-950 [--text-soft:#0f172a]" /> : display(value)}
    </dd>
  </div>;
}

export default function AdminInvestorDetailPage() {
  const { userUid } = useParams();
  const location = useLocation();
  // Direct links default to Investor Accounts; application-origin links return
  // to Investor Applications instead of always sending admins to accounts.
  const fromApplications = location.state?.from === ROUTES.adminInvestorApplications;
  const backRoute = fromApplications ? ROUTES.adminInvestorApplications : ROUTES.adminInvestors;
  const backLabel = fromApplications ? 'Back to investor applications' : 'Back to investors';
  useDocumentTitle('Investor account');
  const [tab, setTab] = useState(() => location.state?.tab && TAB_META[location.state.tab] ? location.state.tab : 'chains');
  const [page, setPage] = useState(() => Math.max(1, Number(location.state?.page) || 1));
  const [chainSortBy, setChainSortBy] = useState('');
  const [chainSortOrder, setChainSortOrder] = useState('asc');
  const sortChains = (key) => { setChainSortOrder((current) => chainSortBy === key && current === 'asc' ? 'desc' : 'asc'); setChainSortBy(key); setPage(1); };
  const [detailSort, setDetailSort] = useState({ investedTokens: { by: '', order: 'asc' }, applications: { by: '', order: 'asc' } });
  const changeDetailSort = (field) => {
    setDetailSort((current) => {
      const active = current[tab];
      return { ...current, [tab]: { by: field, order: active.by === field && active.order === 'asc' ? 'desc' : 'asc' } };
    });
    setPage(1);
  };
  // Keep investor details at the top when opened from a scrolled list.
  useLayoutEffect(() => { window.scrollTo({ top: 0, left: 0, behavior: 'instant' }); }, [userUid]);
  const [selectedTokenUid, setSelectedTokenUid] = useState(null);
  const [selectedInterestUid, setSelectedInterestUid] = useState(null);
  const [selectedApplication, setSelectedApplication] = useState(null);
  const openApplicationHistory = (application) => { setSelectedApplication(application); setSelectedInterestUid(application.interestUid); };
  const applicationColumnsBase = useMemo(() => [...cols.applications, applicationHistoryColumn(openApplicationHistory)], []);
  // Reuse the admin token dialog without changing this page's route, tab, sort or pagination.
  const openTokenDetails = (row) => { if (row.tokenUid || row.token?.tokenUid) setSelectedTokenUid(row.tokenUid || row.token.tokenUid); };
  const chainsQuery = useQuery({ queryKey: ['admin', 'chains'], queryFn: adminNetworkApi.listChains, enabled: Boolean(selectedTokenUid), staleTime: 60_000 });
  const investorQuery = useQuery({ queryKey: ['admin','investor',userUid], queryFn: () => adminMonitoringApi.getInvestor(userUid), enabled: Boolean(userUid), staleTime: 30_000 });
  const params = useMemo(() => ({ page, limit: 10 }), [page]);
  const tabQuery = useQuery({
    queryKey: ['admin','investor',userUid,tab,params],
    queryFn: () => tab === 'chains' ? adminMonitoringApi.listInvestorChains(userUid, params) : tab === 'investedTokens' ? adminMonitoringApi.listInvestorTokens(userUid, params) : adminMonitoringApi.listInvestorApplications(userUid, params),
    enabled: Boolean(userUid), staleTime: 20_000,
  });
  // Some API versions only provide the issuer's legal name, not its UID.
  // Resolve that safely via the admin organization directory when needed.
  const missingIssuerUid = (tab === 'investedTokens' || tab === 'applications') && (tabQuery.data?.items || []).some(
    (row) => issuerDisplayName(row) && !row.organizationUid && !row.issuerOrganizationUid && !row.organizationId && !row.issuerUid && !row.issuer?.organizationUid,
  );
  const organizationDirectory = useQuery({
    queryKey: ['admin', 'organizations', 'issuer-link-directory'],
    queryFn: () => adminApi.listOrganizations({ page: 1, pageSize: 100 }),
    enabled: missingIssuerUid,
    staleTime: 60_000,
  });
  const chainColumns = cols.chains.map((column) => {
    const sortField = { chain: 'chainName', status: 'status', unlocked: 'isUnlocked', date: 'unlockedAt' }[column.key];
    return !sortField ? column : { ...column,
      title: <AdminTableSortHeading label={column.title} field={sortField} sortBy={chainSortBy} sortOrder={chainSortOrder} onSort={sortChains}/>,
      sortDirection: chainSortBy === sortField ? chainSortOrder : undefined,
    };
  });
  // Keep issuer navigation identical across Invested tokens and Applications.
  // If the endpoint returns only a legal name, match the organization directory
  // only when the name has exactly one match; never guess an organization UID.
  const issuerLink = (row, sourceTab) => {
    const name = issuerDisplayName(row);
    if (!name) return <span className="text-slate-500">—</span>;
    const matches = (organizationDirectory.data?.items || []).filter(
      (org) => String(org.name || '').trim().toLowerCase() === String(name).trim().toLowerCase(),
    );
    const uid = row.organizationUid || row.issuerOrganizationUid || row.organizationId || row.issuerUid
      || row.issuer?.organizationUid || (matches.length === 1 ? matches[0].id : '');
    const linkStyle = 'block max-w-[260px] truncate rounded-sm font-semibold text-slate-950 transition-colors hover:text-blue-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600';
    return <div className="flex min-w-0 items-center gap-3">
      <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-slate-950 to-slate-700 text-xs font-semibold text-white">{issuerInitials(name)}</span>
      <div className="min-w-0">
        {uid ? <Link className={linkStyle} title={name} to={ROUTES.adminOrganizationReview(uid)}
          state={{ from: location.pathname, backState: { tab: sourceTab, page } }}>{name}</Link>
          : <span className="block max-w-[260px] truncate font-semibold text-slate-950" title={name}>{name}</span>}
      </div>
    </div>;
  };
  const decorateColumns = (columns, tabKey) => columns.map((column) => {
    const field = { token: 'tokenName', issuer: 'issuerName', chain: 'chainName', price: 'currentTokenPrice', stage: 'status', submitted: 'submittedAt' }[column.key];
    const active = detailSort[tabKey];
    return {
      ...column,
      ...(column.key === 'issuer' ? { render: (row) => issuerLink(row, tabKey) } : {}),
      ...(column.key === 'token' ? { render: (row) => (row.tokenUid || row.token?.tokenUid)
        ? <button type="button" onClick={() => openTokenDetails(row)} className="min-h-10 max-w-full text-left font-semibold text-slate-950 transition-colors hover:text-blue-700 hover:underline focus-visible:rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600" aria-label={`View token details for ${tokenDisplayName(row)}`}>{tokenDisplayName(row)}</button>
        : <span className="font-semibold text-slate-950">{tokenDisplayName(row)}</span> } : {}),
      ...(field ? {
        title: <AdminTableSortHeading label={column.title} field={field} sortBy={active.by} sortOrder={active.order} onSort={changeDetailSort} />,
        sortDirection: active.by === field ? active.order : undefined,
      } : {}),
    };
  });
  const investedTokenColumns = decorateColumns(cols.investedTokens, 'investedTokens');
  const applicationColumns = decorateColumns(applicationColumnsBase, 'applications');
  const detailRows = useMemo(() => {
    const records = tabQuery.data?.items || [];
    if (tab === 'chains') return sortAdminInvestorChainPage(records, chainSortBy, chainSortOrder);
    const { by, order } = detailSort[tab];
    return tab === 'investedTokens' ? sortAdminInvestorTokenPage(records, by, order) : sortAdminInvestorApplicationPage(records, by, order);
  }, [tab, tabQuery.data?.items, chainSortBy, chainSortOrder, detailSort]);
  useEffect(() => { if (!tabQuery.isFetching && tabQuery.data?.pagination?.totalPages && page > tabQuery.data.pagination.totalPages) setPage(tabQuery.data.pagination.totalPages); }, [page, tabQuery.data?.pagination?.totalPages, tabQuery.isFetching]);
  const investor = investorQuery.data || {};
  const profile = investor.profile || investor.investor || {};
  const account = investor.account || investor.user || {};
  const value = (key) => investor[key] ?? profile[key] ?? account[key];
  const displayName = value('fullName') || [value('firstName'), value('lastName')].filter(Boolean).join(' ') || value('email') || 'Investor';
  const changeTab = (next) => { setSelectedTokenUid(null); setSelectedInterestUid(null); setSelectedApplication(null); setTab(next); setPage(1); };
  useEffect(() => { setSelectedTokenUid(null); setSelectedInterestUid(null); setSelectedApplication(null); }, [userUid]);
  return <div className="space-y-6">
    {(investorQuery.isLoading || investorQuery.isError) && <Link className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-blue-700 hover:underline" to={backRoute} state={location.state?.monitoringFilters ? { monitoringFilters: location.state.monitoringFilters } : undefined}><ArrowLeft className="size-4" aria-hidden="true"/>{backLabel}</Link>}
    {investorQuery.isLoading ? <div className="h-44 animate-pulse rounded-[24px] bg-slate-100"/> : investorQuery.isError ? <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">Could not load investor details: {getErrorMessage(investorQuery.error)} <button type="button" className="ml-2 underline" onClick={() => investorQuery.refetch()}>Retry</button></div> : <section className="rounded-[24px] border border-slate-200 bg-white shadow-[0_12px_32px_rgba(15,23,42,0.04)]">
      <header className="border-b border-slate-200 px-5 py-5 sm:px-6">
        <Link className="inline-flex min-h-9 items-center gap-1.5 text-xs font-semibold text-slate-500 transition hover:text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600" to={backRoute} state={location.state?.monitoringFilters ? { monitoringFilters: location.state.monitoringFilters } : undefined}><ArrowLeft className="size-4" aria-hidden="true"/>{backLabel}</Link>
        <div className="mt-4 flex min-w-0 items-start gap-3 sm:gap-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-full bg-gradient-to-br from-slate-950 to-slate-700 text-sm font-semibold text-white shadow-lg sm:size-14 sm:text-base" aria-hidden="true">{investorInitials(displayName)}</span>
          <div className="min-w-0">
            <h2 className="m-0 break-words text-2xl font-semibold tracking-normal text-slate-950 sm:text-3xl">{displayName}</h2>
            <p className="mb-0 mt-2 max-w-4xl text-sm leading-6 text-slate-500">Read-only profile and multi-network activity. Investment history shows tokens previously invested in, not balances or portfolio valuations.</p>
          </div>
        </div>
      </header>
      <div className="px-5 py-5 sm:px-6">
      <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <DataField label="User UID" value={userUid}/><DataField label="Email" value={value('email')}/>
        <DataField label="Email verification" value={value('emailVerified') === true ? 'Verified' : 'Not verified'}/>
        <DataField label="Account" value={value('isActive') === false ? 'Inactive' : 'Active'}/>
        <DataField label="Profile status" value={value('profileStatus') || (value('investorUid') ? 'Draft' : 'Not started')}/>
        <DataField label="Current step" value={value('currentStep')}/><DataField label="Accreditation" value={value('accreditationType')}/>
        <DataField label="Submitted" value={when(value('submittedAt'))}/>
        <DataField label="Investor UID" value={value('investorUid')}/><DataField label="Wallet address" value={value('walletAddress')} copyable/>
        <DataField label="First name" value={value('firstName')}/><DataField label="Last name" value={value('lastName')}/>
        <DataField label="Country UID" value={value('countryUid')}/><DataField label="Profile draft" value={value('isDraft') === true ? 'Yes' : value('isDraft') === false ? 'No' : null}/>
      </dl>
      </div>
    </section>}
    <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-wrap gap-2" role="tablist" aria-label="Investor activity">
          {Object.entries(TAB_META).map(([key, data]) => <button type="button" role="tab" aria-selected={key === tab} key={key} onClick={() => changeTab(key)} className={`min-h-10 rounded-xl border px-4 text-sm font-semibold transition ${tab === key ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>{data.label}</button>)}
        </div>
        <button type="button" disabled={tabQuery.isFetching} onClick={() => tabQuery.refetch()} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 disabled:opacity-40 sm:self-auto"><RefreshCcw className={`size-4 ${tabQuery.isFetching ? 'animate-spin' : ''}`} aria-hidden="true"/>Refresh</button>
      </div>
    </div>
    <MonitoringTable columns={tab === 'applications' ? applicationColumns : tab === 'investedTokens' ? investedTokenColumns : chainColumns} items={detailRows} loading={tabQuery.isLoading} error={tabQuery.error} onRetry={() => tabQuery.refetch()} pagination={tabQuery.data?.pagination} onPageChange={setPage} pending={tabQuery.isFetching} emptyText={`No ${TAB_META[tab].label.toLowerCase()} for this investor.`}/>
    <AdminTokenDetailsDialog key={`${userUid}:${selectedTokenUid || 'closed-token'}`} tokenUid={selectedTokenUid} chains={chainsQuery.data || []} onClose={() => setSelectedTokenUid(null)}/>
    <AdminApplicationHistoryDialog key={`${userUid}:${selectedInterestUid || 'closed'}`} interestUid={selectedInterestUid} application={selectedApplication} onClose={() => { setSelectedInterestUid(null); setSelectedApplication(null); }}/>
  </div>;
}
