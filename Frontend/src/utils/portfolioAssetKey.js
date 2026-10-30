// A display/cache key is not an API token UID. Preserve partial portfolio rows
// without combining the balances of unrelated assets that lack backend IDs.
export const portfolioAssetKey = (token) =>
  token.tokenUid ||
  (token.tokenAddress
    ? `${token.chainId || ''}:${token.tokenAddress.toLowerCase()}`
    : `${token.chainId || ''}:${token.symbol || ''}:${token.name || ''}`);
