import { cn } from '@/utils/cn';

export function AdminPanel({ title, description, action, children, className, bodyClassName }) {
  return (
    <section className={cn('rounded-[24px] border border-slate-200 bg-white shadow-[0_12px_32px_rgba(15,23,42,0.04)]', className)}>
      {(title || description || action) ? (
        <header className="flex flex-col gap-3 border-b border-slate-200 px-5 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-6">
          <div className="min-w-0">
            {title ? <h2 className="m-0 text-base font-semibold tracking-normal text-slate-950 sm:text-lg">{title}</h2> : null}
            {description ? <p className="mt-2 mb-0 text-sm leading-6 text-slate-500">{description}</p> : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </header>
      ) : null}
      <div className={cn('px-5 py-5 sm:px-6', bodyClassName)}>{children}</div>
    </section>
  );
}
