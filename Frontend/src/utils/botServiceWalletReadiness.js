// Service Wallets belong to a specific token and chain. Never infer authorization
// from an organization-level wallet, a different token, or an unrelated chain.
const evmAddress = /^0x[a-fA-F0-9]{40}$/;
const zero = /^0x0{40}$/i;

export const deployedTokenAddress = (token) => {
  const candidates = [
    token?.tokenAddress, token?.contractAddress, token?.proxyAddress,
    token?.contracts?.token, token?.deployment?.tokenAddress,
    token?.deployment?.contractAddress, token?.deployment?.contracts?.token,
  ];
  return candidates.find((value) => typeof value === 'string' && evmAddress.test(value)) || '';
};

export function getBotWalletReadiness({
  tokenUid, chainUid, contextMatches = true, tokenLoading = false,
  organizationLoading = false, organizationError = false,
  registeredAddress = '', onchainAddress = null, verificationPending = false,
  verificationFailed = false, canVerify = false,
} = {}) {
  if (tokenLoading || organizationLoading) return { code: 'checking', ready: false, label: 'Checking wallet' };
  if (organizationError) return { code: 'unknown', ready: false, label: 'Needs verification' };
  if (!tokenUid || !chainUid) return { code: 'no-token', ready: false, label: 'Select a token' };
  if (!contextMatches) return { code: 'wrong-network', ready: false, label: 'Check token network' };
  if (!evmAddress.test(registeredAddress) || zero.test(registeredAddress)) {
    return { code: 'missing', ready: false, label: 'Setup needed' };
  }
  if (!canVerify || verificationFailed) return { code: 'unknown', ready: false, label: 'Needs verification' };
  if (verificationPending || onchainAddress === null) return { code: 'checking', ready: false, label: 'Checking wallet' };
  if (onchainAddress.toLowerCase() !== registeredAddress.toLowerCase()) {
    return { code: 'mismatch', ready: false, label: 'Needs attention' };
  }
  return { code: 'verified', ready: true, label: 'Verified' };
}
