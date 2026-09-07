import { Navigate, Outlet } from 'react-router-dom';
import { ROUTES } from '@/config/routes';
import { useAuth } from '@/hooks/useAuth';

export function GuestMiddleware() {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <Navigate to={ROUTES.dashboard} replace /> : <Outlet />;
}
