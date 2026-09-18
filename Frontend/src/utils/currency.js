import { appConfig } from '@/config/app.config';

export const formatCurrency = (value, currency = appConfig.defaultCurrency) =>
  new Intl.NumberFormat(appConfig.defaultLocale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

export const formatNumber = (value) =>
  new Intl.NumberFormat(appConfig.defaultLocale, { maximumFractionDigits: 1 }).format(
    Number(value || 0),
  );

const normalizeDecimalString = (value) => String(value ?? '').trim().replace(/,/g, '');

/**
 * Return a canonical, non-negative decimal string without grouping or
 * insignificant zeroes. Invalid values return an empty string.
 *
 * Keeping monetary values as strings avoids the precision loss that can occur
 * when small token prices are converted to JavaScript Number values.
 */
export const canonicalDecimalString = (value) => {
  const normalized = normalizeDecimalString(value);
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return '';

  const [wholeRaw = '0', fractionRaw = ''] = normalized.split('.');
  const whole = wholeRaw.replace(/^0+(?=\d)/, '') || '0';
  const fraction = fractionRaw.replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole;
};

const decimalParts = (value) => {
  const canonical = canonicalDecimalString(value);
  if (!canonical) return null;
  const [whole = '0', fraction = ''] = canonical.split('.');
  return {
    canonical,
    digits: BigInt(`${whole}${fraction}`),
    scale: fraction.length,
  };
};

const formatScaledDecimal = (digits, scale) => {
  const normalizedScale = Math.max(0, Number(scale) || 0);
  const raw = digits.toString().padStart(normalizedScale + 1, '0');
  const whole = normalizedScale ? raw.slice(0, -normalizedScale) || '0' : raw;
  const fraction = normalizedScale ? raw.slice(-normalizedScale).replace(/0+$/, '') : '';
  return fraction ? `${whole}.${fraction}` : whole;
};

const groupCanonicalDecimal = (value) => {
  const canonical = canonicalDecimalString(value);
  if (!canonical) return '';
  const [whole, fraction = ''] = canonical.split('.');
  const groupedWhole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return fraction ? `${groupedWhole}.${fraction}` : groupedWhole;
};

const compareDecimals = (left, right) => {
  const a = decimalParts(left);
  const b = decimalParts(right);
  if (!a || !b) return null;

  const targetScale = Math.max(a.scale, b.scale);
  const aScaled = a.digits * (10n ** BigInt(targetScale - a.scale));
  const bScaled = b.digits * (10n ** BigInt(targetScale - b.scale));
  if (aScaled === bScaled) return 0;
  return aScaled < bScaled ? -1 : 1;
};

/** Multiply two decimal strings exactly and return the full canonical result. */
export const multiplyDecimalStrings = (left, right) => {
  const a = decimalParts(left);
  const b = decimalParts(right);
  if (!a || !b) return '';
  return canonicalDecimalString(formatScaledDecimal(a.digits * b.digits, a.scale + b.scale));
};

const roundDecimal = (value, maximumFractionDigits) => {
  const parts = decimalParts(value);
  if (!parts) return '';

  const targetScale = Math.max(0, Math.floor(Number(maximumFractionDigits) || 0));
  if (parts.scale <= targetScale) return parts.canonical;

  const divisor = 10n ** BigInt(parts.scale - targetScale);
  const rounded = (parts.digits + (divisor / 2n)) / divisor;
  return canonicalDecimalString(formatScaledDecimal(rounded, targetScale));
};

/**
 * Format an exact decimal for compact financial UI without hiding tiny values.
 * Positive values below 0.000001 are shown as "<0.000001". Other values are
 * rounded to at most six decimal places by default. `exact` always contains
 * the complete value so callers can expose it in a hover tooltip.
 */
export const formatDecimalForDisplay = (
  value,
  { maximumFractionDigits = 6, tinyThreshold = '0.000001' } = {},
) => {
  const canonical = canonicalDecimalString(value);
  if (!canonical) {
    return {
      display: '',
      exact: '',
      isAbbreviated: false,
      isTiny: false,
    };
  }

  const exact = groupCanonicalDecimal(canonical);
  const isPositive = /[1-9]/.test(canonical);
  const threshold = canonicalDecimalString(tinyThreshold) || '0.000001';
  const isTiny = isPositive && compareDecimals(canonical, threshold) === -1;

  if (isTiny) {
    return {
      display: `<${groupCanonicalDecimal(threshold)}`,
      exact,
      isAbbreviated: true,
      isTiny: true,
    };
  }

  const rounded = roundDecimal(canonical, maximumFractionDigits);
  const display = groupCanonicalDecimal(rounded);
  return {
    display,
    exact,
    isAbbreviated: rounded !== canonical,
    isTiny: false,
  };
};
