import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Building2, CheckCircle2, Search, ShieldAlert, XCircle } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { adminApi } from '@/api/admin';
import { AdminMetricCard } from '@/components/admin/AdminMetricCard';
import { AdminOrganizationList, OrganizationFilters } from '@/components/admin/AdminOrganizationList';
import { MonitoringPagination } from '@/components/admin/AdminMonitoringParts';
import { AdminPanel } from '@/components/admin/AdminPanel';
import { ReviewQueueSkeleton } from '@/components/admin/AdminSkeletons';
import { useDebounce } from '@/hooks/useDebounce';
import { filterOrganizationsByQuery } from '@/utils/adminOrganizationSearch';
import { sortAdminOrganizationsPage } from '@/utils/adminOrganizationSort';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { ROUTES } from '@/config/routes';

const initialFilters = {
  search: '',
  status: 'all',
  sortBy: 'submittedAt',
  sortDirection: 'desc',
};

export default function ReviewQueuePage() {
  useDocumentTitle('Application Review Queue');
  const navigate = useNavigate();
  const location = useLocation();
  const [filters, setFilters] = useState(initialFilters);
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounce(filters.search, 250);

  const queryParams = useMemo(
    () => ({
      page,
      pageSize: 20,
      status: filters.status,
      sortBy: 'submittedAt',
      // The API only supports date sorting. Other fields are sorted on the loaded page.
      sortDirection: filters.sortBy === 'submittedAt' ? filters.sortDirection : 'desc',
    }),
    [filters.status, filters.sortBy, filters.sortDirection, page],
  );

  const overview = useQuery({
    queryKey: ['admin', 'overview'],
    queryFn: adminApi.getOverview,
  });

  const organizations = useQuery({
    queryKey: ['admin', 'organizations', 'review-queue', queryParams],
    queryFn: () => adminApi.listOrganizations(queryParams),
    placeholderData: (previous) => previous,
  });

  const visibleOrganizations = useMemo(
    () => sortAdminOrganizationsPage(
      filterOrganizationsByQuery(organizations.data?.items || [], debouncedSearch),
      filters.sortBy,
      filters.sortDirection,
    ),
    [organizations.data?.items, debouncedSearch, filters.sortBy, filters.sortDirection],
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

  const stats = overview.data?.stats || { pending: 0, approved: 0, rejected: 0, total: 0 };
  const meta = organizations.data?.meta;
  const pagination = meta ? { page: meta.page, limit: meta.pageSize, total: meta.total, totalPages: meta.totalPages } : null;

  return (
    <div className="space-y-6">
      <motion.header initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="max-w-3xl">
        <p className="mb-2 text-[11px] font-semibold tracking-[0.16em] text-blue-600 uppercase">ERC-3643 compliance operations</p>
        <h2 className="m-0 text-3xl font-semibold tracking-normal text-slate-950 sm:text-4xl">Application Review Queue</h2>
        <p className="mt-3 mb-0 text-sm leading-6 text-slate-500 sm:text-base">Review submitted, resubmitted, approved, and rejected organizations from one queue.</p>
      </motion.header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AdminMetricCard title="Submitted Reviews" value={stats.pending || stats.submitted || 0} subtitle="Waiting for an admin decision" icon={ShieldAlert} tone="amber" />
        <AdminMetricCard title="Approved" value={stats.approved || stats.approvedToday || 0} subtitle="Organizations approved" icon={CheckCircle2} tone="emerald" delay={0.04} />
        <AdminMetricCard title="Rejected" value={stats.rejected || stats.rejectedToday || 0} subtitle="Applications rejected" icon={XCircle} tone="rose" delay={0.08} />
        <AdminMetricCard title="Total Organizations" value={stats.total || 0} subtitle="Across all review statuses" icon={Building2} tone="blue" delay={0.12} />
      </div>

      <AdminPanel bodyClassName="p-4 sm:p-5">
        <OrganizationFilters
          filters={filters}
          onSearchChange={(value) => updateFilter('search', value)}
          onStatusChange={(value) => updateFilter('status', value)}
          onResetFilters={resetFilters}
          onRefresh={() => organizations.refetch()}
          refreshing={organizations.isFetching}
        />
      </AdminPanel>

      <AdminPanel bodyClassName="p-3 sm:p-5">
        {organizations.isLoading ? (
          <ReviewQueueSkeleton />
        ) : organizations.isError ? (
          <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">
            Could not load organizations. <button type="button" className="font-semibold underline" onClick={() => organizations.refetch()}>Try again</button>
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
              <div className="mt-4 grid min-h-72 place-items-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
                <div>
                  <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-white text-slate-500 shadow-sm"><Search className="size-5" /></span>
                  <h3 className="mt-4 mb-1 text-lg font-semibold text-slate-950">No organizations found</h3>
                  <p className="m-0 text-sm text-slate-500">No record matches the selected filter or current-page search.</p>
                  <button type="button" onClick={resetFilters} className="mt-4 min-h-10 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white">Reset filters</button>
                </div>
              </div>
            ) : null}
          </>
        )}
        {!organizations.isError && <MonitoringPagination pagination={pagination} onChange={setPage} pending={organizations.isFetching} />}
      </AdminPanel>
    </div>
  );
}
