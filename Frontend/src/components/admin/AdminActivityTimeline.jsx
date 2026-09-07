import { CheckCircle2, CircleDot, Info, TriangleAlert, XCircle } from 'lucide-react';
import { formatAdminDateTime } from '@/utils/adminFormat';

const tones = {
  success: { icon: CheckCircle2, classes: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' },
  danger: { icon: XCircle, classes: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300' },
  warning: { icon: TriangleAlert, classes: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' },
  violet: { icon: CircleDot, classes: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300' },
  info: { icon: Info, classes: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300' },
};

export function AdminActivityTimeline({ items = [] }) {
  return (
    <ol className="relative space-y-0 before:absolute before:top-5 before:bottom-5 before:left-[18px] before:w-px before:bg-slate-200 dark:before:bg-slate-800">
      {items.map((item) => {
        const config = tones[item.tone] || tones.info;
        const Icon = config.icon;
        return (
          <li key={item.id} className="relative flex gap-3 pb-5 last:pb-0">
            <span className={`relative z-10 grid size-9 shrink-0 place-items-center rounded-xl ${config.classes}`}><Icon className="size-4" /></span>
            <div className="min-w-0 pt-0.5"><div className="flex flex-wrap items-start justify-between gap-2"><strong className="text-sm text-slate-950 dark:text-white">{item.title}</strong><time className="text-[11px] font-semibold text-slate-400">{formatAdminDateTime(item.at)}</time></div><p className="mt-1 mb-0 text-xs leading-5 text-slate-500 dark:text-slate-400">{item.description}</p></div>
          </li>
        );
      })}
    </ol>
  );
}
