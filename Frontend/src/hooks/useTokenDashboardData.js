import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { organizationApi } from '@/api/organization';
import { tokenApi } from '@/api/tokens';
import {
  mapTokenCountries,
  mapTokenForm,
  mapTokenOptions,
} from '@/api/tokens/token.mapper';
import { useMyToken } from '@/hooks/useMyToken';
import { createTokenLogoFromBlob } from '@/utils/tokenLogo';

export function useTokenDashboardData() {
  const tokenRecord = useMyToken();
  const enabled = tokenRecord.hasToken;

  const optionsQuery = useQuery({
    queryKey: ['token-options', 'dashboard'],
    queryFn: () => tokenApi.getOptions(),
    enabled,
    staleTime: 30 * 60_000,
    retry: 1,
  });

  const countriesQuery = useQuery({
    queryKey: ['token-countries', 'dashboard'],
    queryFn: () => organizationApi.getAllCountries(),
    enabled,
    staleTime: 30 * 60_000,
    retry: 1,
  });

  const logoQuery = useQuery({
    queryKey: ['token-image', tokenRecord.tokenUid || 'current'],
    queryFn: async () => {
      const imageBlob = await tokenApi.getImage();
      return createTokenLogoFromBlob(imageBlob, 'token-logo.webp');
    },
    enabled,
    staleTime: 10 * 60_000,
    retry: false,
  });

  const mapped = useMemo(() => {
    if (!tokenRecord.token) return null;
    return mapTokenForm({
      data: tokenRecord.token,
      options: mapTokenOptions(optionsQuery.data || {}),
      countries: mapTokenCountries(countriesQuery.data || []),
      logo: logoQuery.data || null,
    });
  }, [countriesQuery.data, logoQuery.data, optionsQuery.data, tokenRecord.token]);

  return {
    ...tokenRecord,
    mapped,
    logo: logoQuery.data || null,
    isLoading: tokenRecord.isPending || (enabled && !mapped),
    isReferenceDataLoading: optionsQuery.isPending || countriesQuery.isPending,
    referenceDataError: optionsQuery.error || countriesQuery.error || null,
  };
}
