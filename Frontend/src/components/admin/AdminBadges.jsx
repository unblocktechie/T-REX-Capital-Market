import { CheckCircle2, CircleDot, Clock3, ShieldAlert, ShieldCheck, XCircle } from 'lucide-react';
import { cn } from '@/utils/cn';

const statusConfig = {
  submitted: { label: 'Submitted', icon: Clock3, classes: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300' },
  resubmitted: { label: 'Resubmitted', icon: CircleDot, classes: 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-500/25 dark:bg-violet-500/10 dark:text-violet-300' },
  pending: { label: 'Pending', icon: Clock3, classes: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300' },
  under_review: { label: 'Under review', icon: CircleDot, classes: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/25 dark:bg-blue-500/10 dark:text-blue-300' },
  approved: { label: 'Approved', icon: CheckCircle2, classes: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300' },
  rejected: { label: 'Rejected', icon: XCircle, classes: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-300' },
};

export function AdminStatusBadge({ status, compact = false }) {
  const config = statusConfig[status] || statusConfig.pending;
  const Icon = config.icon;
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border font-bold', compact ? 'px-2 py-1 text-[10px]' : 'px-2.5 py-1.5 text-xs', config.classes)}>
      <Icon className={compact ? 'size-3' : 'size-3.5'} aria-hidden="true" />
      {config.label}
    </span>
  );
}

const riskConfig = {
  low: { label: 'Low risk', icon: ShieldCheck, classes: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300' },
  medium: { label: 'Medium risk', icon: ShieldAlert, classes: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300' },
  high: { label: 'High risk', icon: ShieldAlert, classes: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-300' },
};

export function AdminRiskBadge({ level = 'low', score, compact = false }) {
  const config = riskConfig[level] || riskConfig.low;
  const Icon = config.icon;
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border font-bold', compact ? 'px-2 py-1 text-[10px]' : 'px-2.5 py-1.5 text-xs', config.classes)}>
      <Icon className={compact ? 'size-3' : 'size-3.5'} aria-hidden="true" />
      {typeof score === 'number' ? `${score} · ` : ''}{config.label}
    </span>
  );
}
