import { cn } from '@/utils/cn';

export function PrivyMark({ className, size = 18 }) {
  return (
    <svg
      viewBox="0 0 40 48"
      width={size}
      height={size}
      className={cn('shrink-0', className)}
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="20" cy="15.5" r="12.75" fill="currentColor" />
      <ellipse cx="20" cy="38.75" rx="7.8" ry="2.2" fill="currentColor" />
    </svg>
  );
}

export function PrivyWordmark({ className, markClassName, size = 18 }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap', className)}>
      <PrivyMark size={size} className={markClassName} />
      <strong className="font-sans text-[1.08em] font-black leading-none tracking-[-0.075em]">
        privy
      </strong>
    </span>
  );
}

const toneClasses = {
  light: 'border-slate-200/90 bg-white/90 text-slate-500 shadow-sm',
  soft: 'border-slate-200 bg-slate-50 text-slate-500',
  dark: 'border-white/15 bg-white/[0.07] text-slate-300 shadow-[0_8px_24px_rgba(0,0,0,0.14)]',
};

export function PrivyTrustBadge({
  className,
  tone = 'light',
  label = 'Secure embedded wallet',
  compact = false,
}) {
  const isDark = tone === 'dark';

  return (
    <span
      className={cn(
        'inline-flex max-w-full flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-full border font-semibold leading-none',
        compact ? 'px-2.5 py-1 text-[9.5px]' : 'px-3 py-1.5 text-[10px]',
        toneClasses[tone] || toneClasses.light,
        className,
      )}
      aria-label={`${label}. Protected by Privy.`}
    >
      <span className="whitespace-nowrap">{label}</span>
      <span
        className={cn('h-3 w-px shrink-0', isDark ? 'bg-white/20' : 'bg-slate-300')}
        aria-hidden="true"
      />
      <span className="inline-flex items-center gap-1 whitespace-nowrap">
        <span className={cn(isDark ? 'text-slate-400' : 'text-slate-400')}>Protected by</span>
        <PrivyWordmark
          size={compact ? 14 : 15}
          className={cn('text-[11px]', isDark ? 'text-white' : 'text-slate-950')}
        />
      </span>
    </span>
  );
}
