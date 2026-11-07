import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { adminApi } from '@/api/admin';
import { AdminOrganizationList, OrganizationFilters } from '@/components/admin/AdminOrganizationList';
import { MonitoringPagination } from '@/components/admin/AdminMonitoringParts';
import { AdminPanel } from '@/components/admin/AdminPanel';
import { ReviewQueueSkeleton } from '@/components/admin/AdminSkeletons';
import { ROUTES } from '@/config/routes';
import { useDebounce } from '@/hooks/useDebounce';
import { filterOrganizationsByQuery } from '@/utils/adminOrganizationSearch';
import { sortAdminOrganizationsPage } from '@/utils/adminOrganizationSort';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

const initialFilters = { search: '', status: 'all', sortBy: 'submittedAt', sortDirection: 'desc' };

export default function AdminOrganizationsPage() {
  useDocumentTitle('Organizations');
  const navigate = useNavigate();
  const location = useLocation();
  const [filters, setFilters] = useState(initialFilters);
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounce(filters.search, 250);
  const params = useMemo(
    () => ({
      page,
      pageSize: 20,
      status: filters.status,
      sortBy: 'submittedAt',
      // The API only supports date sorting. Other fields are sorted on the loaded page.
      sortDirection: filters.sortBy === 'submittedAt' ? filters.sortDirection : 'desc',
    }),
    [page, filters.status, filters.sortBy, filters.sortDirection],
  );
  const query = useQuery({
    queryKey: ['admin', 'organizations', 'directory', params],
    queryFn: () => adminApi.listOrganizations(params),
    placeholderData: (previous) => previous,
  });

  const visibleOrganizations = useMemo(
    () => sortAdminOrganizationsPage(
      filterOrganizationsByQuery(query.data?.items || [], debouncedSearch),
      filters.sortBy,
      filters.sortDirection,
    ),
    [query.data?.items, debouncedSearch, filters.sortBy, filters.sortDirection],
  );

  const updateFilter = (key, value) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  };

  const changeSort = (column) => {
    setFilters((current) => ({
      ...current,
      sortBy: column,
      sortDirection: current.sortBy === column
        ? (current.sortDirection === 'asc' ? 'desc' : 'asc')
        : (column === 'submittedAt' ? 'desc' : 'asc'),
    }));
    setPage(1);
  };

  const resetFilters = () => {
    setFilters(initialFilters);
    setPage(1);
  };
  const meta = query.data?.meta;
  const pagination = meta ? { page: meta.page, limit: meta.pageSize, total: meta.total, totalPages: meta.totalPages } : null;

  return (
    <div className="space-y-6">
      <header>
        <p className="mb-2 text-[11px] font-semibold tracking-[0.16em] text-blue-600 uppercase">Organization directory</p>
        <h2 className="m-0 text-3xl font-semibold tracking-normal text-slate-950 sm:text-4xl">All Organizations</h2>
        <p className="mt-3 mb-0 text-sm leading-6 text-slate-500 sm:text-base">Browse submitted, resubmitted, approved, and rejected issuer organizations returned by the admin API.</p>
      </header>

      <AdminPanel bodyClassName="p-4 sm:p-5">
        <OrganizationFilters
          filters={filters}
          onSearchChange={(value) => updateFilter('search', value)}
          onStatusChange={(value) => updateFilter('status', value)}
          onResetFilters={resetFilters}
          onRefresh={() => query.refetch()}
          refreshing={query.isFetching}
        />
      </AdminPanel>

      <AdminPanel bodyClassName="p-3 sm:p-5">
        {query.isLoading ? (
          <ReviewQueueSkeleton />
        ) : query.isError ? (
          <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">
            Could not load organizations. <button type="button" className="font-semibold underline" onClick={() => query.refetch()}>Try again</button>
          </div>
        ) : (
          <>
            <AdminOrganizationList
              organizations={visibleOrganizations}
              filters={filters}
              onSortChange={changeSort}
              onRowClick={(organization) => navigate(ROUTES.adminOrganizationReview(organization.id), { state: { from: location.pathname } })}
            />

            {!visibleOrganizations.length ? (
              <div className="mt-4 grid min-h-64 place-items-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
                <div>
                  <Search className="mx-auto size-6 text-slate-400" />
                  <h3 className="mt-3 mb-1 text-base font-semibold text-slate-950">No organizations match</h3>
                  <p className="m-0 text-sm text-slate-500">Change the status filter or clear the current-page search.</p>
                  <button type="button" onClick={resetFilters} className="mt-4 min-h-10 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white">Reset filters</button>
                </div>
              </div>
            ) : null}
          </>
        )}
        {!query.isError && <MonitoringPagination pagination={pagination} onChange={setPage} pending={query.isFetching} />}
      </AdminPanel>
    </div>
  );
}
