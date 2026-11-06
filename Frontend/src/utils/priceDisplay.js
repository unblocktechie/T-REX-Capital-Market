/**
 * Price-only presentation formatter shared by issuer, investor and admin views.
 * Keep API decimals as strings: Number/toFixed silently lose precision for ERC-20 prices.
 * This is presentation ONLY. Never use a formatted result in a calculation, form or API.
 *
 * Examples: 350 -> 350.00; 0.012345 -> 0.0123;
 * 0.00123456 -> 0.001235; 0.000000123456 -> 0.0000001235.
 */
const groupWhole = (digits) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

export function formatPriceDisplay(value) {
  if (value === null || value === undefined || String(value).trim() === '') {
    return { display: '', exact: '', isAbbreviated: false, isTruncated: false };
  }
  const source = String(value).trim();
  const raw = source.replace(/,/g, '');
  const match = raw.match(/^([+-]?)(\d+)(?:\.(\d+))?$/);
  if (!match || source.length > 4096) {
    return { display: '', exact: '', isAbbreviated: false, isTruncated: false };
  }
  const sign = match[1] === '-' ? '-' : '';
  const whole = match[2].replace(/^0+(?=\d)/, '');
  const fraction = (match[3] || '').replace(/0+$/, '');
  const isZero = whole === '0' && !fraction;
  const canonical = `${!isZero ? sign : ''}${whole}${fraction ? `.${fraction}` : ''}`;
  // The tooltip must show exactly the supplied decimal text, including any
  // fractional zeros. Never derive it from the rounded/normalized display.
  // A raw "6" stays "6"; "6.000000" stays "6.000000".
  const exact = source;

  // Cents for normal prices. For 0.01–0.099…, four decimal places keep
  // meaningful digits (0.012345 -> 0.0123). Below 0.01, keep four
  // significant digits, including every leading decimal zero.
  const firstNonzero = fraction.search(/[1-9]/);
  const places = isZero || whole !== '0' || firstNonzero === 0
    ? 2
    : firstNonzero === 1 ? 4 : firstNonzero + 4;

  const scale = Math.max(2, places);
  const padded = (fraction + '0'.repeat(scale)).slice(0, scale);
  const roundUp = fraction.length > scale && fraction[scale] >= '5';
  const scaled = BigInt(whole) * (10n ** BigInt(scale)) + BigInt(padded) + (roundUp ? 1n : 0n);
  const divisor = 10n ** BigInt(scale);
  const outputWhole = groupWhole((scaled / divisor).toString());
  let outputFraction = (scaled % divisor).toString().padStart(scale, '0');
  // Keep minimum of two decimal places; never pad small values with useless
  // trailing zeros beyond their actual required precision.
  outputFraction = outputFraction.replace(/0+$/, '').padEnd(2, '0');
  const display = `${sign && scaled !== 0n ? '-' : ''}${outputWhole}.${outputFraction}`;
  return { display, exact, isAbbreviated: display.replace(/,/g, '') !== canonical, isTruncated: display.replace(/,/g, '') !== canonical };
}

export const formatPriceText = (value, fallback = '—') => formatPriceDisplay(value).display || fallback;
