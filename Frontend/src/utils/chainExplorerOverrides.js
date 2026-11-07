/**
 * Official public Robinhood Chain explorers. Keep them pinned to the actual
 * chain ID so a stale admin setting cannot send testnet users to mainnet (or
 * to a different blockchain). Other chains use the backend configuration.
 */
const ROBINHOOD_EXPLORERS = Object.freeze({
  4663: 'https://robin.etherscan.io',
  46630: 'https://explorer.testnet.chain.robinhood.com',
});

export const resolveChainExplorerUrl = (chainId, configuredExplorerUrl = '') => {
  const numericChainId = Number(chainId);
  if (Number.isSafeInteger(numericChainId) && ROBINHOOD_EXPLORERS[numericChainId]) {
    return ROBINHOOD_EXPLORERS[numericChainId];
  }
  return String(configuredExplorerUrl ?? '').trim();
};
