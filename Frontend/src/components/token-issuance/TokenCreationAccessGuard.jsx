import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { TrexLoader } from '@/components/loaders/TrexLoader';
import { ROUTES } from '@/config/routes';
import { useMyToken } from '@/hooks/useMyToken';
import { useTokenIssuanceStore } from '@/store/tokenIssuance.store';

export function TokenCreationAccessGuard() {
  const location = useLocation();
  const deploymentStatus = useTokenIssuanceStore((state) => state.deployment.status);
  const isActiveSubmission =
    location.pathname === ROUTES.tokenDeploying &&
    ['processing', 'success', 'error'].includes(deploymentStatus);
  // The processing page owns active-attempt recovery and bootstraps the complete issuance
  // state itself. Avoid a duplicate token-status request while that flow is running.
  const token = useMyToken({ enabled: !isActiveSubmission });

  if (token.isPending && !isActiveSubmission) {
    return (
      <TrexLoader
        variant="route"
        compact
        eyebrow="Checking token status"
        title="Opening your token workspace"
        message="Confirming whether a token has already been created…"
      />
    );
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
