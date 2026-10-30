import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { WorkspacePageSkeleton } from '@/components/loaders/WorkspacePageSkeleton';
import { ROUTES } from '@/config/routes';
import { useMyToken } from '@/hooks/useMyToken';

export function TokenCreationAccessGuard() {
  const location = useLocation();
  // A refresh resets the in-memory deployment status to idle. The processing
  // route must still reconcile transfers and price before any details redirect.
  const isActiveSubmission = location.pathname === ROUTES.tokenDeploying;
  // The processing page owns active-attempt recovery and bootstraps the complete issuance
  // state itself. Avoid a duplicate token-status request while that flow is running.
  const token = useMyToken({ enabled: !isActiveSubmission });

  if (token.isPending && !isActiveSubmission) {
    return <WorkspacePageSkeleton variant="compact" />;
  }

  if (token.isDeployed && !isActiveSubmission) {
    return <Navigate to={ROUTES.tokenDetails(token.tokenUid || 'token')} replace />;
  }

  if (token.isDeploymentPending && location.pathname !== ROUTES.tokenDeploying) {
    return <Navigate to={ROUTES.tokenDeploying} replace />;
  }

  const isDeploymentRetryRoute = [
    ROUTES.tokenIssuanceStep('review'),
    ROUTES.tokenDeploying,
  ].includes(location.pathname);

  if ((token.isReadyToDeploy || token.isDeploymentFailed) && !isDeploymentRetryRoute) {
    return <Navigate to={ROUTES.tokenIssuanceStep('review')} replace />;
  }

  return <Outlet />;
}
