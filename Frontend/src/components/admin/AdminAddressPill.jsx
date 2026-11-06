import { CompactAddress } from '@/components/common/CompactAddress';

// Matches the organization-wallet column: subdued address pill + copy button.
export function AdminAddressPill({ value, label, leading = 10, trailing = 8 }) {
  if (!value) return <span className="text-xs text-slate-500">—</span>;
  return <span className="inline-flex max-w-full items-center rounded-lg bg-slate-100 px-2 py-1" title={value}>
    <CompactAddress value={value} label={label} leading={leading} trailing={trailing} />
  </span>;
}
