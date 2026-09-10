const STORAGE_PREFIX = 'trex:investor-token-purchase:v1:';

const storage = () => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

const keyFor = (interestUid) => `${STORAGE_PREFIX}${encodeURIComponent(String(interestUid || '').trim())}`;

const clean = (value) => String(value || '').trim();

export function loadInvestorTokenPurchaseRecovery(interestUid) {
  if (!interestUid) return null;
  try {
    const raw = storage()?.getItem(keyFor(interestUid));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      interestUid: clean(parsed.interestUid),
      tokenUid: clean(parsed.tokenUid),
      purchaseUid: clean(parsed.purchaseUid),
      tokenAmount: clean(parsed.tokenAmount),
      idempotencyKey: clean(parsed.idempotencyKey),
      txHash: clean(parsed.txHash),
      paymentAttemptStarted: parsed.paymentAttemptStarted === true,
      paymentReceiptConfirmed: parsed.paymentReceiptConfirmed === true,
      hadTokenBalanceBeforePurchase: typeof parsed.hadTokenBalanceBeforePurchase === 'boolean'
        ? parsed.hadTokenBalanceBeforePurchase
        : null,
      createdAt: clean(parsed.createdAt),
    };
  } catch {
    return null;
  }
}

export function saveInvestorTokenPurchaseRecovery(interestUid, patch = {}) {
  if (!interestUid) return null;
  const current = loadInvestorTokenPurchaseRecovery(interestUid) || {};
  const next = {
    ...current,
    ...patch,
    interestUid: clean(interestUid),
    tokenUid: clean(patch.tokenUid ?? current.tokenUid),
    purchaseUid: clean(patch.purchaseUid ?? current.purchaseUid),
    tokenAmount: clean(patch.tokenAmount ?? current.tokenAmount),
    idempotencyKey: clean(patch.idempotencyKey ?? current.idempotencyKey),
    txHash: clean(patch.txHash ?? current.txHash),
    paymentAttemptStarted: patch.paymentAttemptStarted === undefined
      ? current.paymentAttemptStarted === true
      : patch.paymentAttemptStarted === true,
    paymentReceiptConfirmed: patch.paymentReceiptConfirmed === undefined
      ? current.paymentReceiptConfirmed === true
      : patch.paymentReceiptConfirmed === true,
    hadTokenBalanceBeforePurchase: typeof patch.hadTokenBalanceBeforePurchase === 'boolean'
      ? patch.hadTokenBalanceBeforePurchase
      : (typeof current.hadTokenBalanceBeforePurchase === 'boolean'
        ? current.hadTokenBalanceBeforePurchase
        : null),
    createdAt: clean(patch.createdAt ?? current.createdAt) || new Date().toISOString(),
  };

  try {
    storage()?.setItem(keyFor(interestUid), JSON.stringify(next));
  } catch {
    // Recovery storage is best-effort only. Server state remains authoritative.
  }
  return next;
}

export function clearInvestorTokenPurchaseRecovery(interestUid) {
  if (!interestUid) return;
  try {
    storage()?.removeItem(keyFor(interestUid));
  } catch {
    // No-op: storage availability must never break the purchase UI.
  }
}
