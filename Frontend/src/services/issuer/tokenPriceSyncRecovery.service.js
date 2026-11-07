// A saved PENDING intent must survive navigation even before MetaMask broadcasts.
// Store only public intent metadata/transaction references, never wallet secrets.
const PREFIX = 'trex:token-price-intent:v3:';
const clean = (value) => String(value ?? '').trim();
const HASH = /^0x[0-9a-fA-F]{64}$/;
const storage = () => {
  try { return window.localStorage; } catch { return null; }
};
const keyFor = (tokenAddress, chainUid, userKey) =>
  `${PREFIX}${encodeURIComponent(clean(userKey))}:${encodeURIComponent(clean(chainUid))}:${clean(tokenAddress).toLowerCase()}`;

export function loadTokenPriceSyncRecovery(tokenAddress, { chainUid, userKey } = {}) {
  if (!clean(tokenAddress) || !clean(chainUid) || !clean(userKey)) return null;
  try {
    const raw = storage()?.getItem(keyFor(tokenAddress, chainUid, userKey));
    if (!raw) return null;
    const saved = JSON.parse(raw);
    if (!saved || typeof saved !== 'object' || !clean(saved.priceUpdateUid)) return null;
    if (clean(saved.chainUid) !== clean(chainUid) || clean(saved.userKey) !== clean(userKey)) return null;
    if (clean(saved.tokenAddress).toLowerCase() !== clean(tokenAddress).toLowerCase()) return null;
    if (saved.txHash && !HASH.test(clean(saved.txHash))) return null;
    return saved;
  } catch { return null; }
}

export function saveTokenPriceSyncRecovery(tokenAddress, values = {}) {
  const token = clean(tokenAddress);
  const chainUid = clean(values.chainUid);
  const userKey = clean(values.userKey);
  const priceUpdateUid = clean(values.priceUpdateUid);
  if (!token || !chainUid || !userKey || !priceUpdateUid || !clean(values.currentTokenPrice)) {
    throw new Error('Saved request ID, price, original chain, and issuer are required.');
  }
  if (values.txHash && !HASH.test(clean(values.txHash))) throw new Error('Invalid saved transaction hash.');
  const next = {
    tokenAddress: token,
    chainUid, userKey, priceUpdateUid,
    currentTokenPrice: clean(values.currentTokenPrice),
    status: clean(values.status) || 'PENDING',
    txHash: clean(values.txHash),
    // Only a BACKEND-reported mismatch pauses automatic retries. Older versions stored
    // client-only RPC inspection errors which must be verified by PATCH.
    verificationIssue: ['INVALID_PRICE_TRANSACTION_TARGET', 'INVALID_PRICE_TRANSACTION_DETAILS'].includes(clean(values.verificationIssue))
      ? clean(values.verificationIssue) : '',
    verificationIssueSource: clean(values.verificationIssueSource) === 'backend' ? 'backend' : '',
    // Mark opening of the wallet before the wallet prompt. If the page closes or
    // the provider errors after broadcast but before returning a hash, a PENDING
    // backend row is NOT evidence that it is safe to sign or cancel again.
    walletSubmissionStartedAt: clean(values.walletSubmissionStartedAt),
    // An explicit wallet rejection allows cancellation but must never expose
    // a second signing action for the same saved request.
    walletRejectedAt: clean(values.walletRejectedAt),
    // The issuer may approve only once per prepared intent. Even if the
    // wallet preflight fails, a second approval attempt is not offered.
    walletApprovalAttemptedAt: clean(values.walletApprovalAttemptedAt),
    transactionRequest: values.transactionRequest || null,
    chainId: values.chainId ?? null,
    issuerWalletAddress: clean(values.issuerWalletAddress),
    controllerAddress: clean(values.controllerAddress),
    tokenUid: clean(values.tokenUid),
    createdAt: clean(values.createdAt) || new Date().toISOString(),
  };
  try { storage()?.setItem(keyFor(token, chainUid, userKey), JSON.stringify(next)); } catch { /* best effort */ }
  return next;
}

export function clearTokenPriceSyncRecovery(tokenAddress, { chainUid, userKey } = {}) {
  if (!clean(tokenAddress) || !clean(chainUid) || !clean(userKey)) return;
  try { storage()?.removeItem(keyFor(tokenAddress, chainUid, userKey)); } catch { /* best effort */ }
}

// Legacy saved client-side inspections are not authoritative. Retrying PATCH
// with a saved hash is safe: no MetaMask prompt and no new blockchain send.
export function hasBackendPriceVerificationRejection(pending) {
  return pending?.verificationIssueSource === 'backend' &&
    ['INVALID_PRICE_TRANSACTION_TARGET', 'INVALID_PRICE_TRANSACTION_DETAILS'].includes(pending?.verificationIssue);
}
