import { Navigate } from 'react-router-dom';
import { ROUTES } from '@/config/routes';
import { useOrganization } from '@/hooks/useOrganization';
import { getOrganizationDestination } from '@/services/organizationStorageService';

const stepRoutes = {
  1: ROUTES.organizationCompany,
  2: ROUTES.organizationJurisdiction,
  3: ROUTES.organizationUbo,
  4: ROUTES.organizationDocuments,
  5: ROUTES.organizationReview,
};

export default function OrganizationEntryPage() {
  const { organization } = useOrganization();
  const destination = getOrganizationDestination(organization);

  if (typeof destination === 'number') return <Navigate to={stepRoutes[destination]} replace />;
  if (destination === 'pending') return <Navigate to={ROUTES.organizationPending} replace />;
  if (destination === 'rejected') return <Navigate to={ROUTES.organizationRejected} replace />;
  if (destination === 'verified') return <Navigate to={ROUTES.organizationVerified} replace />;
  return <Navigate to={ROUTES.organizationOverview} replace />;
}
