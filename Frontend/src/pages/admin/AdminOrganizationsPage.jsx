import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Building2, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { adminApi } from '@/api/admin';
import { AdminOrganizationList } from '@/components/admin/AdminOrganizationList';
import { AdminPanel } from '@/components/admin/AdminPanel';
import { ReviewQueueSkeleton } from '@/components/admin/AdminSkeletons';
import { ROUTES } from '@/config/routes';
import { useDebounce } from '@/hooks/useDebounce';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

const initialFilters = { search: '', walletSearch: '', status: 'all', sortDirection: 'desc' };

export default function AdminOrganizationsPage() {
  useDocumentTitle('Organizations');
  const navigate = useNavigate();
  const [filters, setFilters] = useState(initialFilters);
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounce(filters.search, 250);
  const debouncedWalletSearch = useDebounce(filters.walletSearch, 250);
  const params = useMemo(
    () => ({
      page,
      pageSize: 20,
      status: filters.status,
      sortBy: 'submittedAt',
      sortDirection: filters.sortDirection,
    }),
    [page, filters.status, filters.sortDirection],
  );
  const query = useQuery({
    queryKey: ['admin', 'organizations', 'directory', params],
    queryFn: () => adminApi.listOrganizations(params),
    placeholderData: (previous) => previous,
  });

  const visibleOrganizations = useMemo(() => {
    const term = debouncedSearch.trim().toLowerCase();
    const walletTerm = debouncedWalletSearch.trim().toLowerCase();
    const rows = query.data?.items || [];
    return rows.filter((organization) => {
      const matchesOrganization = !term || [organization.name, organization.registrationNumber]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
      const matchesWallet = !walletTerm || String(organization.wallet?.address || '')
        .toLowerCase()
        .includes(walletTerm);
      return matchesOrganization && matchesWallet;
    });
  }, [query.data?.items, debouncedSearch, debouncedWalletSearch]);

  const updateFilter = (key, value) => {
    setFilters((current) => ({ ...current, [key]: value }));
    if (key !== 'search') setPage(1);
  };

  const resetFilters = () => {
    setFilters(initialFilters);
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <header>
        <p className="mb-2 text-[11px] font-semibold tracking-[0.16em] text-blue-600 uppercase">Organization directory</p>
        <h2 className="m-0 text-3xl font-semibold tracking-normal text-slate-950 sm:text-4xl">All Organizations</h2>
        <p className="mt-3 mb-0 text-sm leading-6 text-slate-500 sm:text-base">Browse submitted, resubmitted, approved, and rejected issuer organizations returned by the admin API.</p>
      </header>

      <AdminPanel
        title="Organization directory"
        description={`${query.data?.meta?.total || 0} organizations returned by the backend.`}
        action={<span className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700"><Building2 className="size-3.5" />Issuer entities</span>}
        bodyClassName="p-3 sm:p-4"
      >
        {query.isLoading ? (
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
        <Pagination meta={query.data?.meta} onPageChange={setPage} />
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
