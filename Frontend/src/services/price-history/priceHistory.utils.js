import { formatPriceText } from '../../utils/priceDisplay.js';
const ALLOWED_SOURCES = new Set(['all', 'manual', 'automated', 'legacy', 'blockchain']);
const ALLOWED_STATUSES = new Set([
  'all', 'APPLIED', 'PENDING', 'SUBMITTED', 'CONFIRMED', 'CANCELLED', 'EXPIRED', 'FAILED', 'ORPHANED',
]);

export const PRICE_HISTORY_LIMIT = 10;
// Value threshold (not the number of chart points): above 10, use whole
// numbers on the chart; at or below 10, show two decimal places.
export const PRICE_HISTORY_PRICE_THRESHOLD = 50;

export const PRICE_HISTORY_STATUSES = [...ALLOWED_STATUSES];

export function normalizePriceHistoryQuery({ page = 1, limit = PRICE_HISTORY_LIMIT, source = 'all', status = 'all', search = '', tokenUid } = {}) {
  const validPage = Number(page);
  const validLimit = Number(limit);
  return {
    page: Number.isSafeInteger(validPage) && validPage >= 1 ? validPage : 1,
    limit: Number.isSafeInteger(validLimit) ? Math.min(100, Math.max(1, validLimit)) : PRICE_HISTORY_LIMIT,
    source: ALLOWED_SOURCES.has(source) ? source : 'all',
    status: ALLOWED_STATUSES.has(status) ? status : 'all',
    search: String(search || '').trim().slice(0, 100),
    // Investors must scope their history to the marketplace token. Issuer requests
    // intentionally omit this query field to preserve their existing API contract.
    ...(String(tokenUid || '').trim() ? { tokenUid: String(tokenUid).trim() } : {}),
  };
}

export const priceHistoryQueryPrefix = (userKey, chainUid) => [
  'tokens', 'price-history', String(userKey || 'current-user'), String(chainUid || 'unselected'),
];

export function normalizePriceHistoryResponse(body) {
  const items = Array.isArray(body?.data) ? body.data : [];
  const pagination = body?.meta?.pagination || {};
  const toNonNegative = (value, fallback) => {
    const numeric = Number(value);
    return Number.isSafeInteger(numeric) && numeric >= 0 ? numeric : fallback;
  };
  return {
    items,
    pagination: {
      page: Math.max(1, toNonNegative(pagination.page, 1)),
      limit: Math.max(1, toNonNegative(pagination.limit, PRICE_HISTORY_LIMIT)),
      total: toNonNegative(pagination.total, items.length),
      totalPages: Math.max(0, toNonNegative(pagination.totalPages, items.length ? 1 : 0)),
    },
  };
}

export function priceHistorySource(row = {}) {
  const mode = String(row.submissionMode || '').toUpperCase();
  if (row.isLegacyUpdate === true || mode === 'LEGACY') {
    return { text: 'Database update', tone: 'neutral' };
  }
  if (row.isOnchainUpdate === true || ['RELAYED', 'INDEXED', 'DIRECT'].includes(mode)) {
    return { text: 'Blockchain', tone: 'info' };
  }
  // updateType expresses the user's category, not confirmation/source proof.
  return { text: 'Unknown source', tone: 'neutral' };
}

export function priceHistoryStatus(status) {
  const value = String(status || '').trim().toUpperCase();
  // Both spellings can appear in API data; keep one consistent UI status.
  const code = value === 'CANCELED' ? 'CANCELLED' : value;
  const tones = {
    APPLIED: 'success', CONFIRMED: 'success', PENDING: 'warning',
    SUBMITTED: 'warning', CANCELLED: 'info', EXPIRED: 'danger', FAILED: 'danger', ORPHANED: 'danger',
  };
  return { text: code || 'Unknown', tone: tones[code] || 'neutral' };
}

// Never turn decimal price strings into Number: 18+ fractional digits would be lost.
export function exactPriceText(value) {
  if (value === undefined || value === null || String(value).trim() === '') return '—';
  const text = String(value).trim();
  return /^-?\d+(?:\.\d+)?$/.test(text) ? text : '—';
}

// Historical name retained for existing callers; shared adaptive price precision.
export function displayPriceTwoDecimals(value) {
  return formatPriceText(value);
}

