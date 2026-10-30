import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { tokenApi } from '@/api/tokens';
import {
  mapTokenCountries,
  mapTokenForm,
  mapTokenOptions,
} from '@/api/tokens/token.mapper';
import { organizationApi } from '@/api/organization';
import { web3Config } from '@/config/web3';
import { useAuthStore } from '@/store/auth.store';
import { networkUserKey, useNetworkStore } from '@/store/network.store';
import { useTokenIssuanceStore } from '@/store/tokenIssuance.store';
import { getTokenApiErrorMessage } from '@/utils/tokenApiValidation';
import { createTokenLogoFromBlob } from '@/utils/tokenLogo';

const tokenBootstrapQueryKey = (userKey, chainUid) => [
  'token-issuance',
  'bootstrap',
  userKey || 'anonymous',
  String(chainUid || 'unselected'),
];

const canAttemptImageLoad = (token) =>
  Boolean(
    token &&
      (token.imageMimeType ||
        token.tokenImage ||
        token.tokenInformation?.imageMimeType ||
        token.tokenInformation?.tokenImage ||
        token.tokenName ||
        token.tokenInformation?.tokenName),
  );

export function useTokenIssuanceBootstrap({ enabled = true } = {}) {
  const user = useAuthStore((state) => state.user);
  const backend = useTokenIssuanceStore((state) => state.backend);
  const hydrateFromBackend = useTokenIssuanceStore((state) => state.hydrateFromBackend);
  const setBackendState = useTokenIssuanceStore((state) => state.setBackendState);
  const tokenInformation = useTokenIssuanceStore((state) => state.tokenInformation);
  const userKey = user?.userUid || user?.uid || user?.email || 'current-user';
  const networkKey = networkUserKey(user);
  const selectedChainId = useNetworkStore((state) => state.activeChainByUser[networkKey] || null);
  const storedChainUid = useNetworkStore((state) => state.activeChainUidByUser[networkKey] || '');
  const selectedChainUid =
    storedChainUid || web3Config.getChainRecordById(selectedChainId)?.chainUid || '';
  const assetChainUid = String(tokenInformation.chainUid || '').trim();
  const hasHydratedAsset = Boolean(backend.hydrated && assetChainUid);
  const isChainMismatch = Boolean(
    hasHydratedAsset && selectedChainUid && assetChainUid !== selectedChainUid,
  );

  const query = useQuery({
    queryKey: tokenBootstrapQueryKey(userKey, selectedChainUid),
    queryFn: async () => {
      const [rawOptions, rawCountries, token] = await Promise.all([
        tokenApi.getOptions(),
        organizationApi.getAllCountries(),
        tokenApi.getMyToken(),
      ]);

      const options = mapTokenOptions(rawOptions);
      const countries = mapTokenCountries(rawCountries);
      let logo = null;

      if (canAttemptImageLoad(token)) {
        try {
          const imageBlob = await tokenApi.getImage();
          logo = await createTokenLogoFromBlob(imageBlob, 'saved-token-logo.webp');
        } catch (error) {
          if (![404, 204].includes(error?.response?.status)) {
            console.warn('Saved token image could not be restored.', error);
          }
        }
      }

      return mapTokenForm({ data: token, options, countries, logo });
    },
    enabled: Boolean(enabled && selectedChainUid && !isChainMismatch),
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    retry: (failureCount, error) => {
      const status = error?.response?.status;
      if ([400, 401, 403].includes(status)) return false;
      return failureCount < 1;
    },
  });

  useEffect(() => {
    if (backend.hydrated || !query.data || !selectedChainUid || isChainMismatch) return;
    hydrateFromBackend(query.data, selectedChainUid);
  }, [backend.hydrated, hydrateFromBackend, isChainMismatch, query.data, selectedChainUid]);

  useEffect(() => {
    if (backend.hydrated || isChainMismatch || !enabled) return;
    if (query.isPending) {
      setBackendState({ loading: true, error: '' });
      return;
    }
    if (query.isError) {
      setBackendState({
        loading: false,
        error: getTokenApiErrorMessage(
          query.error,
          'The token form could not be loaded. Please try again.',
        ),
      });
      return;
    }
    if (query.isSuccess) setBackendState({ loading: false, error: '' });
  }, [backend.hydrated, enabled, isChainMismatch, query.error, query.isError, query.isPending, query.isSuccess, setBackendState]);

  return useMemo(
    () => ({
      isLoading: enabled && !isChainMismatch && !backend.hydrated && query.isPending,
      isFetching: query.isFetching,
      error: backend.error,
      refresh: query.refetch,
      isChainMismatch,
      assetChainUid,
      selectedChainUid,
    }),
    [assetChainUid, backend.error, backend.hydrated, enabled, isChainMismatch, query.isFetching, query.isPending, query.refetch, selectedChainUid],
  );
}
