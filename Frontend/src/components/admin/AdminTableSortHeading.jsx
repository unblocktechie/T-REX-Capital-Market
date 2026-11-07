import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

// The same compact icon/interaction style as the existing admin sort headings.
export function AdminTableSortHeading({ label, field, sortBy, sortOrder, onSort }) {
  const active = sortBy === field;
  const nextDirection = active && sortOrder === 'asc' ? 'descending' : 'ascending';
  return <button
    type="button"
    onClick={() => onSort(field)}
    aria-label={`Sort by ${label}, ${nextDirection}`}
    aria-pressed={active}
    title={`Sort ${label} ${nextDirection}`}
    className="inline-flex min-h-8 items-center gap-1.5 rounded-md text-left font-semibold text-slate-500 transition-colors hover:text-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
  >
    {label.toUpperCase()}
    {active ? (sortOrder === 'asc' ? <ArrowUp className="size-3.5 text-blue-600" aria-hidden="true"/> : <ArrowDown className="size-3.5 text-blue-600" aria-hidden="true"/>) : <ArrowUpDown className="size-3.5 text-slate-400" aria-hidden="true"/>}
  </button>;
}
