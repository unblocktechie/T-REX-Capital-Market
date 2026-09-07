import { Navigate, Outlet } from 'react-router-dom';
import { ROLES } from '@/config/permissions';
import { ROUTES } from '@/config/routes';
import { useAuth } from '@/hooks/useAuth';

export function WorkspaceMiddleware() {
  const { user } = useAuth();
  return user?.role === ROLES.admin ? <Navigate to={ROUTES.adminReviewQueue} replace /> : <Outlet />;
}
