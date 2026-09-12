const PREFIX = 'trex:token-price-sync:v1:';

const clean = (value) => String(value ?? '').trim();
const storage = () => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};
const keyFor = (tokenAddress) => `${PREFIX}${clean(tokenAddress).toLowerCase()}`;

export function loadTokenPriceSyncRecovery(tokenAddress) {
  if (!clean(tokenAddress)) return null;
  try {
    const raw = storage()?.getItem(keyFor(tokenAddress));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      tokenAddress: clean(parsed.tokenAddress),
      currentTokenPrice: clean(parsed.currentTokenPrice),
      txHash: clean(parsed.txHash),
      createdAt: clean(parsed.createdAt),
    };
  } catch {
    return null;
  }
}

export function saveTokenPriceSyncRecovery(tokenAddress, values = {}) {
  const address = clean(tokenAddress);
  if (!address) return null;
  const next = {
    tokenAddress: address,
    currentTokenPrice: clean(values.currentTokenPrice),
    txHash: clean(values.txHash),
    createdAt: clean(values.createdAt) || new Date().toISOString(),
  };
  try {
    storage()?.setItem(keyFor(address), JSON.stringify(next));
  } catch {
    // A failed browser storage write must never undo an already-confirmed price update.
  }
  return next;
}

export function clearTokenPriceSyncRecovery(tokenAddress) {
  if (!clean(tokenAddress)) return;
  try {
    storage()?.removeItem(keyFor(tokenAddress));
  } catch {
    // Best-effort cleanup only.
  }
}
