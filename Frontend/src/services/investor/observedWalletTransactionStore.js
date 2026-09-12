const STORAGE_KEY = 'trex:observed-wallet-transactions:v1';
const clean = (value) => String(value ?? '').trim();
const hashOk = (value) => /^0x[a-fA-F0-9]{64}$/.test(clean(value));

const storage = () => {
  try { return window.localStorage; } catch { return null; }
};

const readAll = () => {
  try {
    const raw = storage()?.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
};

const writeAll = (rows) => {
  try { storage()?.setItem(STORAGE_KEY, JSON.stringify(rows.slice(-50))); } catch { /* best effort only */ }
};

export function saveObservedWalletTransaction({ chainId, txHash, tokenUid, expectedAction, interestUid = '', redemptionUid = '' }) {
  const hash = clean(txHash);
  const action = clean(expectedAction).toUpperCase();
  if (!hashOk(hash) || !tokenUid || !['INVEST', 'TRANSFER', 'REDEMPTION'].includes(action)) return null;
  const row = {
    chainId: Number(chainId),
    txHash: hash,
    tokenUid: clean(tokenUid),
    expectedAction: action,
    interestUid: clean(interestUid),
    redemptionUid: clean(redemptionUid),
    observedAt: new Date().toISOString(),
  };
  const key = `${row.chainId}:${hash.toLowerCase()}:${action}`;
  const next = readAll().filter((item) => `${Number(item.chainId)}:${clean(item.txHash).toLowerCase()}:${clean(item.expectedAction).toUpperCase()}` !== key);
  next.push(row);
  writeAll(next);
  return row;
}

export function listObservedWalletTransactions({ tokenUid, expectedAction, interestUid } = {}) {
  const token = clean(tokenUid);
  const action = clean(expectedAction).toUpperCase();
  const interest = clean(interestUid);
  return readAll().filter((item) => (
    (!token || clean(item.tokenUid) === token)
    && (!action || clean(item.expectedAction).toUpperCase() === action)
    && (!interest || clean(item.interestUid) === interest)
    && hashOk(item.txHash)
  ));
}

export function clearObservedWalletTransaction({ chainId, txHash, expectedAction }) {
  const hash = clean(txHash).toLowerCase();
  const action = clean(expectedAction).toUpperCase();
  const next = readAll().filter((item) => !(
    Number(item.chainId) === Number(chainId)
    && clean(item.txHash).toLowerCase() === hash
    && clean(item.expectedAction).toUpperCase() === action
  ));
  writeAll(next);
}

export function clearObservedWalletTransactionsForToken(tokenUid, expectedAction = '') {
  const token = clean(tokenUid);
  const action = clean(expectedAction).toUpperCase();
  writeAll(readAll().filter((item) => !(
    clean(item.tokenUid) === token && (!action || clean(item.expectedAction).toUpperCase() === action)
  )));
}
