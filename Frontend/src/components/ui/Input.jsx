import { forwardRef, useId } from 'react';
import { cn } from '@/utils/cn';

export const Input = forwardRef(function Input(
  { label, error, hint, leading: Leading, trailing, className, id, ...props },
  ref,
) {
  const generatedId = useId();
  const inputId = id || generatedId;
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;

  return (
    <div className={cn('grid min-w-0 max-w-full gap-1.5', className)}>
      {label ? (
        <label className="text-[13px] font-bold text-[var(--text)]" htmlFor={inputId}>
          {label}
        </label>
      ) : null}
      <div
        className={cn(
          'flex min-h-[47px] min-w-0 items-center gap-2.5 rounded-xl border bg-[var(--surface)] px-3 transition-[border-color,box-shadow,background] duration-200 focus-within:border-[var(--primary-500)] focus-within:shadow-[0_0_0_4px_rgba(22,119,210,0.13)]',
          error ? 'border-[var(--danger-500)]' : 'border-[var(--border)]',
        )}
      >
        {Leading ? (
          <Leading
            className="size-[18px] shrink-0 text-[var(--text-muted)]"
            aria-hidden="true"
          />
        ) : null}
        <input
          ref={ref}
          id={inputId}
          className="min-w-0 flex-1 border-0 bg-transparent text-[var(--text)] outline-none placeholder:text-[var(--text-muted)]"
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          {...props}
        />
        {trailing}
      </div>
      {error ? (
        <p className="m-0 text-xs font-semibold text-[var(--danger-500)]" id={`${inputId}-error`}>
          {error}
        </p>
      ) : hint ? (
        <p className="m-0 text-xs text-[var(--text-muted)]" id={`${inputId}-hint`}>
          {hint}
        </p>
      ) : null}
    </div>
  );
});
