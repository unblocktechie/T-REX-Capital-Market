import { Navigate } from 'react-router-dom';
import { ROUTES } from '@/config/routes';
import { ROLES } from '@/config/permissions';
import { useAuth } from '@/hooks/useAuth';
import InvestorOnboardingPage from './InvestorOnboardingPage';

export default function InvestorsRoutePage() {
  const { user } = useAuth();

  if (user?.role === ROLES.investor) return <InvestorOnboardingPage />;
  if (user?.role === ROLES.issuer) return <Navigate to={ROUTES.issuerInvestorManagementTab('investment-requests')} replace />;
  return <Navigate to={ROUTES.dashboard} replace />;
}
