import { useEffect } from 'react';
import { toast } from 'sonner';
import { InvestorOnboardingProvider } from '@/context/InvestorOnboardingProvider';
import { useInvestorOnboarding } from '@/hooks/useInvestorOnboarding';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useInvestorNavigationGuard } from '@/hooks/useInvestorNavigationGuard';
import ComplianceQuestionnaireStep from './ComplianceQuestionnaireStep';
import IdentityDetailsStep from './IdentityDetailsStep';
import IdentityDocumentsStep from './IdentityDocumentsStep';
import InvestmentRequestSubmittedStep from './InvestmentRequestSubmittedStep';
import ReviewSubmitStep from './ReviewSubmitStep';

function InvestorOnboardingFlow() {
  const { state, isDirty, hydration } = useInvestorOnboarding();
  useInvestorNavigationGuard(isDirty && state.currentStep < 6);

  useEffect(() => {
    if (hydration.corrupted) toast.warning('A corrupted investor draft was cleared and a fresh flow was started.');
    else if (hydration.hasDraft && state.currentStep < 6) {
      toast.info('Saved investor onboarding draft restored.');
    }
  }, [hydration.corrupted, hydration.hasDraft, state.currentStep]);

  let content;
  if (state.currentStep === 1) content = <IdentityDetailsStep />;
  else if (state.currentStep === 2) content = <IdentityDocumentsStep />;
  else if (state.currentStep === 3) content = <ComplianceQuestionnaireStep />;
  else if (state.currentStep === 4 || state.currentStep === 5) content = <ReviewSubmitStep />;
  else content = <InvestmentRequestSubmittedStep />;

  return content;
}

export default function InvestorOnboardingPage() {
  useDocumentTitle('Investor Onboarding');
  return (
    <InvestorOnboardingProvider>
      <InvestorOnboardingFlow />
    </InvestorOnboardingProvider>
  );
}
