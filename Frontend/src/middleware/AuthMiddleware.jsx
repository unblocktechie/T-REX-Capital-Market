import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { ROUTES } from '@/config/routes';
import { useAuth } from '@/hooks/useAuth';

export function AuthMiddleware() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  return isAuthenticated ? (
    <Outlet />
  ) : (
    <Navigate to={ROUTES.login} replace state={{ from: location }} />
  );
}
