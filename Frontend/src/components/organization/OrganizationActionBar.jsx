export function OrganizationActionBar({ children }) {
  return (
    <div className="mt-4 flex min-w-0 flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:mt-5 sm:p-4">
      {children}
    </div>
  );
}
