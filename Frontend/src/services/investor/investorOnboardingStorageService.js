import { INVESTOR_DRAFT_STORAGE_KEY } from '@/constants/investor';

export const INVESTOR_ONBOARDING_STATUSES = Object.freeze({
  NOT_STARTED: 'NOT_STARTED',
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
});

export const INVESTOR_ONBOARDING_CHANGED_EVENT = 'trex:investor-onboarding-changed';

const memoryRecords = new Map();

const canUseStorage = () => {
  try {
    return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
  } catch {
    return false;
  }
};

const sanitizeOwnerKey = (value) =>
  encodeURIComponent(String(value || 'anonymous').trim().toLowerCase());

export const getInvestorStorageOwner = (user) =>
  sanitizeOwnerKey(user?.userUid || user?.id || user?.email || 'anonymous');

export const getInvestorDraftStorageKey = (user) =>
  `${INVESTOR_DRAFT_STORAGE_KEY}.${getInvestorStorageOwner(user)}`;

export const getInvestorOnboardingStatus = (state) => {
  const profileStatus = String(state?.investorProfile?.status || '').toLowerCase();

  if (profileStatus === 'approved') return INVESTOR_ONBOARDING_STATUSES.APPROVED;
  if (profileStatus === 'rejected') return INVESTOR_ONBOARDING_STATUSES.REJECTED;
  if (state?.investmentRequest?.requestId || Number(state?.currentStep) >= 6) {
    return INVESTOR_ONBOARDING_STATUSES.SUBMITTED;
  }

  const hasStarted =
    Number(state?.highestStepReached) > 1 ||
    Number(state?.currentStep) > 1 ||
    Boolean(state?.lastUpdated) ||
    Object.values(state?.identity || {}).some(Boolean) ||
    Boolean(state?.documents?.identityDocuments?.length) ||
    Object.values(state?.compliance || {}).some((value) =>
      Array.isArray(value) ? value.length > 0 : Boolean(value),
    );

  return hasStarted
    ? INVESTOR_ONBOARDING_STATUSES.DRAFT
    : INVESTOR_ONBOARDING_STATUSES.NOT_STARTED;
};

export const isInvestorWorkspaceUnlocked = (stateOrStatus) => {
  const status =
    typeof stateOrStatus === 'string'
      ? stateOrStatus
      : getInvestorOnboardingStatus(stateOrStatus);

  return [
    INVESTOR_ONBOARDING_STATUSES.SUBMITTED,
    INVESTOR_ONBOARDING_STATUSES.APPROVED,
    INVESTOR_ONBOARDING_STATUSES.REJECTED,
  ].includes(status);
};

export const notifyInvestorOnboardingChanged = (user) => {
  if (typeof window === 'undefined') return;
  const event =
    typeof CustomEvent === 'function'
      ? new CustomEvent(INVESTOR_ONBOARDING_CHANGED_EVENT, {
          detail: { owner: getInvestorStorageOwner(user) },
        })
      : new Event(INVESTOR_ONBOARDING_CHANGED_EVENT);
  window.dispatchEvent(event);
};

export const readInvestorOnboardingRaw = (user) => {
  const scopedKey = getInvestorDraftStorageKey(user);
  if (memoryRecords.has(scopedKey)) return memoryRecords.get(scopedKey);
  if (!canUseStorage()) return null;

  try {
    const scopedValue = window.localStorage.getItem(scopedKey);
    if (scopedValue) {
      memoryRecords.set(scopedKey, scopedValue);
      return scopedValue;
    }

    // Migrate the original unscoped draft once so existing onboarding progress is not lost.
    const legacyValue = window.localStorage.getItem(INVESTOR_DRAFT_STORAGE_KEY);
    if (!legacyValue) return null;

    window.localStorage.setItem(scopedKey, legacyValue);
    window.localStorage.removeItem(INVESTOR_DRAFT_STORAGE_KEY);
    memoryRecords.set(scopedKey, legacyValue);
    return legacyValue;
  } catch {
    return null;
  }
};

export const writeInvestorOnboardingRaw = (user, value) => {
  const storageKey = getInvestorDraftStorageKey(user);
  memoryRecords.set(storageKey, value);
  try {
    if (canUseStorage()) window.localStorage.setItem(storageKey, value);
  } catch {
    // Keep the in-memory state active for the current browser session.
  }
  notifyInvestorOnboardingChanged(user);
};

export const removeInvestorOnboardingRaw = (user) => {
  const storageKey = getInvestorDraftStorageKey(user);
  memoryRecords.delete(storageKey);
  try {
    if (canUseStorage()) window.localStorage.removeItem(storageKey);
  } catch {
    // Storage may be unavailable in privacy-restricted browser modes.
  }
  notifyInvestorOnboardingChanged(user);
};
