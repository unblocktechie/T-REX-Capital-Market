// Service Wallet registration uses the existing Platform Controller proxy from
// the selected chain's Chain Master configuration. It is not a new per-token
// controller, and token payment metadata is not required for this lookup.
const EVM_ADDRESS = /^0x[a-fA-F0-9]{40}$/;

const controllerOf = (chain) => {
  const candidates = [
    chain?.platformControllerAddress,
    chain?.contracts?.platform?.platformController,
    chain?.contracts?.platformControllerAddress,
  ];
  return candidates.find((address) => typeof address === 'string' && EVM_ADDRESS.test(address.trim()))?.trim() || '';
};

const matchesTokenChain = (chain, tokenChainUid, tokenChainId) => {
  if (!chain) return false;
  if (tokenChainUid && chain.chainUid && String(chain.chainUid).toLowerCase() !== String(tokenChainUid).toLowerCase()) return false;
  if (tokenChainId && chain.chainId && Number(chain.chainId) !== Number(tokenChainId)) return false;
  return true;
};

/**
 * Resolve the existing per-chain proxy in Chain Master. The detailed network
 * config takes precedence over the public chain catalogue. Never fall back to
 * an organization wallet, token address, or stale token-payment controller.
 */
export function resolveTokenServiceWalletController({
  chainConfig,
  chainRecord,
  tokenChainUid,
  tokenChainId,
} = {}) {
  for (const chain of [chainConfig, chainRecord]) {
    if (!matchesTokenChain(chain, tokenChainUid, tokenChainId)) continue;
    const controller = controllerOf(chain);
    if (controller) return controller;
  }
  return '';
}
