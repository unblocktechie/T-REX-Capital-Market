const documentFiles = new Map();

const DATABASE_NAME = 'trex-investor-document-preview';
const DATABASE_VERSION = 1;
const STORE_NAME = 'documents';
let databasePromise = null;

const canUseIndexedDb = () =>
  typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';

const openDatabase = () => {
  if (!canUseIndexedDb()) return Promise.resolve(null);
  if (databasePromise) return databasePromise;

  databasePromise = new Promise((resolve) => {
    try {
      const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          database.createObjectStore(STORE_NAME, { keyPath: 'documentId' });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });

  return databasePromise;
};

const runTransaction = async (mode, operation) => {
  const database = await openDatabase();
  if (!database) return null;

  return new Promise((resolve) => {
    try {
      const transaction = database.transaction(STORE_NAME, mode);
      const store = transaction.objectStore(STORE_NAME);
      const request = operation(store);

      request.onsuccess = () => resolve(request.result ?? true);
      request.onerror = () => resolve(null);
      transaction.onabort = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
};

const toStoredRecord = (documentId, file) => ({
  documentId: String(documentId),
  blob: file,
  name: String(file.name || 'investor-document'),
  type: String(file.type || 'application/octet-stream'),
  lastModified: Number(file.lastModified) || Date.now(),
  storedAt: new Date().toISOString(),
});

const toFile = (record) => {
  if (!record?.blob) return null;
  if (record.blob instanceof File) return record.blob;

  try {
    return new File([record.blob], record.name || 'investor-document', {
      type: record.type || record.blob.type || 'application/octet-stream',
      lastModified: Number(record.lastModified) || Date.now(),
    });
  } catch {
    return record.blob;
  }
};

export const setInvestorDocumentFile = (documentId, file) => {
  if (!documentId || !(file instanceof Blob)) return Promise.resolve(false);
  const id = String(documentId);
  documentFiles.set(id, file);

  // Keep the original file bytes in IndexedDB so review previews survive route
  // changes and browser refreshes without putting large files in localStorage.
  return runTransaction('readwrite', (store) => store.put(toStoredRecord(id, file)));
};

export const getInvestorDocumentFile = (documentId) =>
  documentId ? documentFiles.get(String(documentId)) || null : null;

export const loadInvestorDocumentFile = async (documentId) => {
  if (!documentId) return null;
  const id = String(documentId);
  const inMemoryFile = documentFiles.get(id);
  if (inMemoryFile) return inMemoryFile;

  const record = await runTransaction('readonly', (store) => store.get(id));
  const restoredFile = toFile(record);
  if (restoredFile) documentFiles.set(id, restoredFile);
  return restoredFile;
};

export const removeInvestorDocumentFile = (documentId) => {
  if (!documentId) return;
  const id = String(documentId);
  documentFiles.delete(id);
  void runTransaction('readwrite', (store) => store.delete(id));
};
