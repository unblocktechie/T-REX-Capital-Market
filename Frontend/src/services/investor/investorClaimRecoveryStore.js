const STORAGE_KEY = 'trex_investor_claim_recovery_v1';

const isRecord = (record) =>
  record &&
  typeof record === 'object' &&
  String(record.interestId || '').trim() &&
  String(record.claimId || '').trim() &&
  /^0x[0-9a-fA-F]{64}$/.test(String(record.txHash || '').trim());

const readAll = () => {
  if (typeof window === 'undefined') return [];

  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter(isRecord) : [];
  } catch {
    return [];
  }
};

const writeAll = (records) => {
  if (typeof window === 'undefined') return;

  try {
    if (!records.length) {
      window.localStorage.removeItem(STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch {
    // Recovery storage is best-effort. The backend remains the source of truth.
  }
};

export const investorClaimRecoveryStore = Object.freeze({
  listAll() {
    return readAll();
  },

  list(interestId) {
    const normalizedInterestId = String(interestId || '').trim();
    return readAll().filter((record) => String(record.interestId) === normalizedInterestId);
  },

  get(interestId, claimId) {
    const normalizedInterestId = String(interestId || '').trim();
    const normalizedClaimId = String(claimId || '').trim();
    return readAll().find(
      (record) =>
        String(record.interestId) === normalizedInterestId &&
        String(record.claimId) === normalizedClaimId,
    ) || null;
  },

  upsert({ interestId, claimId, txHash, createdAt = new Date().toISOString() }) {
    const record = {
      interestId: String(interestId || '').trim(),
      claimId: String(claimId || '').trim(),
      txHash: String(txHash || '').trim(),
      createdAt,
    };

    if (!isRecord(record)) throw new Error('Invalid investor claim recovery record.');

    const records = readAll();
    const index = records.findIndex(
      (item) =>
        String(item.interestId) === record.interestId &&
        String(item.claimId) === record.claimId,
    );

    if (index >= 0) records[index] = record;
    else records.push(record);
    writeAll(records);
    return record;
  },

  remove(interestId, claimId) {
    const normalizedInterestId = String(interestId || '').trim();
    const normalizedClaimId = String(claimId || '').trim();
    writeAll(
      readAll().filter(
        (record) =>
          String(record.interestId) !== normalizedInterestId ||
          String(record.claimId) !== normalizedClaimId,
      ),
    );
  },
});
