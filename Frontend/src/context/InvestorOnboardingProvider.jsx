import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { INITIAL_INVESTOR_STATE } from '@/constants/investor';
import { InvestorOnboardingContext } from '@/context/InvestorOnboardingContext';
import { useAuth } from '@/hooks/useAuth';
import {
  clearInvestorDraft,
  loadInvestorDraft,
  persistInvestorDraft,
  saveInvestorDraft,
  toDraftSafeState,
} from '@/services/investor';

const cloneInitialState = () => JSON.parse(JSON.stringify(INITIAL_INVESTOR_STATE));
const serialize = (state) => JSON.stringify(toDraftSafeState(state));

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
  const stateRef = useRef(hydrationRef.current.draft);
  const [state, setState] = useState(hydrationRef.current.draft);
  const [lastSavedSnapshot, setLastSavedSnapshot] = useState(
    hydrationRef.current.hasDraft ? serialize(hydrationRef.current.draft) : serialize(cloneInitialState()),
  );
  const [savingDraft, setSavingDraft] = useState(false);
  const [resetKey, setResetKey] = useState(0);

  useEffect(() => {
    if (state.investmentRequest.requestId && state.currentStep === 6) return undefined;
    const snapshot = serialize(state);
    if (snapshot === lastSavedSnapshot) return undefined;

    const timer = window.setTimeout(() => {
      try {
        const saved = persistInvestorDraft(stateRef.current, user);
        setLastSavedSnapshot(serialize(saved));
      } catch {
        // Keep the in-memory form state intact if browser storage is unavailable.
      }
    }, 500);

    return () => window.clearTimeout(timer);
  }, [lastSavedSnapshot, state, user]);

  const commitState = useCallback((updater) => {
    setState((current) => {
      const next = typeof updater === 'function' ? updater(current) : updater;
      stateRef.current = next;
      return next;
    });
  }, []);

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
      stateRef.current = nextState;
      setState(nextState);
      const saved = await saveInvestorDraft(nextState, user);
      stateRef.current = saved;
      setState(saved);
      setLastSavedSnapshot(serialize(saved));
      toast.success('Investor onboarding draft saved.');
      return saved;
    } catch (error) {
      toast.error(error.message || 'Unable to save the investor onboarding draft.');
      throw error;
    } finally {
      setSavingDraft(false);
    }
  }, [user]);

  const clearDraft = useCallback(() => {
    clearInvestorDraft(user);
    const fresh = cloneInitialState();
    stateRef.current = fresh;
    setState(fresh);
    setLastSavedSnapshot(serialize(fresh));
    setResetKey((current) => current + 1);
    toast.success('Investor onboarding draft cleared.');
  }, [user]);

  const markSubmitted = useCallback((nextState) => {
    const normalized = { ...nextState, currentStep: 6, highestStepReached: 6 };
    const persisted = persistInvestorDraft(normalized, user);
    stateRef.current = persisted;
    setState(persisted);
    setLastSavedSnapshot(serialize(persisted));
  }, [user]);

  const isDirty = useMemo(() => serialize(state) !== lastSavedSnapshot, [lastSavedSnapshot, state]);

  const value = useMemo(
    () => ({
      state,
      savingDraft,
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
    }),
    [clearDraft, isDirty, markSubmitted, patchState, replaceState, resetKey, saveDraft, savingDraft, setStep, state, updateSection],
  );

  return (
    <InvestorOnboardingContext.Provider value={value}>
      {children}
    </InvestorOnboardingContext.Provider>
  );
}

