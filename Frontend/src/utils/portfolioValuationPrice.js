/**
 * Resolve the best available valuation price without representing an API/listed
 * price as a verified live on-chain quote. A missing/zero live price should not
 * erase a useful *reference* estimate when the token record contains one.
 * Values remain exact decimal strings (no floating-point conversion).
 */
const positiveDecimal = (value) => {
  const text = String(value ?? '').trim().replace(/,/g, '');
  return /^\d+(?:\.\d+)?$/.test(text) && /[1-9]/.test(text) ? text : '';
};

const firstPositiveDecimal = (...values) => {
  for (const value of values) {
    const price = positiveDecimal(value);
    if (price) return price;
  }
  return '';
};

export const resolvePortfolioReferencePrice = (token = {}) => {
  const raw = token?.raw || {};
  const information = raw?.tokenInformation || raw?.information || {};
  const pricing = raw?.supplyPricing || raw?.pricing || {};

  // Explicit "current" fields take priority. The mapped currentTokenPriceExact
  // is intentionally NOT used here: the marketplace mapper may fill it with an
  // initial issue price, which must be labelled differently.
  const reported = firstPositiveDecimal(
    raw?.currentTokenPrice,
    raw?.currentPrice,
    information?.currentTokenPrice,
    information?.currentPrice,
    pricing?.currentTokenPrice,
    pricing?.currentPrice,
  );
  if (reported) return { value: reported, source: 'reported' };

  const listed = firstPositiveDecimal(raw?.price, information?.price, pricing?.price);
  if (listed) return { value: listed, source: 'listed' };

  const initial = firstPositiveDecimal(
    token?.initialTokenPriceExact,
    token?.initialTokenPrice,
    token?.initialPrice,
    raw?.initialTokenPrice,
    raw?.initialPrice,
    information?.initialTokenPrice,
    information?.initialPrice,
    pricing?.initialTokenPrice,
    pricing?.initialPrice,
  );
  if (initial) return { value: initial, source: 'initial' };
  return null;
};

export const resolvePortfolioValuationPrice = (token, liveState) => {
  const liveValue = positiveDecimal(liveState?.value);
  if (liveState?.status === 'ready' && liveValue) {
    return { status: 'ready', source: 'live', value: liveValue, reason: '' };
  }

  const fallback = resolvePortfolioReferencePrice(token);
  if (fallback) {
    const label = fallback.source === 'reported'
      ? 'Last reported token price'
      : fallback.source === 'listed'
        ? 'Listed token price'
        : 'Initial token price';
    return {
      status: 'reference',
      source: fallback.source,
      value: fallback.value,
      reason: `${label} used for this estimate; live price ${liveState?.status === 'loading' || !liveState ? 'is being checked' : 'is unavailable'}`,
    };
  }

  return liveState?.status === 'loading' || !liveState
    ? { status: 'loading', source: '', value: '', reason: 'Checking live token price' }
    : { status: 'unavailable', source: '', value: '', reason: liveState.reason || 'No verified or reference price is available' };
};