// Tooltips must preserve the full original decimal string, including trailing
// zeros if the API supplied them. A raw "6" remains "6" and "6.0000"
// remains "6.0000". Visible chart labels still use the adaptive formatter.
export function historyChartTooltipPrice(value) {
  return exactPriceText(value);
}

// Only chart dot labels and vertical-axis ticks use this threshold. All other
// prices (including hover tooltips and the selected-price summary) keep their
// existing presentation and precision. Work with strings/BigInt, never Number.
export function displayHistoryChartPrice(value, threshold = PRICE_HISTORY_PRICE_THRESHOLD) {
  const exact = exactPriceText(value);
  if (exact === '—') return exact;

  const negative = exact.startsWith('-');
  const [whole, fraction = ''] = (negative ? exact.slice(1) : exact).split('.');
  const integerPart = BigInt(whole);
  const limit = BigInt(threshold);
  // Prices at or below the configured threshold retain the app's shared
  // adaptive formatting (important for very small, nonzero prices).
  const exceedsThreshold = !negative
    && (integerPart > limit || (integerPart === limit && /[1-9]/.test(fraction)));
  if (!exceedsThreshold) return formatPriceText(exact);

  // Whole-number display above the threshold: round half to even. This keeps
  // the original chart behavior (20.50 -> 20, 20.51 -> 21) while ensuring
  // prices with many decimals never suffer floating-point precision loss.
  const first = fraction[0] || '0';
  const roundUp = first > '5'
    || (first === '5' && (/[1-9]/.test(fraction.slice(1)) || integerPart % 2n !== 0n));
  return (integerPart + (roundUp ? 1n : 0n)).toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function priceHistoryDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

// The investor endpoint now accepts tokenUid to select a marketplace asset.
// Also verify the returned row scope before display, so a mismatched backend
// response can never be presented as the selected investment.
export function assertPriceHistoryAssetMatch(items, { tokenUid = '', tokenAddress = '', chainId = null } = {}) {
  const wantedUid = String(tokenUid || '').trim().toLowerCase();
  const wantedAddress = String(tokenAddress || '').trim().toLowerCase();
  const wantedChainId = Number(chainId);
  for (const row of items || []) {
    const receivedUid = String(row?.tokenUid || '').trim().toLowerCase();
    const receivedAddress = String(row?.tokenAddress || '').trim().toLowerCase();
    if ((receivedUid && wantedUid && receivedUid !== wantedUid)
      || (receivedAddress && wantedAddress && receivedAddress !== wantedAddress)
      || (Number.isSafeInteger(wantedChainId) && wantedChainId > 0
        && row?.chainId != null && Number(row.chainId) !== wantedChainId)) {
      throw new Error('The API returned price history for a different investment.');
    }
  }
  return items;
}

// The API's submission mode describes the path, not necessarily who clicked an action.
// Display only the two documented categories; legacy/INDEXED with no bot
// metadata are classified as Manual for display, not as signer proof.
export function priceHistoryMethod(row = {}) {
  // Explicit updateType is authoritative. Old submission modes are fallback
  // display categories only, and do not prove which wallet signed an event.
  const type = String(row.updateType || row.submissionMode || '').trim().toUpperCase();
  if (['AUTOMATED (BOT)', 'AUTOMATED', 'BOT', 'RELAYED'].includes(type)) return 'Automated (bot)';
  if (['MANUAL', 'DIRECT', 'LEGACY', 'INDEXED'].includes(type) || row.isLegacyUpdate === true) return 'Manual';
  return '—';
}

// The documented response has no actor address. Only use an explicitly supplied field.
export function priceHistoryActor(row = {}) {
  // The documented actor field is the only authority for 'Updated by'.
  const actor = row.updatedByWalletAddress;
  return typeof actor === 'string' && /^0x[a-fA-F0-9]{40}$/.test(actor) ? actor : '—';
}

export function isAppliedHistoryUpdate(row = {}) {
  return ['APPLIED', 'CONFIRMED'].includes(String(row.status || '').toUpperCase())
    && exactPriceText(row.newPriceFormatted) !== '—';
}

export function priceHistoryEffectiveTime(row = {}) {
  return row.status === 'CONFIRMED' && row.confirmedAt ? row.confirmedAt : row.createdAt;
}

export const PRICE_GRAPH_RANGES = Object.freeze([
  { value: 3, label: '3 Months' },
  { value: 6, label: '6 Months' },
  { value: 12, label: '1 Year' },
]);

export function priceGraphStartDate(months, reference = new Date()) {
  const start = new Date(reference);
  start.setUTCMonth(start.getUTCMonth() - months);
  return start;
}

export function priceHistoryGraphRows(rows, months, reference = new Date()) {
  const startMs = priceGraphStartDate(months, reference).getTime();
  return (rows || []).filter(isAppliedHistoryUpdate)
    .filter((row) => {
      const timestamp = Date.parse(priceHistoryEffectiveTime(row));
      return Number.isFinite(timestamp) && timestamp >= startMs && timestamp <= reference.getTime();
    })
    .sort((a, b) => Date.parse(priceHistoryEffectiveTime(a)) - Date.parse(priceHistoryEffectiveTime(b)));
}

// Label each actual day at the X position of its FIRST recorded price update.
// Keep all individual updates evenly spaced (not elapsed-time spaced); only
// change where the daily axis labels appear. Recharts may hide crowded
// intermediate labels on small screens, but no price points are removed.
export function historyChartDayTicks(points = []) {
  const days = [];
  for (const point of points) {
    const date = new Date(point.time);
    if (!Number.isFinite(date.getTime()) || !Number.isFinite(point.index)) continue;
    const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    if (days.at(-1)?.key !== key) {
      days.push({
        key,
        label: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        index: point.index,
      });
    }
  }
  return days.map(({ label, index }) => ({ index, label }));
}

// Convert decimals to common-scale integers to preserve precision. Only normalized
// screen coordinates become Numbers; never perform financial math in floating point.
function decimalInteger(value, scale) {
  const text = exactPriceText(value);
  if (text === '—' || text.startsWith('-')) return null;
  const [whole, fraction = ''] = text.split('.');
  return BigInt(whole) * (10n ** BigInt(scale)) + BigInt(fraction.padEnd(scale, '0'));
}

export function historyChartCoordinates(rows) {
  const valid = (rows || []).filter((row) => exactPriceText(row.newPriceFormatted) !== '—');
  if (!valid.length) return [];
  const scale = Math.max(...valid.map((row) => (row.newPriceFormatted.split('.')[1] || '').length));
  const numbers = valid.map((row) => decimalInteger(row.newPriceFormatted, scale));
  const min = numbers.reduce((a, b) => a < b ? a : b);
  const max = numbers.reduce((a, b) => a > b ? a : b);
  // Show each recorded update at a readable distance from its neighbors. A
  // timestamp-scaled axis can stack near-simultaneous events on top of each other
  // and compress the complete history into a vertical spike.
  return valid.map((row, index) => ({
    row,
    x: valid.length === 1 ? 50 : index * 100 / (valid.length - 1),
    y: min === max ? 50 : 100 - Number((numbers[index] - min) * 100000n / (max - min)) / 1000,
  }));
}

// Generate axis values with BigInt so large or high-precision token prices
// never pass through floating-point conversion, even for chart tick labels.
export function historyChartPriceTicks(rows) {
  const valid = (rows || []).filter((row) => exactPriceText(row.newPriceFormatted) !== '—');
  if (!valid.length) return [];
  const scale = Math.max(2, ...valid.map((row) => (row.newPriceFormatted.split('.')[1] || '').length));
  const numbers = valid.map((row) => decimalInteger(row.newPriceFormatted, scale));
  const min = numbers.reduce((a, b) => a < b ? a : b);
  const max = numbers.reduce((a, b) => a > b ? a : b);
  const divisor = 10n ** BigInt(scale);
  const toText = (value) => {
    const whole = value / divisor;
    const remainder = scale ? (value % divisor).toString().padStart(scale, '0') : '';
    return `${whole}${scale ? `.${remainder}` : ''}`;
  };
  if (min === max) return [{ y: 50, price: toText(min) }];
  return Array.from({ length: 5 }, (_, index) => ({
    y: index * 25,
    price: toText(min + (max - min) * BigInt(4 - index) / 4n),
  }));
}

// Compare decimal strings with integer math; Number would destroy precision.
export function compareHistoryPrices(left, right) {
  const a = exactPriceText(left);
  const b = exactPriceText(right);
  if (a === '—' || b === '—') return 0;
  const scale = Math.max((a.split('.')[1] || '').length, (b.split('.')[1] || '').length);
  const x = decimalInteger(a, scale);
  const y = decimalInteger(b, scale);
  if (x === null || y === null) return 0;
  return x < y ? -1 : x > y ? 1 : 0;
}
