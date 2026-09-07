import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ArrowRight, Building2, CheckCircle2, Clock3, XCircle } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { adminApi } from '@/api/admin';
import { AdminMetricCard } from '@/components/admin/AdminMetricCard';
import { AdminOrganizationList } from '@/components/admin/AdminOrganizationList';
import { AdminPanel } from '@/components/admin/AdminPanel';
import { ReviewQueueSkeleton } from '@/components/admin/AdminSkeletons';
import { AdminActivityTimeline } from '@/components/admin/AdminActivityTimeline';
import { ROUTES } from '@/config/routes';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

export default function AdminDashboardPage() {
  useDocumentTitle('Compliance Overview');
  const navigate = useNavigate();
  const overview = useQuery({ queryKey: ['admin', 'overview'], queryFn: adminApi.getOverview });
  const data = overview.data;
  const stats = data?.stats || { pending: 0, approved: 0, rejected: 0, total: 0 };

  return (
    <div className="space-y-6">
      <motion.header initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="mb-2 text-[11px] font-semibold tracking-[0.16em] text-blue-600 uppercase">Admin compliance workspace</p>
          <h2 className="m-0 text-3xl font-semibold tracking-normal text-slate-950 sm:text-4xl">Compliance Overview</h2>
          <p className="mt-3 mb-0 max-w-2xl text-sm leading-6 text-slate-500 sm:text-base">Review organization applications and record secure ERC-3643 approval decisions.</p>
        </div>
        <Link to={ROUTES.adminReviewQueue} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 text-sm font-semibold text-white shadow-lg shadow-slate-950/10 transition hover:bg-slate-800">Open review queue<ArrowRight className="size-4" /></Link>
      </motion.header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AdminMetricCard title="Submitted Reviews" value={stats.pending || stats.submitted || 0} subtitle="Waiting for a decision" icon={Clock3} tone="amber" />
        <AdminMetricCard title="Approved" value={stats.approved || stats.approvedToday || 0} subtitle="Approved organizations" icon={CheckCircle2} tone="emerald" delay={0.04} />
        <AdminMetricCard title="Rejected" value={stats.rejected || stats.rejectedToday || 0} subtitle="Rejected applications" icon={XCircle} tone="rose" delay={0.08} />
        <AdminMetricCard title="Total Organizations" value={stats.total || 0} subtitle="All backend records" icon={Building2} tone="blue" delay={0.12} />
      </div>

      <div className="grid gap-6 2xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.75fr)]">
        <AdminPanel title="Recent submitted organizations" description="Newest organizations waiting in the review workflow." action={<Link to={ROUTES.adminReviewQueue} className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600">View all<ArrowRight className="size-3.5" /></Link>} bodyClassName="p-3 sm:p-4">
          {overview.isLoading ? <ReviewQueueSkeleton /> : data?.queue?.length ? <AdminOrganizationList organizations={data.queue} onRowClick={(organization) => navigate(ROUTES.adminOrganizationReview(organization.id))} /> : <div className="grid min-h-44 place-items-center text-sm text-slate-500">No submitted organizations are waiting.</div>}
        </AdminPanel>

        <AdminPanel title="Review status" description="Organization counts from the admin API.">
          <div className="space-y-5">
            <StatusBar label="Submitted" value={data?.statusDistribution?.submitted || stats.pending || 0} total={stats.total} tone="amber" />
            <StatusBar label="Approved" value={data?.statusDistribution?.approved || stats.approved || 0} total={stats.total} tone="emerald" />
            <StatusBar label="Rejected" value={data?.statusDistribution?.rejected || stats.rejected || 0} total={stats.total} tone="rose" />
          </div>
        </AdminPanel>
      </div>

      <AdminPanel title="Recent application activity" description="Events derived from submitted organizations returned by the backend.">
        {overview.isLoading ? <div className="h-52 animate-pulse rounded-2xl bg-slate-100" /> : data?.activity?.length ? <AdminActivityTimeline items={data.activity} /> : <div className="grid min-h-36 place-items-center text-sm text-slate-500">No recent application activity.</div>}
      </AdminPanel>
    </div>
  );
}

function StatusBar({ label, value, total, tone }) {
  const percent = total ? Math.round((value / total) * 100) : 0;
  const colors = { emerald: 'bg-emerald-500', amber: 'bg-amber-500', rose: 'bg-rose-500' };
  return <div><div className="flex items-center justify-between gap-3"><span className="text-sm font-bold text-slate-700">{label}</span><span className="text-xs font-semibold text-slate-950">{value} · {percent}%</span></div><div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100"><motion.div initial={{ width: 0 }} animate={{ width: `${percent}%` }} transition={{ duration: 0.7 }} className={`h-full rounded-full ${colors[tone]}`} /></div></div>;
}
