import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { TrexLoader } from '@/components/loaders/TrexLoader';
import { ROUTES } from '@/config/routes';
import { ROLES } from '@/config/permissions';
import { useAuth } from '@/hooks/useAuth';
import { useOrganization } from '@/hooks/useOrganization';
import { isOrganizationWorkspaceUnlocked } from '@/services/organizationStorageService';

const isOrganizationPath = (pathname) =>
  pathname === ROUTES.organization || pathname.startsWith(`${ROUTES.organization}/`);

const isAlwaysAvailableAccountPath = (pathname) => pathname === ROUTES.profile;

export function OrganizationAccessMiddleware() {
  const { user } = useAuth();
  const { organization, isLoading, error } = useOrganization();
  const location = useLocation();

  if (user?.role !== ROLES.issuer) return <Outlet />;

  if (isLoading) {
    return (
      <TrexLoader
        variant="route"
        compact
        eyebrow="Secure organization onboarding"
        title="Loading your organization"
        message="Checking your latest KYB and approval status…"
      />
    );
  }

  if (error?.response?.status === 403) {
    return <Navigate to={ROUTES.forbidden} replace />;
  }

  if (error) {
    return <Navigate to={ROUTES.networkError} replace />;
  }

  if (
    !isOrganizationWorkspaceUnlocked(organization) &&
    !isOrganizationPath(location.pathname) &&
    !isAlwaysAvailableAccountPath(location.pathname)
  ) {
    return <Navigate to={ROUTES.organization} replace />;
  }

  return <Outlet />;
}
