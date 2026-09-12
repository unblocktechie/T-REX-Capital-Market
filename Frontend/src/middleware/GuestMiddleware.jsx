import { Navigate, Outlet } from 'react-router-dom';
import { ROUTES } from '@/config/routes';
import { ROLES } from '@/config/permissions';
import { useAuth } from '@/hooks/useAuth';
import { useInvestorAccessStatus } from '@/hooks/useInvestorAccessStatus';
import { resolveAuthenticatedLandingRoute } from '@/services/auth-landing.service';

export function GuestMiddleware() {
  const { isAuthenticated, user } = useAuth();
  const investorAccess = useInvestorAccessStatus(
    user?.role === ROLES.investor ? user : null,
  );
  if (!isAuthenticated) return <Outlet />;
  if (user?.role === ROLES.investor && !investorAccess.isWorkspaceUnlocked) {
    return <Navigate to={ROUTES.investors} replace />;
  }
  return <Navigate to={resolveAuthenticatedLandingRoute(user?.role)} replace />;
}
