import { isValidTransactionHash } from '@/utils/transactionHash';

const STORAGE_KEY = 'trex_issuer_registry_recovery_v1';
const VERSION = 1;
const TTL_MS = 30 * 24 * 60 * 60 * 1000;

const text = (value) => String(value ?? '').trim();

export const getIssuerRegistryRecoveryUserKey = (user) =>
  text(user?.userUid || user?.uid || user?.id || user?.email).toLowerCase();

const getStorage = () => {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

const normalizeRecord = (value) => {
  if (!value || typeof value !== 'object' || Number(value.version) !== VERSION) return null;

  const userKey = text(value.userKey).toLowerCase();
  const interestUid = text(value.interestUid);
  const registryOperationId = text(value.registryOperationId);
  const txHash = text(value.txHash);
  const chainId = Number(value.chainId);
  const createdAt = Number(value.createdAt);
  const updatedAt = Number(value.updatedAt || value.createdAt);
  const expiresAt = Number(value.expiresAt);

  if (
    !userKey ||
    !interestUid ||
    !registryOperationId ||
    !isValidTransactionHash(txHash) ||
    !Number.isSafeInteger(chainId) ||
    chainId <= 0 ||
    !Number.isFinite(createdAt) ||
    !Number.isFinite(updatedAt) ||
    !Number.isFinite(expiresAt) ||
    expiresAt <= Date.now()
  ) {
    return null;
  }

  return {
    version: VERSION,
    userKey,
    interestUid,
    registryOperationId,
    txHash,
    chainId,
    createdAt,
    updatedAt,
    expiresAt,
  };
};

const readAll = () => {
  const storage = getStorage();
  if (!storage) return [];

  try {
    const raw = JSON.parse(storage.getItem(STORAGE_KEY) || '[]');
    const source = Array.isArray(raw) ? raw : [];
    const records = source.map(normalizeRecord).filter(Boolean);

    if (records.length !== source.length) {
      if (records.length) storage.setItem(STORAGE_KEY, JSON.stringify(records));
      else storage.removeItem(STORAGE_KEY);
    }

    return records;
  } catch {
    return [];
  }
};

const writeAll = (records) => {
  const storage = getStorage();
  if (!storage) {
    throw new Error('Local recovery storage is unavailable in this browser.');
  }

  const normalized = records.map(normalizeRecord).filter(Boolean);
  if (!normalized.length) {
    storage.removeItem(STORAGE_KEY);
    return;
  }
  storage.setItem(STORAGE_KEY, JSON.stringify(normalized));
};

export const issuerRegistryRecoveryStore = Object.freeze({
  listAll() {
    return readAll();
  },

  listForUser(user) {
    const userKey = getIssuerRegistryRecoveryUserKey(user);
    if (!userKey) return [];
    return readAll().filter((record) => record.userKey === userKey);
  },

  getForUser(user, interestUid) {
    const userKey = getIssuerRegistryRecoveryUserKey(user);
    const normalizedInterestUid = text(interestUid);
    if (!userKey || !normalizedInterestUid) return null;
    return readAll().find(
      (record) => record.userKey === userKey && record.interestUid === normalizedInterestUid,
    ) || null;
  },

  upsert({ user, userKey, interestUid, registryOperationId, txHash, chainId }) {
    const normalizedUserKey = text(userKey || getIssuerRegistryRecoveryUserKey(user)).toLowerCase();
    const normalizedInterestUid = text(interestUid);
    const existing = readAll().find(
      (record) => record.userKey === normalizedUserKey && record.interestUid === normalizedInterestUid,
    );
    const now = Date.now();
    const record = normalizeRecord({
      version: VERSION,
      userKey: normalizedUserKey,
      interestUid: normalizedInterestUid,
      registryOperationId: text(registryOperationId),
      txHash: text(txHash),
      chainId: Number(chainId),
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      expiresAt: now + TTL_MS,
    });

    if (!record) throw new Error('The registry recovery record is invalid.');

    const records = readAll();
    const index = records.findIndex(
      (item) => item.userKey === record.userKey && item.interestUid === record.interestUid,
    );
    if (index >= 0) records[index] = record;
    else records.push(record);
    writeAll(records);
    return record;
  },

  removeForUser(user, interestUid, txHash = '') {
    const userKey = getIssuerRegistryRecoveryUserKey(user);
    const normalizedInterestUid = text(interestUid);
    const normalizedTxHash = text(txHash).toLowerCase();
    if (!userKey || !normalizedInterestUid) return false;

    const records = readAll();
    const next = records.filter((record) => {
      if (record.userKey !== userKey || record.interestUid !== normalizedInterestUid) return true;
      if (normalizedTxHash && record.txHash.toLowerCase() !== normalizedTxHash) return true;
      return false;
    });

    if (next.length === records.length) return false;
    try {
      writeAll(next);
      return true;
    } catch {
      return false;
    }
  },
});
