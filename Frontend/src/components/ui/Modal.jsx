import { useEffect, useId } from 'react';
import { X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { cn } from '@/utils/cn';

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  className,
  bodyClassName,
}) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[1000] flex items-end justify-center bg-slate-950/45 p-0 backdrop-blur-sm sm:items-center sm:p-5"
      role="presentation"
      onMouseDown={onClose}
    >
      <section
        className={cn(
          'flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[24px] border border-slate-200 bg-white shadow-2xl sm:max-w-xl sm:rounded-[24px]',
          className,
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6">
          <h2 id={titleId} className="m-0 text-lg font-semibold tracking-tight text-slate-950 sm:text-xl">
            {title}
          </h2>
          <button
            className="grid size-10 shrink-0 place-items-center rounded-xl border border-transparent text-slate-500 transition hover:border-slate-200 hover:bg-slate-100 hover:text-slate-900"
            onClick={onClose}
            aria-label="Close dialog"
            type="button"
          >
            <X size={20} />
          </button>
        </header>
        <div className={cn('min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6', bodyClassName)}>
          {children}
        </div>
        {footer ? (
          <footer className="flex shrink-0 flex-col-reverse gap-3 border-t border-slate-200 bg-slate-50/80 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
            {footer}
          </footer>
        ) : null}
      </section>
    </div>,
    document.body,
  );
}
