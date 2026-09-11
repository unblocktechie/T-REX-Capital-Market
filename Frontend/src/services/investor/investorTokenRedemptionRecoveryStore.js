const STORAGE_PREFIX = 'trex:investor-token-redemption:v1:';

const storage = () => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

const clean = (value) => String(value ?? '').trim();
const keyFor = (interestUid) => `${STORAGE_PREFIX}${encodeURIComponent(clean(interestUid))}`;

export function loadInvestorTokenRedemptionRecovery(interestUid) {
  if (!interestUid) return null;
  try {
    const raw = storage()?.getItem(keyFor(interestUid));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      interestUid: clean(parsed.interestUid),
      tokenUid: clean(parsed.tokenUid),
      redemptionUid: clean(parsed.redemptionUid),
      tokenAmount: clean(parsed.tokenAmount),
      idempotencyKey: clean(parsed.idempotencyKey),
      createdAt: clean(parsed.createdAt),
    };
  } catch {
    return null;
  }
}

export function saveInvestorTokenRedemptionRecovery(interestUid, patch = {}) {
  if (!interestUid) return null;
  const current = loadInvestorTokenRedemptionRecovery(interestUid) || {};
  const next = {
    ...current,
    ...patch,
    interestUid: clean(interestUid),
    tokenUid: clean(patch.tokenUid ?? current.tokenUid),
    redemptionUid: clean(patch.redemptionUid ?? current.redemptionUid),
    tokenAmount: clean(patch.tokenAmount ?? current.tokenAmount),
    idempotencyKey: clean(patch.idempotencyKey ?? current.idempotencyKey),
    createdAt: clean(patch.createdAt ?? current.createdAt) || new Date().toISOString(),
  };

  try {
    storage()?.setItem(keyFor(interestUid), JSON.stringify(next));
  } catch {
    // Recovery is best-effort only; the backend remains authoritative.
  }
  return next;
}

export function clearInvestorTokenRedemptionRecovery(interestUid) {
  if (!interestUid) return;
  try {
    storage()?.removeItem(keyFor(interestUid));
  } catch {
    // Storage availability must never block redemption state recovery.
  }
}
