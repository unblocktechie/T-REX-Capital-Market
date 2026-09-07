import { Navigate, Outlet } from 'react-router-dom';
import { ROUTES } from '@/config/routes';
import { ROLES } from '@/config/permissions';
import { useAuth } from '@/hooks/useAuth';

export function GuestMiddleware() {
  const { isAuthenticated, user } = useAuth();
  if (!isAuthenticated) return <Outlet />;
  return <Navigate to={user?.role === ROLES.admin ? ROUTES.adminReviewQueue : ROUTES.dashboard} replace />;
}
