import { motion } from 'framer-motion';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { cn } from '@/utils/cn';

const tones = {
  amber: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
  emerald: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
  rose: 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300',
  blue: 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300',
  violet: 'bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300',
};

export function AdminMetricCard({ title, value, subtitle, icon: Icon, tone = 'blue', trend = 0, delay = 0 }) {
  const PositiveIcon = trend >= 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, delay }}
      whileHover={{ y: -3 }}
      className="group rounded-[20px] border border-slate-200/80 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.05)] transition-shadow hover:shadow-[0_18px_45px_rgba(15,23,42,0.09)] dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="mb-2 text-sm font-medium text-slate-500 dark:text-slate-400">{title}</p>
          <strong className="block text-3xl font-semibold tracking-normal text-slate-950 dark:text-white">{value}</strong>
        </div>
        <span className={cn('grid size-11 shrink-0 place-items-center rounded-2xl transition-transform group-hover:scale-105', tones[tone])}>
          <Icon className="size-5" aria-hidden="true" />
        </span>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3 text-xs">
        <span className="text-slate-500 dark:text-slate-400">{subtitle}</span>
        <span className={cn('inline-flex items-center gap-1 font-semibold', trend >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400')}>
          <PositiveIcon className="size-3.5" />
          {Math.abs(trend)}%
        </span>
      </div>
    </motion.article>
  );
}
