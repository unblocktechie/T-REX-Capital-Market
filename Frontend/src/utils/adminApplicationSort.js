// Server sorting applies across pages when the backend supports these keys.
// This stable fallback keeps the currently visible page sortable on older APIs.
const ALLOWED = new Set(['investorName', 'issuerName', 'tokenName', 'chainName', 'status', 'submittedAt']);
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
const valueFor = (row, key) => {
  switch (key) {
    case 'investorName': return row.investorName || row.investorEmail || '';
    case 'issuerName': return row.issuerName || row.legalCompanyName || row.organizationName || '';
    case 'tokenName': return row.tokenName || row.tokenSymbol || '';
    case 'chainName': return row.chainName || row.chainId || '';
    case 'status': return row.status || '';
    case 'submittedAt': return row.submittedAt || row.createdAt || '';
    default: return '';
  }
};
export const sortAdminApplicationPage = (rows = [], sortBy = '', sortOrder = 'asc') => {
  if (!ALLOWED.has(sortBy) || !Array.isArray(rows) || rows.length < 2) return rows;
  const direction = sortOrder === 'desc' ? -1 : 1;
  return [...rows].sort((a, b) => {
    const left = valueFor(a, sortBy);
    const right = valueFor(b, sortBy);
    const comparison = sortBy === 'submittedAt'
      ? (Date.parse(left) || 0) - (Date.parse(right) || 0)
      : collator.compare(String(left), String(right));
    return comparison * direction;
  });
};
