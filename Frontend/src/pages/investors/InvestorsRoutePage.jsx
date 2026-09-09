import { Navigate } from 'react-router-dom';
import { ROUTES } from '@/config/routes';
import { ROLES } from '@/config/permissions';
import { useAuth } from '@/hooks/useAuth';
import InvestorOnboardingPage from './InvestorOnboardingPage';
import IssuerInvestorsPage from '@/pages/issuer/IssuerInvestorsPage';

export default function InvestorsRoutePage() {
  const { user } = useAuth();

  if (user?.role === ROLES.investor) return <InvestorOnboardingPage />;
  if (user?.role === ROLES.issuer) return <IssuerInvestorsPage />;
  return <Navigate to={ROUTES.dashboard} replace />;
}
