import { Mail, ShieldCheck, UserRound } from 'lucide-react';
import { AdminPanel } from '@/components/admin/AdminPanel';
import { useAuth } from '@/hooks/useAuth';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

export default function AdminProfilePage() {
  useDocumentTitle('Admin Profile');
  const { user } = useAuth();
  const initials = (user?.name || 'Admin User').split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div className="space-y-6">
      <header><p className="mb-2 text-[11px] font-semibold tracking-[0.16em] text-blue-600 uppercase dark:text-blue-400">Administrator identity</p><h2 className="m-0 text-3xl font-semibold tracking-normal text-slate-950 sm:text-4xl dark:text-white">Profile</h2><p className="mt-3 mb-0 text-sm leading-6 text-slate-500 dark:text-slate-400">Review your compliance administrator account and security role.</p></header>
      <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <AdminPanel>
          <div className="text-center"><span className="mx-auto grid size-20 place-items-center rounded-[24px] bg-slate-950 text-xl font-semibold text-white dark:bg-white dark:text-slate-950">{initials}</span><h3 className="mt-4 mb-1 text-xl font-semibold text-slate-950 dark:text-white">{user?.name}</h3><p className="m-0 text-sm text-slate-500">{user?.email}</p><span className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 dark:bg-blue-500/10 dark:text-blue-300"><ShieldCheck className="size-3.5" />Compliance Admin</span></div>
        </AdminPanel>
        <AdminPanel title="Profile details" description="These account details are read-only.">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-bold text-slate-700 dark:text-slate-300">
              Full name
              <div className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 dark:border-slate-800 dark:bg-slate-950/60">
                <UserRound className="size-4 text-slate-400" />
                <input
                  value={user?.name || ''}
                  readOnly
                  aria-readonly="true"
                  className="min-w-0 flex-1 cursor-default bg-transparent text-sm text-slate-600 outline-none dark:text-slate-300"
                />
              </div>
            </label>
            <label className="grid gap-2 text-sm font-bold text-slate-700 dark:text-slate-300">
              Email address
              <div className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 dark:border-slate-800 dark:bg-slate-950/60">
                <Mail className="size-4 text-slate-400" />
                <input
                  value={user?.email || ''}
                  readOnly
                  aria-readonly="true"
                  className="min-w-0 flex-1 cursor-default bg-transparent text-sm text-slate-500 outline-none dark:text-slate-400"
                />
              </div>
            </label>
          </div>
        </AdminPanel>
      </div>
    </div>
  );
}
