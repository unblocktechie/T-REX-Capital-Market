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
