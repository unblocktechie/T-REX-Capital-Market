import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { TrexLoader } from '@/components/loaders/TrexLoader';
import { ROUTES } from '@/config/routes';
import { useOrganization } from '@/hooks/useOrganization';
import { ORGANIZATION_STATUSES } from '@/services/organizationStorageService';

export function OrganizationDataGuard() {
  const { isLoading, error } = useOrganization();
  const location = useLocation();

  if (isLoading) {
    return (
      <TrexLoader
        variant="route"
        compact
        eyebrow="Secure organization profile"
        title="Loading organization"
        message="Synchronizing your latest KYB progress…"
      />
    );
  }

  if (error?.response?.status === 403) return <Navigate to={ROUTES.forbidden} replace />;
  if (error) {
    const returnPath = `${location.pathname}${location.search}${location.hash}`;
    return (
      <Navigate
        to={ROUTES.networkError}
        replace
        state={{ from: returnPath }}
      />
    );
  }
  return <Outlet />;
}

export function OrganizationEditableGuard() {
  const { organization } = useOrganization();

  if (organization.status === ORGANIZATION_STATUSES.SUBMITTED) {
    return <Navigate to={ROUTES.organizationPending} replace />;
  }
  if (
    organization.status === ORGANIZATION_STATUSES.REJECTED &&
    !organization.canResubmit
  ) {
    return <Navigate to={ROUTES.organizationRejected} replace />;
  }
  if (organization.status === ORGANIZATION_STATUSES.VERIFIED_SUCCESS_PENDING) {
    return (
      <Navigate
        to={
          organization.verifiedScreenViewed
            ? ROUTES.organizationOverview
            : ROUTES.organizationVerified
        }
        replace
      />
    );
  }
  if (organization.status === ORGANIZATION_STATUSES.VERIFIED) {
    return <Navigate to={ROUTES.organizationOverview} replace />;
  }

  return <Outlet />;
}
