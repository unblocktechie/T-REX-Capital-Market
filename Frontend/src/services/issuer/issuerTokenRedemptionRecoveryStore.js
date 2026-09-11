const PREFIX = 'trex:issuer-redemption-payment:v1:';
const clean = (value) => String(value || '').trim();

export function loadIssuerRedemptionPaymentRecovery(redemptionUid) {
  const uid = clean(redemptionUid);
  if (!uid) return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(`${PREFIX}${uid}`) || 'null');
    if (!parsed || typeof parsed !== 'object') return null;
    return { txHash: clean(parsed.txHash), savedAt: clean(parsed.savedAt) };
  } catch {
    return null;
  }
}

export function saveIssuerRedemptionPaymentRecovery(redemptionUid, txHash) {
  const uid = clean(redemptionUid);
  const hash = clean(txHash);
  if (!uid || !hash) return;
  try {
    window.localStorage.setItem(`${PREFIX}${uid}`, JSON.stringify({ txHash: hash, savedAt: new Date().toISOString() }));
  } catch {
    // Storage availability must never block a payment confirmation attempt.
  }
}

export function clearIssuerRedemptionPaymentRecovery(redemptionUid) {
  const uid = clean(redemptionUid);
  if (!uid) return;
  try {
    window.localStorage.removeItem(`${PREFIX}${uid}`);
  } catch {
    // Ignore unavailable storage.
  }
}
