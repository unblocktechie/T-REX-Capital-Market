const STORAGE_PREFIX = 'trex:investor-token-transfer:v1:';

const storage = () => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

const clean = (value) => String(value ?? '').trim();
const keyFor = (interestUid) => `${STORAGE_PREFIX}${encodeURIComponent(clean(interestUid))}`;

const normalizeTransactionRequest = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const args = Array.isArray(value.args) ? value.args.map((item) => String(item ?? '')) : [];
  return {
    contractAddress: clean(value.contractAddress),
    functionName: clean(value.functionName),
    args,
    from: clean(value.from),
    chainId: Number(value.chainId) || 0,
  };
};

export function loadInvestorTokenTransferRecovery(interestUid) {
  if (!interestUid) return null;
  try {
    const raw = storage()?.getItem(keyFor(interestUid));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      interestUid: clean(parsed.interestUid),
      tokenUid: clean(parsed.tokenUid),
      transferUid: clean(parsed.transferUid),
      recipientWalletAddress: clean(parsed.recipientWalletAddress),
      tokenAmount: clean(parsed.tokenAmount),
      idempotencyKey: clean(parsed.idempotencyKey),
      txHash: clean(parsed.txHash),
      status: clean(parsed.status).toUpperCase(),
      transactionRequest: normalizeTransactionRequest(parsed.transactionRequest),
      createdAt: clean(parsed.createdAt),
    };
  } catch {
    return null;
  }
}

export function saveInvestorTokenTransferRecovery(interestUid, patch = {}) {
  if (!interestUid) return null;
  const current = loadInvestorTokenTransferRecovery(interestUid) || {};
  const next = {
    ...current,
    ...patch,
    interestUid: clean(interestUid),
    tokenUid: clean(patch.tokenUid ?? current.tokenUid),
    transferUid: clean(patch.transferUid ?? current.transferUid),
    recipientWalletAddress: clean(patch.recipientWalletAddress ?? current.recipientWalletAddress),
    tokenAmount: clean(patch.tokenAmount ?? current.tokenAmount),
    idempotencyKey: clean(patch.idempotencyKey ?? current.idempotencyKey),
    txHash: clean(patch.txHash ?? current.txHash),
    status: clean(patch.status ?? current.status).toUpperCase(),
    transactionRequest: normalizeTransactionRequest(patch.transactionRequest ?? current.transactionRequest),
    createdAt: clean(patch.createdAt ?? current.createdAt) || new Date().toISOString(),
  };

  try {
    storage()?.setItem(keyFor(interestUid), JSON.stringify(next));
  } catch {
    // Recovery storage is best-effort only. The transfer intent remains durable on the server.
  }
  return next;
}

export function clearInvestorTokenTransferRecovery(interestUid) {
  if (!interestUid) return;
  try {
    storage()?.removeItem(keyFor(interestUid));
  } catch {
    // Storage availability must never block the transfer flow.
  }
}
