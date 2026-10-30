const firstText = (...values) => {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    const normalized = String(value).trim();
    if (normalized) return normalized;
  }
  return '';
};

export const normalizeTokenPriceInput = (value) => String(value ?? '').replace(/,/g, '').trim();

export const validateCurrentTokenPrice = (value) => {
  const normalized = normalizeTokenPriceInput(value);
  if (!normalized) return 'Enter a new current price.';
  if (!/^\d+(?:\.\d{1,18})?$/.test(normalized)) {
    return 'Enter a positive price with up to 18 decimal places.';
  }
  if (!/[1-9]/.test(normalized)) return 'Current price must be greater than zero.';
  return '';
};

export const resolveInitialTokenPriceExact = (token = {}) => {
  const raw = token?.raw || {};
  const information = raw?.tokenInformation || raw?.information || {};
  const pricing = raw?.supplyPricing || raw?.pricing || {};
  return firstText(
    token?.initialTokenPriceExact,
    token?.initialTokenPrice,
    token?.initialPrice,
    raw?.initialTokenPrice,
    information?.initialTokenPrice,
    information?.initialPrice,
    pricing?.initialTokenPrice,
    pricing?.initialPrice,
    token?.price,
    raw?.price,
  );
};

export const resolveCurrentTokenPriceExact = (token = {}) => {
  const raw = token?.raw || {};
  const information = raw?.tokenInformation || raw?.information || {};
  const pricing = raw?.supplyPricing || raw?.pricing || {};
  return firstText(
    token?.currentTokenPriceExact,
    token?.currentTokenPrice,
    token?.currentPrice,
    raw?.currentTokenPrice,
    raw?.currentPrice,
    information?.currentTokenPrice,
    information?.currentPrice,
    pricing?.currentTokenPrice,
    pricing?.currentPrice,
    token?.price,
    raw?.price,
    resolveInitialTokenPriceExact(token),
  );
};

const DECIMAL_SCALE = 18;
const DECIMAL_FACTOR = 10n ** BigInt(DECIMAL_SCALE);

const toScaledDecimal = (value) => {
  const normalized = normalizeTokenPriceInput(value);
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null;
  const [whole = '0', fraction = ''] = normalized.split('.');
  if (fraction.length > DECIMAL_SCALE) return null;
  return (BigInt(whole || '0') * DECIMAL_FACTOR) + BigInt((fraction + '0'.repeat(DECIMAL_SCALE)).slice(0, DECIMAL_SCALE));
};

const formatScaledDecimal = (value) => {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const whole = absolute / DECIMAL_FACTOR;
  const fraction = String(absolute % DECIMAL_FACTOR).padStart(DECIMAL_SCALE, '0').replace(/0+$/, '');
  return `${negative ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`;
};

export const tokenPriceChange = (currentPrice, nextPrice) => {
  const current = toScaledDecimal(currentPrice);
  const next = toScaledDecimal(nextPrice);
  if (current === null || next === null) return null;
  const delta = next - current;
  return {
    direction: delta > 0n ? 'increase' : delta < 0n ? 'decrease' : 'unchanged',
    amountExact: formatScaledDecimal(delta < 0n ? -delta : delta),
    signedAmountExact: formatScaledDecimal(delta),
  };
};

const groupWholeDigits = (value) => value.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/**
 * Format a token price for display without ever converting it to Number.
 *
 * The exact value is preserved separately for tooltip/accessibility use. The
 * visible value is truncated (never rounded) to six decimal places by default,
 * and insignificant trailing zeroes are omitted.
 */
export const formatTokenPriceForDisplay = (value, maximumFractionDigits = 6) => {
  const exact = String(value ?? '').trim();
  if (!exact) return { display: '', exact: '', isTruncated: false };

  const normalized = exact.replace(/,/g, '');
  const match = normalized.match(/^([+-]?)(\d+)(?:\.(\d+))?$/);
  if (!match) return { display: exact, exact, isTruncated: false };

  const [, sign = '', wholeRaw = '0', fractionRaw = ''] = match;
  const whole = wholeRaw.replace(/^0+(?=\d)/, '') || '0';
  const significantFraction = fractionRaw.replace(/0+$/, '');
  const limit = Math.max(0, Math.floor(Number(maximumFractionDigits) || 0));
  const isTruncated = significantFraction.length > limit;
  const visibleFraction = isTruncated
    ? significantFraction.slice(0, limit)
    : significantFraction.slice(0, limit).replace(/0+$/, '');
  const display = `${sign}${groupWholeDigits(whole)}${visibleFraction ? `.${visibleFraction}` : ''}${isTruncated ? '…' : ''}`;

  return { display, exact, isTruncated };
};

const comparableTokenPrice = (value) => {
  const normalized = normalizeTokenPriceInput(value);
  const match = normalized.match(/^(\d+)(?:\.(\d+))?$/);
  if (!match) return null;
  const whole = match[1].replace(/^0+(?=\d)/, '') || '0';
  const fraction = (match[2] || '').replace(/0+$/, '');
  return { whole, fraction };
};

/** Compare non-negative token-price decimal strings without floating point. */
export const compareTokenPrices = (left, right, direction = 'asc') => {
  const a = comparableTokenPrice(left);
  const b = comparableTokenPrice(right);
  if (!a && !b) return 0;
  // Keep missing/invalid prices at the end in either sort direction.
  if (!a) return 1;
  if (!b) return -1;

  let result = 0;
  if (a.whole.length !== b.whole.length) {
    result = a.whole.length < b.whole.length ? -1 : 1;
  } else if (a.whole !== b.whole) {
    result = a.whole < b.whole ? -1 : 1;
  } else {
    const scale = Math.max(a.fraction.length, b.fraction.length);
    const aFraction = a.fraction.padEnd(scale, '0');
    const bFraction = b.fraction.padEnd(scale, '0');
    if (aFraction !== bFraction) result = aFraction < bFraction ? -1 : 1;
  }

  return direction === 'desc' ? -result : result;
};
