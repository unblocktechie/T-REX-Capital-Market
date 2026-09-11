import { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { TrexLoader } from '@/components/loaders/TrexLoader';
import { ROUTES } from '@/config/routes';
import { InvestorOnboardingProvider } from '@/context/InvestorOnboardingProvider';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useInvestorNavigationGuard } from '@/hooks/useInvestorNavigationGuard';
import { useInvestorOnboarding } from '@/hooks/useInvestorOnboarding';
import ComplianceQuestionnaireStep from './ComplianceQuestionnaireStep';
import IdentityDetailsStep from './IdentityDetailsStep';
import IdentityDocumentsStep from './IdentityDocumentsStep';
import InvestmentRequestSubmittedStep from './InvestmentRequestSubmittedStep';
import ReviewSubmitStep from './ReviewSubmitStep';

function InvestorOnboardingFlow() {
  const { state, isDirty, hydration, isLoading, loadError, isSubmitted, showSubmissionSuccess } = useInvestorOnboarding();
  const location = useLocation();
  useInvestorNavigationGuard(!isLoading && isDirty && state.currentStep < 6);

  useEffect(() => {
    if (isLoading) return;
    if (hydration.corrupted) {
      toast.warning('A corrupted local investor cache was cleared. Your saved progress was preserved.');
    } else if (hydration.hasDraft && state.currentStep < 6) {
      toast.info('Saved investor onboarding progress restored and synchronized.');
    }
  }, [hydration.corrupted, hydration.hasDraft, isLoading, state.currentStep]);

  if (isLoading) {
    return (
      <TrexLoader
        variant="route"
        compact
        eyebrow="Secure investor profile"
        title="Loading investor onboarding"
        message="Synchronizing your latest KYC and accreditation progress…"
      />
    );
  }

  if (loadError?.response?.status === 403) return <Navigate to={ROUTES.forbidden} replace />;
  if (loadError) {
    const returnPath = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to={ROUTES.networkError} replace state={{ from: returnPath }} />;
  }

  // A submitted profile is a persistent backend state, not a page that should be replayed
  // on every login. Keep the success screen only for the immediate post-submit transition.
  if (isSubmitted && !showSubmissionSuccess) {
    return <Navigate to={ROUTES.dashboard} replace />;
  }

  if (state.currentStep === 1) return <IdentityDetailsStep />;
  if (state.currentStep === 2) return <IdentityDocumentsStep />;
  if (state.currentStep === 3) return <ComplianceQuestionnaireStep />;
  if (state.currentStep === 4 || state.currentStep === 5) return <ReviewSubmitStep />;
  return <InvestmentRequestSubmittedStep />;
}

export default function InvestorOnboardingPage() {
  useDocumentTitle('Investor Onboarding');
  return (
    <InvestorOnboardingProvider>
      <InvestorOnboardingFlow />
    </InvestorOnboardingProvider>
  );
}
