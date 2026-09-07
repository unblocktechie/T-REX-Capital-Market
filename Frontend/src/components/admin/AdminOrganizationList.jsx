import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowDownAZ,
  ArrowUpAZ,
  Check,
  ChevronDown,
  Eye,
  RotateCcw,
  Search,
  WalletCards,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { ROUTES } from '@/config/routes';
import { formatAdminDate, shortWallet } from '@/utils/adminFormat';
import { cn } from '@/utils/cn';
import { AdminStatusBadge } from './AdminBadges';

const statusOptions = [
  ['all', 'All statuses'],
  ['submitted', 'Submitted'],
  ['resubmitted', 'Resubmitted'],
  ['approved', 'Approved'],
  ['rejected', 'Rejected'],
];

export function AdminOrganizationList({
  organizations = [],
  filters,
  onSearchChange,
  onStatusChange,
  onWalletSearchChange,
  onSortDirectionChange,
  onResetFilters,
  onRowClick,
}) {
  const hasControls = Boolean(filters && onSearchChange && onStatusChange && onWalletSearchChange && onSortDirectionChange);

  return (
    <div role="table" aria-label="Organization review queue" className="min-w-0">
      {hasControls ? (
        <>
          <DesktopColumnFilters
            filters={filters}
            onSearchChange={onSearchChange}
            onStatusChange={onStatusChange}
            onWalletSearchChange={onWalletSearchChange}
            onSortDirectionChange={onSortDirectionChange}
            onResetFilters={onResetFilters}
          />
          <MobileListFilters
            filters={filters}
            onSearchChange={onSearchChange}
            onStatusChange={onStatusChange}
            onWalletSearchChange={onWalletSearchChange}
            onSortDirectionChange={onSortDirectionChange}
            onResetFilters={onResetFilters}
          />
        </>
      ) : (
        <div role="row" className="hidden grid-cols-[minmax(250px,1.55fr)_150px_165px_minmax(190px,1fr)_72px] items-center gap-4 border-b border-slate-200 px-4 pb-3 text-[10px] font-semibold tracking-[0.14em] text-slate-400 uppercase xl:grid">
          {['Organization', 'Submitted', 'Status', 'Organization wallet', 'View'].map((label) => (
            <span key={label} className={label === 'View' ? 'text-center' : ''}>{label}</span>
          ))}
        </div>
      )}

      <div className="space-y-3 pt-3">
        {organizations.map((organization, index) => (
          <OrganizationRow
            key={organization.id}
            organization={organization}
            index={index}
            onRowClick={onRowClick}
          />
        ))}
      </div>
    </div>
  );
}

