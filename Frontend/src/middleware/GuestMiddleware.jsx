import { Navigate, Outlet } from 'react-router-dom';
import { ROUTES } from '@/config/routes';
import { ROLES } from '@/config/permissions';
import { useAuth } from '@/hooks/useAuth';
import { useInvestorAccessStatus } from '@/hooks/useInvestorAccessStatus';

export function GuestMiddleware() {
  const { isAuthenticated, user } = useAuth();
  const investorAccess = useInvestorAccessStatus(
    user?.role === ROLES.investor ? user : null,
  );
  if (!isAuthenticated) return <Outlet />;
  if (user?.role === ROLES.admin) return <Navigate to={ROUTES.adminReviewQueue} replace />;
  if (user?.role === ROLES.investor && !investorAccess.isWorkspaceUnlocked) {
    return <Navigate to={ROUTES.investors} replace />;
  }
  return <Navigate to={ROUTES.dashboard} replace />;
}
