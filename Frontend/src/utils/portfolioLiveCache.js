// Cache only per-asset, per-chain, per-wallet live reads during the current page
// session. A search should not invalidate wallet/price reads for the same asset.
// Never persist these values or share them across investors.
export const PORTFOLIO_LIVE_CACHE_TTL_MS = 30_000;

const normalize = (value) => String(value ?? '').trim().toLowerCase();

export const portfolioBalanceIdentity = (token, walletAddress) => [
  normalize(walletAddress),
  normalize(token?.chainId),
  normalize(token?.tokenAddress),
  normalize(token?.decimals),
].join(':');

export const portfolioPriceIdentity = (token, paymentTokenAddress) => [
  normalize(token?.chainId),
  normalize(token?.tokenAddress),
  normalize(paymentTokenAddress),
].join(':');

export const readPortfolioLiveCache = (cache, assetKey, identity, now = Date.now()) => {
  const entry = cache.get(assetKey);
  if (!entry || entry.identity !== identity) return null;
  return {
    state: entry.state,
    fresh: now - entry.updatedAt < PORTFOLIO_LIVE_CACHE_TTL_MS,
  };
};

export const storePortfolioLiveCache = (cache, assetKey, identity, state, now = Date.now()) => {
  cache.set(assetKey, { identity, state, updatedAt: now });
};

// A slow RPC must not be restarted for the same asset on each search result.
// Share the pending promise until it settles, then permit later refreshes.
export const getOrStartPortfolioLiveRead = (inFlight, assetKey, identity, read) => {
  const requestKey = `${assetKey}|${identity}`;
  const existing = inFlight.get(requestKey);
  if (existing) return existing;
  const pending = Promise.resolve().then(read).finally(() => {
    if (inFlight.get(requestKey) === pending) inFlight.delete(requestKey);
  });
  inFlight.set(requestKey, pending);
  return pending;
};
