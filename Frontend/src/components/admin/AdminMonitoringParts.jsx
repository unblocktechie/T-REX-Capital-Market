import { ChevronLeft, ChevronRight, Globe2, ListFilter, RefreshCcw, Search, X } from 'lucide-react';
import { MarketplaceDropdown } from '@/components/investor-marketplace/MarketplaceDropdown';
import '@/assets/styles/admin-monitoring.css';
import { AdminPanel } from './AdminPanel';
import { getErrorMessage } from '@/utils/error';

const fieldStyle = 'min-h-11 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
export const inputStyle = fieldStyle;
export const display = (value) => value === null || value === undefined || value === '' ? '—' : String(value);
export const when = (value) => value ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—';
export const shorten = (value) => value && String(value).length > 21 ? `${String(value).slice(0, 10)}…${String(value).slice(-6)}` : display(value);
const friendlyStates = Object.freeze({ submitIntrest: 'Awaiting issuer review', verifiedByIssuer: 'Issuer verified', claimSubmitted: 'Claim submitted', notStarted: 'Not started' });
export const formatStatus = (value) => friendlyStates[value] || String(value || 'Unknown').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ');
export const capitalizeStatusOption = (value) => {
  const label = formatStatus(value);
  return label.charAt(0).toUpperCase() + label.slice(1);
};

export function StateChip({ value, label }) {
  const status = String(value || '').toLowerCase();
  // Distinguish completed, in-progress, unstarted, and unsuccessful stages.
  // This is presentation-only; the original status is still used for filtering.
  const good = ['approved', 'registered', 'verified', 'created', 'confirmed', 'active', 'unlocked', 'deployed'];
  const bad = ['rejected', 'failed', 'cancelled', 'orphaned', 'inactive'];
  const inProgress = ['submitted', 'claimsubmitted', 'verifiedbyissuer', 'deploying', 'creating'];
  const attention = ['draft', 'pending', 'locked', 'submitintrest'];
  const color = good.includes(status) ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : bad.includes(status) ? 'border-rose-200 bg-rose-50 text-rose-700'
      : inProgress.includes(status) ? 'border-blue-200 bg-blue-50 text-blue-700'
        : attention.includes(status) ? 'border-amber-200 bg-amber-50 text-amber-700'
          : 'border-slate-200 bg-slate-50 text-slate-600';
  return <span className={`inline-flex max-w-full items-center rounded-lg border px-2.5 py-1 text-xs font-semibold ${color}`}>{label ?? formatStatus(value)}</span>;
}

export function AdminListIntro({ eyebrow, title, description }) {
  return <header className="min-w-0"><p className="mb-2 text-[11px] font-semibold tracking-[0.16em] text-blue-600 uppercase">{eyebrow}</p><h2 className="m-0 text-3xl font-semibold tracking-normal text-slate-950 sm:text-4xl">{title}</h2><p className="mt-3 mb-0 max-w-4xl text-sm leading-6 text-slate-500">{description}</p></header>;
}

export function ListTools({ search, onSearch, status, onStatus, statuses = [], chainUid, onChain, chains = [], extra, onRefresh, refreshing, onClear, hasFilters = false, hasFooterNote = false }) {
  return <div className={`flex flex-col gap-3 ${hasFooterNote ? "mb-4 border-b border-slate-100 pb-4" : ""}`}>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(200px,2fr)_minmax(155px,1fr)_minmax(180px,1fr)_auto]">
      <label className="relative block min-w-0"><span className="sr-only">Search records</span><Search className="absolute left-3 top-3.5 size-4 text-slate-400"/><input className={`${fieldStyle} pl-9`} value={search} maxLength={100} onChange={(event) => onSearch(event.target.value)} placeholder="Search name, email or address" /></label>
      <MarketplaceDropdown
        className={`admin-monitor-filter ${status !== 'all' ? 'admin-monitor-filter--selected' : ''}`}
        menuClassName="admin-monitor-filter__menu"
        ariaLabel="Filter by status"
        placeholder="All statuses"
        icon={ListFilter}
        portal
        value={status}
        onChange={onStatus}
        options={[{ value: 'all', label: 'All statuses' }, ...statuses.map((option) => ({ ...option, label: capitalizeStatusOption(option.label ?? option.value) }))]}
      />
      <MarketplaceDropdown
        className={`admin-monitor-filter ${chainUid ? 'admin-monitor-filter--selected' : ''}`}
        menuClassName="admin-monitor-filter__menu"
        ariaLabel="Filter by network"
        placeholder="All networks"
        icon={Globe2}
        portal
        value={chainUid}
        onChange={onChain}
        options={[{ value: '', label: 'All networks' }, ...chains.map((chain) => ({
          value: chain.chainUid,
          label: chain.chainName || chain.chainCode || chain.chainUid,
          description: chain.chainId ? `Chain ID ${chain.chainId}` : undefined,
        }))]}
      />
      <div className="flex min-w-0 flex-wrap items-center justify-end gap-2 sm:col-span-1 xl:col-span-1">
        <button type="button" onClick={onClear} disabled={!hasFilters} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none"><X className="size-4" aria-hidden="true"/>Clear filters</button>
        <button type="button" onClick={onRefresh} disabled={refreshing} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 disabled:opacity-50 sm:flex-none"><RefreshCcw className={`size-4 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true"/>Refresh</button>
      </div>
    </div>{extra}
  </div>;
}

