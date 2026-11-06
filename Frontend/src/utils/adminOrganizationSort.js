// The organization endpoint currently supports sorting by submission date only.
// Sort the currently loaded page for the other headings without sending
// undocumented sort fields to the backend or mutating React Query data.
export function sortAdminOrganizationsPage(items, sortBy = 'submittedAt', direction = 'desc') {
  if (sortBy !== 'name' && sortBy !== 'status') return items;

  const multiplier = direction === 'asc' ? 1 : -1;
  return [...items].sort((left, right) => {
    const a = String(left?.[sortBy] ?? '').trim();
    const b = String(right?.[sortBy] ?? '').trim();
    // Keep missing values at the bottom in both directions.
    if (!a) return b ? 1 : 0;
    if (!b) return -1;
    return multiplier * a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  });
}
