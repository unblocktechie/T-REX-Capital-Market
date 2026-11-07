import { priceHistoryMethod } from '../services/price-history/priceHistory.utils.js';
import { adminHolderStatus } from './adminHolderDisplay.js';

// Admin token detail endpoints expose pagination, not sort parameters. Sort a
// copy of the currently loaded page and never alter fetched/cached data.
const normalizedText = (value) => String(value ?? '').trim();
const compareText = (left, right, direction) => {
  const a = normalizedText(left);
  const b = normalizedText(right);
  if (!a || !b) return a ? -1 : b ? 1 : 0;
  return (direction === 'desc' ? -1 : 1) * a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });
};
const compareDate = (left, right, direction) => {
  const a = Date.parse(left || '');
  const b = Date.parse(right || '');
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Number.isFinite(a) ? -1 : Number.isFinite(b) ? 1 : 0;
  return (direction === 'desc' ? -1 : 1) * (a - b);
};
// Compare precise token balance and price decimal strings, without Number's
// precision loss for large token quantities or very small prices.
const decimal = (input) => {
  const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(normalizedText(input));
  if (!match) return null;
  const whole = match[2].replace(/^0+(?=\d)/, '');
  const fraction = (match[3] || '').replace(/0+$/, '');
  return { negative: match[1] === '-' && (whole !== '0' || !!fraction), whole, fraction };
};
const compareDecimal = (left, right, direction) => {
  const a = decimal(left);
  const b = decimal(right);
  if (!a || !b) return a ? -1 : b ? 1 : 0;
  let result;
  if (a.negative !== b.negative) result = a.negative ? -1 : 1;
  else {
    const integer = a.whole.length - b.whole.length || a.whole.localeCompare(b.whole);
    const digits = Math.max(a.fraction.length, b.fraction.length);
    result = (a.negative ? -1 : 1) * (integer || a.fraction.padEnd(digits, '0').localeCompare(b.fraction.padEnd(digits, '0')));
  }
  return (direction === 'desc' ? -1 : 1) * result;
};
const investorName = (row) => row.fullName || row.investorName || row.name || [row.firstName, row.lastName].filter(Boolean).join(' ') || row.email;
const holderStatus = (row) => adminHolderStatus(row);
const investorSortFields = {
  investor: (row) => investorName(row),
  accreditation: (row) => row.accreditationType,
  balance: (row) => row.currentTokenBalance,
  holdingStatus: (row) => holderStatus(row),
};
export function sortAdminTokenInvestorsPage(items, field = '', direction = 'asc') {
  if (!Object.hasOwn(investorSortFields, field)) return items;
  return [...items].sort((a, b) => field === 'balance'
    ? compareDecimal(a.currentTokenBalance, b.currentTokenBalance, direction)
    : compareText(investorSortFields[field](a), investorSortFields[field](b), direction));
}
const historyFields = {
  date: (row) => row.createdAt,
  previousPrice: (row) => row.oldPriceFormatted,
  newPrice: (row) => row.newPriceFormatted,
  method: (row) => priceHistoryMethod(row),
  status: (row) => row.status,
};
export function sortAdminTokenHistoryPage(items, field = '', direction = 'asc') {
  if (!Object.hasOwn(historyFields, field)) return items;
  return [...items].sort((a, b) => field === 'date'
    ? compareDate(historyFields[field](a), historyFields[field](b), direction)
    : (field === 'previousPrice' || field === 'newPrice')
      ? compareDecimal(historyFields[field](a), historyFields[field](b), direction)
      : compareText(historyFields[field](a), historyFields[field](b), direction));
}
