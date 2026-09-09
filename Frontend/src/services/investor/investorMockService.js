import {
  IDENTITY_DOCUMENT_TYPES,
  INITIAL_INVESTOR_STATE,
  INVESTOR_FLOW_VERSION,
  INVESTOR_FAILURE_STORAGE_KEY,
} from '@/constants/investor';
import { createLocalId } from '@/utils/createLocalId';
import {
  readInvestorOnboardingRaw,
  removeInvestorOnboardingRaw,
  writeInvestorOnboardingRaw,
} from './investorOnboardingStorageService';

const wait = (milliseconds) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));
const randomDelay = (minimum, maximum) => Math.round(minimum + Math.random() * (maximum - minimum));

const cloneInitialState = () => JSON.parse(JSON.stringify(INITIAL_INVESTOR_STATE));
const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const normalizeStep = (step, flowVersion) => {
  const parsed = Math.max(1, Number(step) || 1);
  if (Number(flowVersion) >= INVESTOR_FLOW_VERSION) return Math.min(6, parsed);
  if (parsed <= 2) return parsed;
  return Math.min(6, Math.max(3, parsed - 1));
};

const normalizeFileMetadata = (file) => {
  if (!file || typeof file !== 'object') return null;
  const persistedStatus = file.status === 'success' || file.status === 'verified' ? file.status : 'error';
  return {
    id: String(file.id || createLocalId('investor-file')),
    name: String(file.name || 'Uploaded document'),
    size: Number(file.size) || 0,
    type: String(file.type || 'application/octet-stream'),
    documentType: file.documentType ? String(file.documentType) : '',
    documentTypeLabel: file.documentTypeLabel ? String(file.documentTypeLabel) : '',
    status: persistedStatus,
    progress: persistedStatus === 'error' ? 0 : 100,
    uploadedAt: String(file.uploadedAt || new Date().toISOString()),
  };
};

const getIdentityDocumentLabel = (documentType) =>
  IDENTITY_DOCUMENT_TYPES.find((option) => option.value === documentType)?.label || documentType || 'Identity Document';

const normalizeIdentityDocuments = (documents) => {
  if (Array.isArray(documents.identityDocuments)) {
    return documents.identityDocuments
      .map(normalizeFileMetadata)
      .filter(Boolean)
      .map((file) => ({
        ...file,
        documentTypeLabel: file.documentTypeLabel || getIdentityDocumentLabel(file.documentType),
      }));
  }

  const legacyFile = normalizeFileMetadata(documents.identityDocument);
  if (!legacyFile) return [];
  const documentType = String(documents.identityDocumentType || legacyFile.documentType || '');
  return [{
    ...legacyFile,
    documentType,
    documentTypeLabel: legacyFile.documentTypeLabel || getIdentityDocumentLabel(documentType),
  }];
};

const normalizeDraft = (value) => {
  const base = cloneInitialState();
  if (!isRecord(value)) return base;
  ['identity', 'documents', 'compliance', 'wallet', 'investorProfile', 'investmentRequest'].forEach((section) => {
    if (value[section] !== undefined && !isRecord(value[section])) {
      throw new Error(`Invalid investor draft section: ${section}`);
    }
  });
  const documents = { ...(value.documents || {}) };
  const identity = { ...(value.identity || {}) };
  delete identity.nationality;
  const identityDocuments = normalizeIdentityDocuments(documents);
  delete documents.selfie;
  delete documents.selfieVerificationStatus;
  delete documents.identityDocumentType;
  delete documents.identityDocument;
  delete documents.identityDocuments;

  return {
    ...base,
    ...value,
    flowVersion: INVESTOR_FLOW_VERSION,
    currentStep: normalizeStep(value.currentStep, value.flowVersion),
    highestStepReached: normalizeStep(value.highestStepReached, value.flowVersion),
    identity: { ...base.identity, ...identity },
    documents: {
      ...base.documents,
      ...documents,
      identityDocuments,
    },
    compliance: {
      ...base.compliance,
      ...(value.compliance || {}),
      investmentCategories: Array.isArray(value.compliance?.investmentCategories)
        ? value.compliance.investmentCategories.map(String)
        : [],
      accreditationDocuments: Array.isArray(value.compliance?.accreditationDocuments)
        ? value.compliance.accreditationDocuments.map(normalizeFileMetadata).filter(Boolean)
        : [],
    },
    wallet: { ...base.wallet, ...(value.wallet || {}) },
    investorProfile: { ...base.investorProfile, ...(value.investorProfile || {}) },
    investmentRequest: { ...base.investmentRequest, ...(value.investmentRequest || {}) },
  };
};

export const toDraftSafeState = (state) => normalizeDraft(state);

export const loadInvestorDraft = (user) => {
  try {
    const raw = readInvestorOnboardingRaw(user);
    if (!raw) return { draft: cloneInitialState(), corrupted: false, hasDraft: false };
    const parsed = JSON.parse(raw);
    if (!isRecord(parsed)) throw new Error('Invalid investor draft payload.');
    return { draft: normalizeDraft(parsed), corrupted: false, hasDraft: true };
  } catch {
    removeInvestorOnboardingRaw(user);
    return { draft: cloneInitialState(), corrupted: true, hasDraft: false };
  }
};

export const persistInvestorDraft = (state, user) => {
  const next = toDraftSafeState(state);
  writeInvestorOnboardingRaw(user, JSON.stringify(next));
  return next;
};

export const saveInvestorDraft = async (state, user) => {
  await wait(randomDelay(400, 700));
  return persistInvestorDraft({ ...state, lastUpdated: new Date().toISOString() }, user);
};

export const clearInvestorDraft = (user) => {
  removeInvestorOnboardingRaw(user);
};

export const configureNextMockFailure = (action) => {
  window.sessionStorage.setItem(INVESTOR_FAILURE_STORAGE_KEY, action);
};

export const consumeMockFailure = (action) => {
  const configured = window.sessionStorage.getItem(INVESTOR_FAILURE_STORAGE_KEY);
  if (configured !== action) return false;
  window.sessionStorage.removeItem(INVESTOR_FAILURE_STORAGE_KEY);
  return true;
};
