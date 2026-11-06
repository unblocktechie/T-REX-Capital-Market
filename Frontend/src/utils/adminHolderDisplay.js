/**
 * Show full contract-decimal balances without converting blockchain quantities
 * to JavaScript Number or silently rounding token holdings.
 */
export const formatAdminHolderBalance = (value) => {
  if (value === null || value === undefined || String(value).trim() === '') return 'Unavailable';
  const text = String(value).trim();
  const match = text.match(/^(\d+)(?:\.(\d+))?$/);
  if (!match) return 'Unavailable';
  const integer = match[1].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return match[2] === undefined ? integer : `${integer}.${match[2]}`;
};

/** UNKNOWN must not be coerced to FORMER (zero balance). */
export const adminHolderStatus = (investor) => {
  const status = String(investor?.holderStatus || '').toUpperCase();
  return ['CURRENT', 'FORMER'].includes(status) ? status : 'UNKNOWN';
};

export const adminHolderFilter = (value) => {
  const filter = String(value || '').toLowerCase();
  return filter === 'current' || filter === 'former' ? filter : 'all';
};
