import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  createFallbackInvestorOptions,
  investorApi,
  mapInvestor,
  mapInvestorDocument,
  mapInvestorOptions,
  toCompliancePayload,
  toIdentityPayload,
} from '@/api/investor';
import { INITIAL_INVESTOR_STATE } from '@/constants/investor';
import { InvestorOnboardingContext } from '@/context/InvestorOnboardingContext';
import { useAuth } from '@/hooks/useAuth';
import {
  clearInvestorDraft,
  loadInvestorDraft,
  persistInvestorDraft,
  toDraftSafeState,
} from '@/services/investor/investorMockService';

const cloneInitialState = () => JSON.parse(JSON.stringify(INITIAL_INVESTOR_STATE));
const serialize = (state) => JSON.stringify(toDraftSafeState(state));
const timestamp = (value) => {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : 0;
};

const draftFingerprint = (payload) => JSON.stringify(payload);
const hasMeaningfulDraftValues = (payload) =>
  Object.entries(payload || {}).some(([key, value]) => {
    if (key === 'isDraft') return false;
    if (Array.isArray(value)) return value.length > 0;
    return value !== '' && value !== null && value !== undefined;
  });

const preserveBrowserDraft = (serverState, browserState) => {
  if (!browserState) return serverState;
  const serverSubmitted = String(serverState.backendStatus || '').toLowerCase() === 'submitted';
  if (serverSubmitted) return serverState;

  const browserIsNewer = timestamp(browserState.lastUpdated) > timestamp(serverState.lastUpdated);
  if (!browserIsNewer) {
    return {
      ...serverState,
      compliance: {
        ...serverState.compliance,
        rwaExperienceDescription:
          serverState.compliance.rwaExperienceDescription ||
          browserState.compliance?.rwaExperienceDescription ||
          '',
      },
    };
  }

  return {
    ...serverState,
    // Step completion is backend-authoritative. Only unsaved field values are recovered locally.
    currentStep: serverState.currentStep,
    highestStepReached: serverState.highestStepReached,
    identity: { ...serverState.identity, ...browserState.identity },
    documents: serverState.documents,
    compliance: {
      ...serverState.compliance,
      ...browserState.compliance,
      accreditationDocuments: serverState.compliance.accreditationDocuments,
    },
    lastUpdated: browserState.lastUpdated || serverState.lastUpdated,
  };
};

const withoutLegacyMockDocuments = (browserState) => ({
  ...browserState,
  documents: { ...browserState.documents, identityDocuments: [] },
  compliance: { ...browserState.compliance, accreditationDocuments: [] },
  investorProfile: cloneInitialState().investorProfile,
  investmentRequest: cloneInitialState().investmentRequest,
  // With no backend onboarding record, resume at step 1 and sync recovered text as a server draft.
  currentStep: 1,
  highestStepReached: 1,
});

