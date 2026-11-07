// A wallet transaction can be submitted (or confirmed by the backend) before
// the paginated activity endpoint has indexed it. Keep that locally observed
// transaction visible until the canonical row becomes available.
const clean = (value) => String(value ?? '').trim();
const hashOf = (row) => clean(row?.paymentTxHash || row?.transactionHash || row?.txHash);
const validHash = (value) => /^0x[a-fA-F0-9]{64}$/.test(clean(value));
const statusOf = (row) => clean(row?.canonicalStatus).toUpperCase();

export function reconcileInvestmentHistory(rows, recentPurchase, {
  page = 1,
  search = '',
  status = 'all',
  limit = 5,
} = {}) {
  const canonicalRows = Array.isArray(rows) ? rows : [];
  const recentHash = hashOf(recentPurchase).toLowerCase();
  const recentStatus = statusOf(recentPurchase);
  const isTracked = validHash(recentHash) && ['SUBMITTED', 'CONFIRMED', 'FAILED'].includes(recentStatus);
  const canonicalPresent = isTracked && canonicalRows.some((row) => hashOf(row).toLowerCase() === recentHash);
  const matchesFilters = Number(page) === 1
    && !clean(search)
    && (clean(status).toUpperCase() === 'ALL' || clean(status).toUpperCase() === recentStatus);
  const showRecent = isTracked && !canonicalPresent && matchesFilters;

  return {
    rows: showRecent ? [recentPurchase, ...canonicalRows].slice(0, limit) : canonicalRows,
    recentRowAdded: showRecent,
    needsReconciliation: isTracked && !canonicalPresent,
  };
}
