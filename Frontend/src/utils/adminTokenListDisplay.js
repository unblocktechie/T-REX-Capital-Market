/** Read the backend count; do not imply that missing counts are zero. */
export const adminTokenCurrentHolders = (token = {}) => {
  const raw = token.holderSummary?.currentHolders ?? token.currentHolders ?? token.currentHolderCount;
  if (raw === null || raw === undefined || raw === '') return '—';
  const count = Number(raw);
  return Number.isSafeInteger(count) && count >= 0 ? count.toLocaleString() : '—';
};

export const adminTokenCreatedDate = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};