function DesktopColumnFilters({ filters, onSearchChange, onStatusChange, onWalletSearchChange, onSortDirectionChange, onResetFilters }) {
  const sortAscending = filters.sortDirection === 'asc';
  return (
    <div role="row" className="hidden grid-cols-[minmax(250px,1.55fr)_150px_165px_minmax(190px,1fr)_72px] items-end gap-4 border-b border-slate-200 px-4 pb-4 xl:grid">
      <div className="min-w-0">
        <ColumnLabel>Organization</ColumnLabel>
        <label className="mt-2 flex min-h-11 min-w-0 items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3.5 transition focus-within:border-blue-300 focus-within:bg-white focus-within:ring-4 focus-within:ring-blue-500/10">
          <Search className="size-4 shrink-0 text-slate-400" />
          <input
            value={filters.search}
            onChange={(event) => onSearchChange(event.target.value)}
            type="search"
            aria-label="Search organizations on this page"
            placeholder="Name or registration number"
            className="min-w-0 flex-1 border-0 bg-transparent text-sm font-medium text-slate-800 outline-none placeholder:text-slate-400"
          />
        </label>
      </div>

      <div>
        <ColumnLabel>Submitted</ColumnLabel>
        <button
          type="button"
          onClick={() => onSortDirectionChange(sortAscending ? 'desc' : 'asc')}
          className="mt-2 inline-flex min-h-11 w-full items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white px-3.5 text-sm font-medium text-slate-700 transition hover:border-blue-200 hover:bg-blue-50/50"
          aria-label={`Sort by submitted date ${sortAscending ? 'newest first' : 'oldest first'}`}
        >
          <span>{sortAscending ? 'Oldest first' : 'Newest first'}</span>
          {sortAscending ? <ArrowDownAZ className="size-4 text-blue-600" /> : <ArrowUpAZ className="size-4 text-blue-600" />}
        </button>
      </div>

      <div>
        <ColumnLabel>Status</ColumnLabel>
        <StatusFilterDropdown
          value={filters.status}
          onChange={onStatusChange}
          className="mt-2"
        />
      </div>

      <div className="min-w-0">
        <ColumnLabel>Organization wallet</ColumnLabel>
        <label className="mt-2 flex min-h-11 min-w-0 items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3.5 transition focus-within:border-blue-300 focus-within:bg-white focus-within:ring-4 focus-within:ring-blue-500/10">
          <WalletCards className="size-4 shrink-0 text-slate-400" />
          <input
            value={filters.walletSearch}
            onChange={(event) => onWalletSearchChange(event.target.value)}
            type="search"
            aria-label="Filter organizations by wallet address"
            placeholder="Filter wallet address"
            className="min-w-0 flex-1 border-0 bg-transparent font-mono text-xs font-medium text-slate-800 outline-none placeholder:font-sans placeholder:text-slate-400"
          />
        </label>
      </div>

      <div className="text-center">
        <ColumnLabel>Reset</ColumnLabel>
        <button
          type="button"
          onClick={onResetFilters}
          disabled={!filters.search && !filters.walletSearch && filters.status === 'all' && filters.sortDirection === 'desc'}
          className="mx-auto mt-2 grid size-11 place-items-center rounded-2xl border border-slate-200 bg-white text-slate-500 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-35"
          aria-label="Reset organization filters"
          title="Reset filters"
        >
          <RotateCcw className="size-4" />
        </button>
      </div>
    </div>
  );
}

function MobileListFilters({ filters, onSearchChange, onStatusChange, onWalletSearchChange, onSortDirectionChange, onResetFilters }) {
  return (
    <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 xl:hidden">
      <label className="flex min-h-11 min-w-0 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3.5">
        <Search className="size-4 shrink-0 text-slate-400" />
        <input
          value={filters.search}
          onChange={(event) => onSearchChange(event.target.value)}
          type="search"
          aria-label="Search organizations on this page"
          placeholder="Search name or registration number"
          className="min-w-0 flex-1 bg-transparent text-sm font-medium text-slate-800 outline-none placeholder:text-slate-400"
        />
      </label>

      <label className="flex min-h-11 min-w-0 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3.5">
        <WalletCards className="size-4 shrink-0 text-slate-400" />
        <input
          value={filters.walletSearch}
          onChange={(event) => onWalletSearchChange(event.target.value)}
          type="search"
          aria-label="Filter organizations by wallet address"
          placeholder="Filter wallet address"
          className="min-w-0 flex-1 bg-transparent font-mono text-sm font-medium text-slate-800 outline-none placeholder:font-sans placeholder:text-slate-400"
        />
      </label>

      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <StatusFilterDropdown value={filters.status} onChange={onStatusChange} />
        <button
          type="button"
          onClick={() => onSortDirectionChange(filters.sortDirection === 'asc' ? 'desc' : 'asc')}
          className="inline-flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700"
        >
          {filters.sortDirection === 'asc' ? <ArrowDownAZ className="size-4 text-blue-600" /> : <ArrowUpAZ className="size-4 text-blue-600" />}
          <span className="truncate">{filters.sortDirection === 'asc' ? 'Oldest first' : 'Newest first'}</span>
        </button>
      </div>

      <button
        type="button"
        onClick={onResetFilters}
        disabled={!filters.search && !filters.walletSearch && filters.status === 'all' && filters.sortDirection === 'desc'}
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 disabled:opacity-35"
        aria-label="Reset organization filters"
      >
        <RotateCcw className="size-4" />
        Reset filters
      </button>
    </div>
  );
}

