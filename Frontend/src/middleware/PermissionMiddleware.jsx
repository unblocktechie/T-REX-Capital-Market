import { Navigate, Outlet } from 'react-router-dom';
import { ROUTES } from '@/config/routes';
import { useAuth } from '@/hooks/useAuth';

export function PermissionMiddleware({ permissions = [] }) {
  const { hasPermission } = useAuth();
  return hasPermission(permissions) ? <Outlet /> : <Navigate to={ROUTES.forbidden} replace />;
}
