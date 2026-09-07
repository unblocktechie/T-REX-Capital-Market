import { TrexMiniLoader } from '@/components/loaders/TrexLoader';
import { cn } from '@/utils/cn';

export function AuthButton({ children, loading = false, className, disabled, ...props }) {
  return (
    <button
      className={cn(
        'inline-flex min-h-[50px] w-full items-center justify-center gap-2 rounded-xl border border-transparent bg-[linear-gradient(135deg,var(--primary-500),var(--primary-600))] px-[17px] text-[15px] font-bold text-white whitespace-nowrap shadow-[0_8px_20px_rgba(22,119,210,0.24)] transition-[transform,box-shadow,background,border-color] duration-200 ease-out hover:-translate-y-px hover:shadow-[0_12px_28px_rgba(22,119,210,0.32)] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
      disabled={disabled || loading}
      aria-busy={loading}
      {...props}
    >
      {loading ? <TrexMiniLoader className="shrink-0" label="Submitting" /> : null}
      <span className="inline-flex min-w-0 items-center justify-center gap-2 leading-none [&>svg]:shrink-0 [&>svg]:self-center">
        {children}
      </span>
    </button>
  );
}