function StatusFilterDropdown({ value, onChange, className = '' }) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);

  useEffect(() => {
    const close = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);

  const active = statusOptions.find(([optionValue]) => optionValue === value)?.[1] || 'All statuses';

  return (
    <div ref={wrapperRef} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="inline-flex min-h-11 w-full items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white px-3.5 text-sm font-medium text-slate-700 transition hover:border-blue-200 hover:bg-blue-50/50"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="truncate">{active}</span>
        <ChevronDown className={cn('size-4 shrink-0 text-slate-400 transition-transform', open && 'rotate-180')} />
      </button>

      {open ? (
        <div className="absolute top-[calc(100%+8px)] left-0 z-20 w-full overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-[0_18px_40px_rgba(15,23,42,0.12)]" role="listbox" aria-label="Filter organizations by status">
          {statusOptions.map(([optionValue, label]) => {
            const selected = optionValue === value;
            return (
              <button
                key={optionValue}
                type="button"
                onClick={() => {
                  onChange(optionValue);
                  setOpen(false);
                }}
                className={cn(
                  'flex min-h-10 w-full items-center justify-between gap-3 rounded-xl px-3 text-left text-sm transition',
                  selected ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-50',
                )}
                role="option"
                aria-selected={selected}
              >
                <span>{label}</span>
                {selected ? <Check className="size-4 shrink-0" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function OrganizationRow({ organization, index, onRowClick }) {
  const detailPath = ROUTES.adminOrganizationReview(organization.id);
  const walletValue = organization.wallet?.address ? shortWallet(organization.wallet.address, 10, 8) : 'Not provided';

  return (
    <motion.article
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, delay: Math.min(index * 0.035, 0.2) }}
      role="row"
      onClick={() => onRowClick?.(organization)}
      className="group relative cursor-pointer rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-lg hover:shadow-slate-200/50 xl:grid xl:grid-cols-[minmax(250px,1.55fr)_150px_165px_minmax(190px,1fr)_72px] xl:items-center xl:gap-4"
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-slate-950 to-slate-700 text-xs font-semibold text-white shadow-sm">{organization.logo}</span>
        <div className="min-w-0">
          <Link to={detailPath} onClick={(event) => event.stopPropagation()} className="block truncate text-sm font-semibold text-slate-950 hover:text-blue-600">{organization.name}</Link>
          <span className="mt-1 block truncate text-xs font-medium text-slate-500">{organization.registrationNumber || 'Registration number not provided'}</span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:contents">
        <Detail label="Submitted" value={formatAdminDate(organization.submittedAt, { month: 'short', day: 'numeric' })} />
        <div>
          <span className="mb-1 block text-[10px] font-semibold tracking-wide text-slate-400 uppercase xl:hidden">Status</span>
          <AdminStatusBadge status={organization.status} compact />
        </div>
        <div className="min-w-0 sm:col-span-1">
          <span className="mb-1 block text-[10px] font-semibold tracking-wide text-slate-400 uppercase xl:hidden">Organization wallet</span>
          <span
            className={cn(
              'inline-flex max-w-full items-start gap-2 rounded-2xl px-3 py-2 font-mono text-xs font-semibold leading-5',
              organization.wallet?.address ? 'bg-slate-100 text-slate-700' : 'bg-amber-50 text-amber-700',
            )}
            title={organization.wallet?.address || 'Wallet not provided'}
          >
            <WalletCards className="mt-0.5 size-3.5 shrink-0" />
            {organization.wallet?.address ? (
              <>
                <span className="break-all xl:hidden">{organization.wallet.address}</span>
                <span className="hidden xl:inline">{walletValue}</span>
              </>
            ) : <span>{walletValue}</span>}
          </span>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-end border-t border-slate-100 pt-4 xl:mt-0 xl:border-0 xl:pt-0">
        <Link
          to={detailPath}
          onClick={(event) => event.stopPropagation()}
          className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 text-xs font-semibold text-blue-700 transition hover:border-blue-300 hover:bg-blue-100 sm:w-auto xl:grid xl:size-10 xl:min-h-0 xl:place-items-center xl:p-0"
          aria-label={`View ${organization.name}`}
          title="View organization"
        >
          <Eye className="size-[18px]" />
          <span className="xl:sr-only">View organization</span>
        </Link>
      </div>
    </motion.article>
  );
}

function ColumnLabel({ children }) {
  return <span className="block text-[10px] font-semibold tracking-[0.14em] text-slate-400 uppercase">{children}</span>;
}

function Detail({ label, value }) {
  return <div className="min-w-0"><span className="mb-1 block text-[10px] font-semibold tracking-wide text-slate-400 uppercase xl:hidden">{label}</span><span className="block truncate text-xs font-medium text-slate-700">{value}</span></div>;
}
