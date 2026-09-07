export function ReviewQueueSkeleton() {
  return (
    <div className="space-y-3" aria-label="Loading organizations" role="status">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="animate-pulse rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-4">
            <div className="size-11 rounded-2xl bg-slate-200 dark:bg-slate-800" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-3 w-1/3 rounded bg-slate-200 dark:bg-slate-800" />
              <div className="h-2.5 w-1/2 rounded bg-slate-100 dark:bg-slate-800/70" />
            </div>
            <div className="hidden h-8 w-24 rounded-full bg-slate-100 sm:block dark:bg-slate-800" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function DetailPageSkeleton() {
  return (
    <div className="grid animate-pulse gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-5">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-64 rounded-[20px] border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" />
        ))}
      </div>
      <div className="h-[520px] rounded-[20px] border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" />
    </div>
  );
}
