import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { chainsApi } from '@/api/chains';
import { WorkspaceRouteLoader } from '@/components/loaders/DelayedTrexLoader';
import { ROLES } from '@/config/permissions';
import { ROUTES } from '@/config/routes';
import {
  chainConfigQueryOptions,
  publicChainsQueryKey,
} from '@/hooks/useChains';
import { useAuth } from '@/hooks/useAuth';
import { networkUserKey, useNetworkStore } from '@/store/network.store';

const isChainAwareRole = (role) => role === ROLES.investor || role === ROLES.issuer;

/**
 * Establish the backend-selected chain before any Investor/Issuer workspace
 * route is allowed to mount. Chain-sensitive child queries can therefore never
 * race the network-selection effect and leave without X-Chain-Uid.
 */
export function SelectedChainBootstrapMiddleware({ children = null }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const location = useLocation();
  const setActiveChainId = useNetworkStore((state) => state.setActiveChainId);
  const [state, setState] = useState({
    userKey: '',
    status: 'idle',
    error: null,
  });

  const userKey = networkUserKey(user);
  const needsBootstrap = Boolean(user && isChainAwareRole(user.role));
  const readyForUser = !needsBootstrap || (state.userKey === userKey && state.status === 'ready');
  const failedForUser = needsBootstrap && state.userKey === userKey && state.status === 'error';

  useEffect(() => {
    if (!needsBootstrap) {
      setState({ userKey, status: 'ready', error: null });
      return undefined;
    }

    let cancelled = false;
    setState({ userKey, status: 'loading', error: null });

    const bootstrap = async () => {
      // Force a fresh backend list for bootstrap. The regular usePublicChains
      // hook may have browser/build-time initial data, which is not sufficient
      // for validating a persisted selection.
      const chains = await queryClient.fetchQuery({
        queryKey: publicChainsQueryKey,
        queryFn: chainsApi.listPublic,
        staleTime: 0,
      });

      const networkState = useNetworkStore.getState();
      const savedUid = networkState.getActiveChainUid(user);
      const selected =
        chains.find((chain) => chain.chainUid === savedUid) ||
        chains.find((chain) => chain.isDefault) ||
        chains[0] ||
        null;

      if (!selected?.chainUid) {
        throw new Error('No active blockchain network is available.');
      }

      // Load runtime configuration before publishing the selection. That keeps
      // chain-sensitive queries disabled until the selected network is usable.
      const config = await queryClient.fetchQuery(chainConfigQueryOptions(selected.chainUid));
      if (cancelled) return;

      const chainId = Number(config?.chainId || selected.chainId);
      const chainUid = String(config?.chainUid || selected.chainUid || '').trim();
      if (!Number.isSafeInteger(chainId) || chainId <= 0 || !chainUid) {
        throw new Error('The selected network configuration is incomplete.');
      }

      setActiveChainId(user, chainId, chainUid);
      setState({ userKey, status: 'ready', error: null });
    };

    bootstrap().catch((error) => {
      if (!cancelled) setState({ userKey, status: 'error', error });
    });

    return () => {
      cancelled = true;
    };
  }, [needsBootstrap, queryClient, setActiveChainId, user, userKey]);

  if (failedForUser) {
    const returnPath = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to={ROUTES.networkError} replace state={{ from: returnPath }} />;
  }

  if (!readyForUser) return <WorkspaceRouteLoader />;

  return children || <Outlet />;
}
