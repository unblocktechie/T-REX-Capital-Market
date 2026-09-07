import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileClock, Search } from 'lucide-react';
import { adminApi } from '@/api/admin';
import { AdminPanel } from '@/components/admin/AdminPanel';
import { useDebounce } from '@/hooks/useDebounce';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { formatAdminDateTime } from '@/utils/adminFormat';

export default function AdminAuditLogsPage() {
  useDocumentTitle('Audit Logs');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const logs = useQuery({ queryKey: ['admin', 'audit-logs', debouncedSearch], queryFn: () => adminApi.listAuditLogs({ page: 1, pageSize: 30, search: debouncedSearch }) });
  return (
    <div className="space-y-6"><header><p className="mb-2 text-[11px] font-semibold tracking-[0.16em] text-blue-600 uppercase dark:text-blue-400">Audit and governance</p><h2 className="m-0 text-3xl font-semibold tracking-normal text-slate-950 sm:text-4xl dark:text-white">Audit Logs</h2><p className="mt-3 mb-0 text-sm leading-6 text-slate-500 dark:text-slate-400">Search administrative decisions and compliance workflow events.</p></header>
      <AdminPanel bodyClassName="p-4 sm:p-5"><label className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 dark:border-slate-800 dark:bg-slate-950/70"><Search className="size-4 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm outline-none dark:text-white" placeholder="Search action, organization, or actor…" /></label></AdminPanel>
      <AdminPanel title="Compliance event stream" description={`${logs.data?.meta?.total || 0} immutable events`} action={<FileClock className="size-5 text-slate-400" />} bodyClassName="p-3 sm:p-4"><div className="space-y-3">{logs.isLoading ? Array.from({length:6}).map((_,i)=><div key={i} className="h-20 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />) : (logs.data?.items || []).map((log)=><article key={log.id} className="grid gap-3 rounded-2xl border border-slate-200 p-4 transition hover:border-blue-200 md:grid-cols-[minmax(0,1fr)_180px_150px] md:items-center dark:border-slate-800 dark:hover:border-blue-500/30"><div className="min-w-0"><strong className="block text-sm text-slate-950 dark:text-white">{log.action}</strong><p className="mt-1 mb-0 text-xs leading-5 text-slate-500">{log.organizationName} · {log.description}</p></div><div><span className="block text-[10px] font-bold text-slate-400 uppercase">Actor</span><strong className="mt-1 block text-xs text-slate-700 dark:text-slate-300">{log.actor}</strong></div><div className="md:text-right"><time className="text-xs font-semibold text-slate-500">{formatAdminDateTime(log.at)}</time><small className="mt-1 block text-[10px] text-slate-400">{log.ipAddress}</small></div></article>)}</div></AdminPanel>
    </div>
  );
}