export function InvestorOnboardingProvider({ children }) {
  const { user } = useAuth();
  const hydrationRef = useRef(null);
  if (!hydrationRef.current) {
    const hydration = loadInvestorDraft(user);
    if (!hydration.hasDraft && user?.name) {
      const nameParts = String(user.name).trim().split(/\s+/).filter(Boolean);
      hydration.draft.identity.firstName = nameParts[0] || '';
      hydration.draft.identity.lastName = nameParts.slice(1).join(' ');
    }
    hydrationRef.current = hydration;
  }

  const initialBrowserState = hydrationRef.current.draft;
  const stateRef = useRef(initialBrowserState);
  const optionsRef = useRef(createFallbackInvestorOptions());
  const identityDraftTimerRef = useRef(null);
  const complianceDraftTimerRef = useRef(null);
  const identityDraftPromiseRef = useRef(null);
  const complianceDraftPromiseRef = useRef(null);
  const identityDraftSnapshotRef = useRef('');
  const complianceDraftSnapshotRef = useRef('');

  const [state, setState] = useState(initialBrowserState);
  const [options, setOptions] = useState(optionsRef.current);
  const [lastSavedSnapshot, setLastSavedSnapshot] = useState(
    hydrationRef.current.hasDraft ? serialize(initialBrowserState) : serialize(cloneInitialState()),
  );
  const [savingDraft, setSavingDraft] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [savingIdentity, setSavingIdentity] = useState(false);
  const [savingCompliance, setSavingCompliance] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const commitState = useCallback((updater) => {
    const current = stateRef.current;
    const next = typeof updater === 'function' ? updater(current) : updater;
    stateRef.current = next;
    setState(next);
    return next;
  }, []);

  const commitPersistedState = useCallback((updater) => {
    const next = commitState(updater);
    try {
      // Persist only a sanitized recovery copy. Keep the live state untouched so backend IDs survive.
      persistInvestorDraft(next, user);
      setLastSavedSnapshot(serialize(next));
    } catch {
      // Browser storage is a fallback only; backend state remains usable without it.
    }
    return next;
  }, [commitState, user]);

  const replaceState = useCallback((nextState) => commitState(nextState), [commitState]);

  const patchState = useCallback((patch) => {
    commitState((current) => ({
      ...current,
      ...patch,
      lastUpdated: new Date().toISOString(),
    }));
  }, [commitState]);

  const updateSection = useCallback((section, values) => {
    commitState((current) => ({
      ...current,
      [section]: { ...current[section], ...values },
      lastUpdated: new Date().toISOString(),
    }));
  }, [commitState]);

  const setStep = useCallback((step, { markReached = true } = {}) => {
    commitState((current) => ({
      ...current,
      currentStep: step,
      highestStepReached: markReached ? Math.max(current.highestStepReached, step) : current.highestStepReached,
      lastUpdated: new Date().toISOString(),
    }));
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  }, [commitState]);

  const applyServerState = useCallback((rawInvestor, { mergeBrowserDraft = false } = {}) => {
    const mapped = mapInvestor(rawInvestor, optionsRef.current);
    identityDraftSnapshotRef.current = rawInvestor
      ? draftFingerprint(toIdentityPayload(mapped.identity, true))
      : '';
    complianceDraftSnapshotRef.current = rawInvestor
      ? draftFingerprint(toCompliancePayload(mapped.compliance, true))
      : '';

    const next = rawInvestor
      ? mergeBrowserDraft
        ? preserveBrowserDraft(mapped, stateRef.current)
        : {
            ...mapped,
            compliance: {
              ...mapped.compliance,
              rwaExperienceDescription:
                mapped.compliance.rwaExperienceDescription ||
                stateRef.current.compliance?.rwaExperienceDescription ||
                '',
            },
          }
      : withoutLegacyMockDocuments(stateRef.current);

    commitPersistedState(next);
    return next;
  }, [commitPersistedState]);

  const loadBackend = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const [rawOptions, rawInvestor] = await Promise.all([
        investorApi.getOptions(),
        investorApi.getMyInvestor(),
      ]);
      const mappedOptions = mapInvestorOptions(rawOptions);
      optionsRef.current = mappedOptions;
      setOptions(mappedOptions);
      applyServerState(rawInvestor, { mergeBrowserDraft: true });
      return rawInvestor;
    } catch (error) {
      setLoadError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [applyServerState]);

  useEffect(() => {
    loadBackend().catch(() => {});
  }, [loadBackend]);

  // Browser cache remains a fast recovery fallback, but it is never the source of truth for documents/status.
  useEffect(() => {
    if (isLoading || state.currentStep >= 6) return undefined;
    const snapshot = serialize(state);
    if (snapshot === lastSavedSnapshot) return undefined;

    const timer = window.setTimeout(() => {
      try {
        persistInvestorDraft(stateRef.current, user);
        setLastSavedSnapshot(serialize(stateRef.current));
      } catch {
        // The backend-saved progress remains authoritative if storage is unavailable.
      }
    }, 500);

    return () => window.clearTimeout(timer);
  }, [isLoading, lastSavedSnapshot, state, user]);

  // Save partial identity edits to the real backend, matching the backend's isDraft=true contract.
  useEffect(() => {
    if (isLoading || savingIdentity || state.currentStep !== 1) return undefined;
    const payload = toIdentityPayload(state.identity, true);
    const fingerprint = draftFingerprint(payload);
    if (!hasMeaningfulDraftValues(payload) || fingerprint === identityDraftSnapshotRef.current) {
      return undefined;
    }

    identityDraftTimerRef.current = window.setTimeout(() => {
      const promise = investorApi
        .saveIdentity(payload)
        .then(() => {
          identityDraftSnapshotRef.current = fingerprint;
        })
        .catch(() => {
          // Continue is the explicit validation boundary; keep local recovery if silent draft sync fails.
        })
        .finally(() => {
          if (identityDraftPromiseRef.current === promise) identityDraftPromiseRef.current = null;
        });
      identityDraftPromiseRef.current = promise;
      identityDraftTimerRef.current = null;
    }, 900);

    return () => {
      if (identityDraftTimerRef.current) {
        window.clearTimeout(identityDraftTimerRef.current);
        identityDraftTimerRef.current = null;
      }
    };
  }, [isLoading, savingIdentity, state.currentStep, state.identity]);

  // Compliance drafts are also persisted server-side; uploaded documents are already persisted immediately.
  useEffect(() => {
    if (isLoading || savingCompliance || state.currentStep !== 3) return undefined;
    const payload = toCompliancePayload(state.compliance, true);
    const fingerprint = draftFingerprint(payload);
    if (!hasMeaningfulDraftValues(payload) || fingerprint === complianceDraftSnapshotRef.current) {
      return undefined;
    }

    complianceDraftTimerRef.current = window.setTimeout(() => {
      const promise = investorApi
        .saveCompliance(payload)
        .then(() => {
          complianceDraftSnapshotRef.current = fingerprint;
        })
        .catch(() => {
          // Explicit Continue still reports backend validation/network errors to the user.
        })
        .finally(() => {
          if (complianceDraftPromiseRef.current === promise) complianceDraftPromiseRef.current = null;
        });
      complianceDraftPromiseRef.current = promise;
      complianceDraftTimerRef.current = null;
    }, 900);

    return () => {
      if (complianceDraftTimerRef.current) {
        window.clearTimeout(complianceDraftTimerRef.current);
        complianceDraftTimerRef.current = null;
      }
    };
  }, [isLoading, savingCompliance, state.currentStep, state.compliance]);

  const refreshFromServer = useCallback(async () => {
    const rawInvestor = await investorApi.getMyInvestor();
    return applyServerState(rawInvestor);
  }, [applyServerState]);

  const saveIdentity = useCallback(async (identity, isDraft = false) => {
    if (identityDraftTimerRef.current) {
      window.clearTimeout(identityDraftTimerRef.current);
      identityDraftTimerRef.current = null;
    }
    setSavingIdentity(true);
    try {
      if (identityDraftPromiseRef.current) await identityDraftPromiseRef.current;
      const payload = toIdentityPayload(identity, isDraft);
      await investorApi.saveIdentity(payload);
      identityDraftSnapshotRef.current = draftFingerprint(toIdentityPayload(identity, true));
      if (isDraft) return stateRef.current;
      return await refreshFromServer();
    } finally {
      setSavingIdentity(false);
    }
  }, [refreshFromServer]);

  const saveCompliance = useCallback(async (compliance, isDraft = false) => {
    if (complianceDraftTimerRef.current) {
      window.clearTimeout(complianceDraftTimerRef.current);
      complianceDraftTimerRef.current = null;
    }
    setSavingCompliance(true);
    try {
      if (complianceDraftPromiseRef.current) await complianceDraftPromiseRef.current;
      const payload = toCompliancePayload(compliance, isDraft);
      await investorApi.saveCompliance(payload);
      complianceDraftSnapshotRef.current = draftFingerprint(toCompliancePayload(compliance, true));
      if (isDraft) return stateRef.current;
      return await refreshFromServer();
    } finally {
      setSavingCompliance(false);
    }
  }, [refreshFromServer]);

  const uploadDocument = useCallback(async (documentTypeUid, file, onUploadProgress, signal) => {
    const uploaded = await investorApi.uploadDocuments(documentTypeUid, [file], onUploadProgress, signal);
    const rows = Array.isArray(uploaded) ? uploaded : uploaded ? [uploaded] : [];
    const mapped = rows.map((document) => mapInvestorDocument(document, optionsRef.current));
    if (!mapped.length) throw new Error('The upload completed but the backend returned no document record.');
    return mapped[0];
  }, []);

  const deleteDocument = useCallback(async (documentUid) => {
    await investorApi.deleteDocument(documentUid);
  }, []);

  const downloadDocument = useCallback((documentUid) => investorApi.downloadDocument(documentUid), []);

  const submitInvestor = useCallback(async (walletAddress) => {
    setSubmitting(true);
    try {
      const result = await investorApi.submit({ walletAddress });
      const fresh = await refreshFromServer();
      return { result, state: fresh };
    } finally {
      setSubmitting(false);
    }
  }, [refreshFromServer]);

  // Kept for the legacy hidden selfie step; this now saves only a local recovery snapshot.
  const saveDraft = useCallback(async (patch = {}) => {
    setSavingDraft(true);
    try {
      const current = stateRef.current;
      const nextState = {
        ...current,
        ...patch,
        identity: { ...current.identity, ...(patch.identity || {}) },
        documents: { ...current.documents, ...(patch.documents || {}) },
        compliance: { ...current.compliance, ...(patch.compliance || {}) },
        wallet: { ...current.wallet, ...(patch.wallet || {}) },
        lastUpdated: new Date().toISOString(),
      };
      commitPersistedState(nextState);
      return nextState;
    } finally {
      setSavingDraft(false);
    }
  }, [commitPersistedState]);

  const clearDraft = useCallback(() => {
    clearInvestorDraft(user);
    const fresh = cloneInitialState();
    stateRef.current = fresh;
    setState(fresh);
    setLastSavedSnapshot(serialize(fresh));
    setResetKey((current) => current + 1);
    toast.success('Local investor form cache cleared. Backend-saved progress was not deleted.');
  }, [user]);

  const markSubmitted = useCallback((nextState) => {
    const normalized = { ...nextState, currentStep: 6, highestStepReached: 6 };
    commitPersistedState(normalized);
  }, [commitPersistedState]);

  const isDirty = useMemo(() => serialize(state) !== lastSavedSnapshot, [lastSavedSnapshot, state]);
  const isSubmitted = String(state.backendStatus || state.investorProfile?.status || '').toLowerCase() === 'submitted';

  const value = useMemo(
    () => ({
      state,
      options,
      isLoading,
      loadError,
      reload: loadBackend,
      savingDraft,
      savingIdentity,
      savingCompliance,
      submitting,
      isSubmitted,
      isDirty,
      hydration: hydrationRef.current,
      resetKey,
      replaceState,
      patchState,
      updateSection,
      setStep,
      saveDraft,
      clearDraft,
      markSubmitted,
      saveIdentity,
      saveCompliance,
      uploadDocument,
      deleteDocument,
      downloadDocument,
      submitInvestor,
      refreshFromServer,
    }),
    [
      clearDraft,
      deleteDocument,
      downloadDocument,
      isDirty,
      isLoading,
      isSubmitted,
      loadBackend,
      loadError,
      markSubmitted,
      options,
      patchState,
      refreshFromServer,
      replaceState,
      resetKey,
      saveCompliance,
      saveDraft,
      saveIdentity,
      savingCompliance,
      savingDraft,
      savingIdentity,
      setStep,
      state,
      submitInvestor,
      submitting,
      updateSection,
      uploadDocument,
    ],
  );

  return (
    <InvestorOnboardingContext.Provider value={value}>
      {children}
    </InvestorOnboardingContext.Provider>
  );
}
