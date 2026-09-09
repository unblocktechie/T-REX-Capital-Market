import { useContext } from 'react';
import { InvestorOnboardingContext } from '@/context/InvestorOnboardingContext';

export function useInvestorOnboarding() {
  const context = useContext(InvestorOnboardingContext);
  if (!context) throw new Error('useInvestorOnboarding must be used inside InvestorOnboardingProvider.');
  return context;
}
