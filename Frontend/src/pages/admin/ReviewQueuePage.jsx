import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Building2, CheckCircle2, ChevronLeft, ChevronRight, Search, ShieldAlert, UsersRound, XCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { adminApi } from '@/api/admin';
import { AdminMetricCard } from '@/components/admin/AdminMetricCard';
import { AdminOrganizationList } from '@/components/admin/AdminOrganizationList';
import { AdminPanel } from '@/components/admin/AdminPanel';
import { ReviewQueueSkeleton } from '@/components/admin/AdminSkeletons';
import { useDebounce } from '@/hooks/useDebounce';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { ROUTES } from '@/config/routes';

const initialFilters = {
  search: '',
  walletSearch: '',
  status: 'all',
  sortDirection: 'desc',
};

export default function ReviewQueuePage() {
  useDocumentTitle('Application Review Queue');
  const navigate = useNavigate();
  const [filters, setFilters] = useState(initialFilters);
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounce(filters.search, 250);
  const debouncedWalletSearch = useDebounce(filters.walletSearch, 250);

  const queryParams = useMemo(
    () => ({
      page,
      pageSize: 20,
      status: filters.status,
      sortBy: 'submittedAt',
      sortDirection: filters.sortDirection,
    }),
    [filters.status, filters.sortDirection, page],
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

  const visibleOrganizations = useMemo(() => {
    const term = debouncedSearch.trim().toLowerCase();
    const walletTerm = debouncedWalletSearch.trim().toLowerCase();
    const rows = organizations.data?.items || [];
    return rows.filter((organization) => {
      const matchesOrganization = !term || [organization.name, organization.registrationNumber]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
      const matchesWallet = !walletTerm || String(organization.wallet?.address || '')
        .toLowerCase()
        .includes(walletTerm);
      return matchesOrganization && matchesWallet;
    });
  }, [organizations.data?.items, debouncedSearch, debouncedWalletSearch]);

  const updateFilter = (key, value) => {
    setFilters((current) => ({ ...current, [key]: value }));
    if (key !== 'search') setPage(1);
  };

  const resetFilters = () => {
    setFilters(initialFilters);
    setPage(1);
  };

  const stats = overview.data?.stats || { pending: 0, approved: 0, rejected: 0, total: 0 };

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

      <AdminPanel
        title="Organization applications"
        description={`${organizations.data?.meta?.total || 0} organizations match the selected status.`}
        action={<span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600"><UsersRound className="size-3.5" />Secure review queue</span>}
        bodyClassName="p-3 sm:p-4"
      >
        {organizations.isLoading ? (
          <ReviewQueueSkeleton />
        ) : (
          <>
            <AdminOrganizationList
              organizations={visibleOrganizations}
              filters={filters}
              onSearchChange={(value) => updateFilter('search', value)}
              onStatusChange={(value) => updateFilter('status', value)}
              onWalletSearchChange={(value) => updateFilter('walletSearch', value)}
              onSortDirectionChange={(value) => updateFilter('sortDirection', value)}
              onResetFilters={resetFilters}
              onRowClick={(organization) => navigate(ROUTES.adminOrganizationReview(organization.id))}
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
        <Pagination meta={organizations.data?.meta} onPageChange={setPage} />
      </AdminPanel>
    </div>
  );
}

function Pagination({ meta, onPageChange }) {
  if (!meta || meta.totalPages <= 1) return null;
  return (
    <div className="mt-4 flex flex-col gap-3 border-t border-slate-200 px-1 pt-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="m-0 text-xs text-slate-500">Page <strong className="text-slate-800">{meta.page}</strong> of {meta.totalPages} · {meta.total} organizations</p>
      <div className="flex items-center gap-2">
        <button type="button" disabled={meta.page <= 1} onClick={() => onPageChange(meta.page - 1)} className="inline-flex min-h-9 items-center gap-1 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-600 disabled:opacity-40"><ChevronLeft className="size-4" />Previous</button>
        <button type="button" disabled={meta.page >= meta.totalPages} onClick={() => onPageChange(meta.page + 1)} className="inline-flex min-h-9 items-center gap-1 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-600 disabled:opacity-40">Next<ChevronRight className="size-4" /></button>
      </div>
    </div>
  );
}
