import { Navigate, Outlet } from 'react-router-dom';
import { ROUTES } from '@/config/routes';
import { useAuth } from '@/hooks/useAuth';

export function RoleMiddleware({ roles = [] }) {
  const { hasRole } = useAuth();
  return hasRole(roles) ? <Outlet /> : <Navigate to={ROUTES.forbidden} replace />;
}
