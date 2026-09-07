import { TrexMiniLoader } from '@/components/loaders/TrexLoader';
import { cn } from '@/utils/cn';

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  icon: Icon,
  className,
  disabled,
  type = 'button',
  ...props
}) {
  return (
    <button
      type={type}
      className={cn('button', `button--${variant}`, `button--${size}`, className)}
      disabled={disabled || loading}
      aria-busy={loading}
      {...props}
    >
      {loading ? (
        <TrexMiniLoader className="shrink-0" label="Loading" />
      ) : Icon ? (
        <Icon size={18} className="shrink-0 self-center" aria-hidden="true" />
      ) : null}
      <span className="inline-flex min-w-0 items-center justify-center gap-2 leading-none [&>svg]:shrink-0 [&>svg]:self-center">
        {children}
      </span>
    </button>
  );
}
