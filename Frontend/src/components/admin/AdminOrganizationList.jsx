import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ListFilter,
  RefreshCcw,
  Search,
  X,
} from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { MarketplaceDropdown } from '@/components/investor-marketplace/MarketplaceDropdown';
import { ROUTES } from '@/config/routes';
import { formatAdminDate } from '@/utils/adminFormat';
import { cn } from '@/utils/cn';
import { CompactAddress } from '@/components/common/CompactAddress';
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
  onSortChange,
  onResetFilters,
  onRowClick,
}) {
  const location = useLocation();
  const hasControls = Boolean(filters && onSortChange);
  // Keep the optional inline filters working for callers outside of the
  // organization pages. Those pages place their controls in a separate panel.
  const hasInlineFilters = Boolean(hasControls && onSearchChange && onStatusChange && onResetFilters);

  return (
    <div className="min-w-0">
      {hasInlineFilters ? (
        <OrganizationFilters
          filters={filters}
          onSearchChange={onSearchChange}
          onStatusChange={onStatusChange}
          onResetFilters={onResetFilters}
        />
      ) : null}

      <div className="w-full max-w-full overflow-x-auto rounded-xl border border-slate-200" role="region" aria-label="Organizations table" tabIndex={0}>
        <table className="admin-data-table w-full min-w-[930px] border-collapse text-left text-sm">
          <thead className="bg-slate-50 text-xs font-semibold tracking-wide text-slate-500 uppercase">
            <tr>
              <SortableOrganizationHeading label="Organization" field="name" filters={filters} onSortChange={onSortChange} />
              <SortableOrganizationHeading label="Submitted" field="submittedAt" filters={filters} onSortChange={onSortChange} />
              <SortableOrganizationHeading label="Status" field="status" filters={filters} onSortChange={onSortChange} />
              <th scope="col" className="px-4 py-3">Organization wallet</th>
              <th scope="col" className="whitespace-nowrap px-4 py-3">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {organizations.map((organization) => (
              <OrganizationRow key={organization.id} organization={organization} onRowClick={onRowClick} returnTo={location.pathname} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// One search covers organization name, registration number, and wallet address.
// Keeping filters outside the scrollable table makes them usable on narrow screens.
export function OrganizationFilters({ filters, onSearchChange, onStatusChange, onResetFilters, onRefresh, refreshing = false }) {
  const isDefault = !filters.search && filters.status === 'all' && filters.sortBy === 'submittedAt' && filters.sortDirection === 'desc';
  return (
    <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(240px,2fr)_minmax(170px,1fr)_auto]">
      <label className="flex min-h-11 min-w-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 transition focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 sm:col-span-2 xl:col-span-1">
        <Search className="size-4 shrink-0 text-slate-400" aria-hidden="true" />
        <input
          value={filters.search}
          onChange={(event) => onSearchChange(event.target.value)}
          type="search"
          aria-label="Search by organization name, registration number or wallet address on this page"
          placeholder="Search organization, registration number or wallet address"
          className="min-w-0 w-full flex-1 border-0 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
        />
      </label>

      <MarketplaceDropdown
        className={cn('admin-monitor-filter', filters.status !== 'all' && 'admin-monitor-filter--selected')}
        menuClassName="admin-monitor-filter__menu"
        ariaLabel="Filter organizations by status"
        placeholder="All statuses"
        icon={ListFilter}
        portal
        value={filters.status}
        onChange={onStatusChange}
        options={statusOptions.map(([value, label]) => ({ value, label }))}
      />

      <div className="flex min-w-0 flex-wrap items-center justify-end gap-2 sm:col-span-1 xl:col-span-1">
        <button
          type="button"
          onClick={onResetFilters}
          disabled={isDefault}
          className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none"
          aria-label="Clear organization filters and sorting"
        >
          <X className="size-4" aria-hidden="true" />Clear filters
        </button>
        {onRefresh ? (
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 disabled:opacity-50 sm:flex-none"
          >
            <RefreshCcw className={cn('size-4', refreshing && 'animate-spin')} aria-hidden="true" />Refresh
          </button>
        ) : null}
      </div>
    </div>
  );
}

function OrganizationRow({ organization, onRowClick, returnTo }) {
  const detailPath = ROUTES.adminOrganizationReview(organization.id);
  return (
    <tr
      onClick={() => onRowClick?.(organization)}
      className="group cursor-pointer bg-white transition-colors hover:bg-slate-50/70"
    >
      <td className="px-4 py-3 align-middle">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-slate-950 to-slate-700 text-xs font-semibold text-white">{organization.logo}</span>
          <div className="min-w-0">
            <Link to={detailPath} state={{ from: returnTo }} onClick={(event) => event.stopPropagation()} className="block max-w-[260px] truncate font-semibold text-slate-950 transition-colors hover:text-blue-700 hover:underline" title={organization.name}>{organization.name}</Link>
            <span className="mt-1 block text-xs text-slate-500">{organization.registrationNumber || 'Registration number not provided'}</span>
          </div>
        </div>
      </td>
      <td className="whitespace-nowrap px-4 py-3 align-middle text-xs text-slate-700">
        {formatAdminDate(organization.submittedAt, { month: 'short', day: 'numeric' })}
      </td>
      <td className="px-4 py-3 align-middle"><AdminStatusBadge status={organization.status} compact /></td>
      <td className="px-4 py-3 align-middle">
        {organization.wallet?.address ? (
          <span onClick={(event) => event.stopPropagation()} className="inline-flex max-w-full items-center rounded-lg bg-slate-100 px-2 py-1" title={organization.wallet.address}>
            <CompactAddress value={organization.wallet.address} label="Organization wallet address" leading={10} trailing={8} />
          </span>
        ) : <span className="text-xs text-slate-500">Not provided</span>}
      </td>
      <td className="whitespace-nowrap px-4 py-3 align-middle">
        <Link
          to={detailPath}
          state={{ from: returnTo }}
          onClick={(event) => event.stopPropagation()}
          className="inline-flex min-h-10 items-center font-semibold text-blue-700 transition-colors hover:text-blue-900 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >View organization →</Link>
      </td>
    </tr>
  );
}


// Match the existing Submitted sorter on every sortable heading.
// aria-sort is applied only to the active heading, so screen readers know
// which column determines the current ordering.
function SortableOrganizationHeading({ label, field, filters, onSortChange }) {
  const active = filters?.sortBy === field || (field === 'submittedAt' && !filters?.sortBy);
  const direction = filters?.sortDirection === 'asc' ? 'asc' : 'desc';
  const nextDirection = active ? (direction === 'asc' ? 'desc' : 'asc') : (field === 'submittedAt' ? 'desc' : 'asc');
  const description = field === 'submittedAt'
    ? (nextDirection === 'asc' ? 'oldest first' : 'newest first')
    : `${nextDirection === 'asc' ? 'A to Z' : 'Z to A'}`;

  return (
    <th
      scope="col"
      className="whitespace-nowrap px-4 py-3"
      aria-sort={onSortChange ? (active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none') : undefined}
    >
      {onSortChange ? (
        <button
          type="button"
          onClick={() => onSortChange(field)}
          aria-label={`Sort by ${label.toLowerCase()}: ${description}`}
          aria-pressed={active}
          title={`Sort ${label.toLowerCase()} ${description}`}
          className="inline-flex min-h-8 items-center gap-1.5 rounded-md text-left font-semibold text-slate-500 transition-colors hover:text-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
        >
          {label}
          {active ? (direction === 'asc' ? <ArrowUp className="size-3.5 text-blue-600" aria-hidden="true" /> : <ArrowDown className="size-3.5 text-blue-600" aria-hidden="true" />) : <ArrowUpDown className="size-3.5 text-slate-400" aria-hidden="true" />}
        </button>
      ) : label}
    </th>
  );
}
