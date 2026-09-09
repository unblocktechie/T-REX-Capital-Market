import { useCallback, useEffect, useMemo, useState } from 'react';
import { INITIAL_INVESTOR_STATE } from '@/constants/investor';
import { loadInvestorDraft } from '@/services/investor/investorMockService';
import {
  INVESTOR_ONBOARDING_CHANGED_EVENT,
  getInvestorDraftStorageKey,
  getInvestorOnboardingStatus,
  isInvestorWorkspaceUnlocked,
} from '@/services/investor/investorOnboardingStorageService';

const createInitialState = () => JSON.parse(JSON.stringify(INITIAL_INVESTOR_STATE));

export function useInvestorAccessStatus(user) {
  const readState = useCallback(
    () => (user ? loadInvestorDraft(user).draft : createInitialState()),
    [user],
  );
  const [state, setState] = useState(readState);

  useEffect(() => {
    setState(readState());

    if (!user) return undefined;

    const storageKey = getInvestorDraftStorageKey(user);
    const handleChange = () => setState(readState());
    const handleStorage = (event) => {
      if (event.key === storageKey || event.key === null) handleChange();
    };

    window.addEventListener(INVESTOR_ONBOARDING_CHANGED_EVENT, handleChange);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener(INVESTOR_ONBOARDING_CHANGED_EVENT, handleChange);
      window.removeEventListener('storage', handleStorage);
    };
  }, [readState, user]);

  return useMemo(() => {
    const status = getInvestorOnboardingStatus(state);
    return {
      state,
      status,
      isWorkspaceUnlocked: isInvestorWorkspaceUnlocked(status),
      isSubmitted: status === 'SUBMITTED',
      isApproved: status === 'APPROVED',
      isRejected: status === 'REJECTED',
    };
  }, [state]);
}