export function MonitoringPagination({ pagination, onChange, pending }) {
  if (!pagination) return null;
  const { page, limit, total, totalPages } = pagination;
  const start = total ? (page - 1) * limit + 1 : 0;
  const end = Math.min(page * limit, total);
  const firstPage = Math.max(1, Math.min(page - 2, Math.max(1, totalPages - 4)));
  const visiblePages = Array.from({ length: Math.min(totalPages, 5) }, (_, i) => firstPage + i);
  const buttonClass = 'inline-flex h-10 min-w-10 shrink-0 items-center justify-center rounded-xl border text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-40';
  return <div className="mt-5 flex min-w-0 flex-col gap-3 border-t border-slate-100 pt-4 lg:flex-row lg:items-center lg:justify-between">
    <p className="m-0 text-center text-xs leading-5 text-slate-500 lg:text-left" aria-live="polite">
      Showing {start}–{end} of {total} records <span className="mx-1 text-slate-300">·</span> Page {page} of {totalPages || 1}
    </p>
    <nav aria-label="Results pages" className="flex max-w-full flex-wrap items-center justify-center gap-1.5 sm:gap-2 lg:justify-end">
      <button type="button" aria-label="Previous page" disabled={pending || page <= 1} onClick={() => onChange(page - 1)} className={`${buttonClass} gap-1 border-slate-200 bg-white px-2.5 text-slate-700 shadow-sm hover:border-slate-300 hover:bg-slate-50 sm:px-3`}>
        <ChevronLeft className="size-4" aria-hidden="true"/><span className="hidden sm:inline">Previous</span>
      </button>
      {visiblePages.map((p) => <button
        key={p} type="button" aria-label={`Page ${p}`} aria-current={p === page ? 'page' : undefined}
        disabled={pending} onClick={() => onChange(p)}
        className={`admin-monitor-pagination__page ${buttonClass} ${Math.abs(p - page) > 1 ? 'hidden sm:inline-flex' : ''} ${p === page ? 'border-slate-900 bg-slate-900 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-700 shadow-sm hover:border-slate-300 hover:bg-slate-50'}`}
      >{p}</button>)}
      <button type="button" aria-label="Next page" disabled={pending || page >= totalPages} onClick={() => onChange(page + 1)} className={`${buttonClass} gap-1 border-slate-200 bg-white px-2.5 text-slate-700 shadow-sm hover:border-slate-300 hover:bg-slate-50 sm:px-3`}>
        <span className="hidden sm:inline">Next</span><ChevronRight className="size-4" aria-hidden="true"/>
      </button>
    </nav>
  </div>;
}

export function MonitoringTable({ columns, items, loading, error, onRetry, emptyText = 'No matching records found.', pagination, onPageChange, pending }) {
  return <AdminPanel bodyClassName="p-3 sm:p-5">
    {error ? <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">Could not load records: {getErrorMessage(error)} <button type="button" onClick={onRetry} className="ml-2 underline">Try again</button></div> : loading ? <div aria-busy="true" className="space-y-3 p-4">{[1,2,3,4].map((i) => <div key={i} className="h-12 animate-pulse rounded-lg bg-slate-100"/>)}</div> : items.length ? <div className="w-full overflow-x-auto rounded-xl border border-slate-200"><table className="admin-data-table w-full min-w-[750px] border-collapse text-left text-sm"><thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500"><tr>{columns.map((col) => <th scope="col" aria-sort={col.sortDirection ? (col.sortDirection === 'asc' ? 'ascending' : 'descending') : undefined} className="whitespace-nowrap px-4 py-3" key={col.key}>{col.title}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{items.map((row, index) => <tr className="hover:bg-slate-50/70" key={row.userUid || row.interestUid || row.tokenUid || row.chainUid || index}>{columns.map((col) => <td key={col.key} className="px-4 py-3 align-middle text-slate-700">{col.render(row)}</td>)}</tr>)}</tbody></table></div> : <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-12 text-center text-sm text-slate-500">{emptyText}</div>}
    {!error && <MonitoringPagination pagination={pagination} onChange={onPageChange} pending={pending} />}
  </AdminPanel>;
}
