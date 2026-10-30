import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { chainsApi } from '@/api/chains';
import { web3Config } from '@/config/web3';

export const publicChainsQueryKey = ['chains', 'public'];
export const myChainsQueryKey = ['chains', 'me'];
export const chainConfigQueryKey = (chainUid) => ['chains', 'config', String(chainUid || '')];

export const chainConfigQueryOptions = (chainUid) => ({
  queryKey: chainConfigQueryKey(chainUid),
  queryFn: ({ signal }) => chainsApi.getConfig(chainUid, { signal }),
  staleTime: 30_000,
});

export function usePublicChains() {
  return useQuery({
    queryKey: publicChainsQueryKey,
    queryFn: chainsApi.listPublic,
    initialData: web3Config.chainRecords,
    staleTime: 60_000,
  });
}

export function useMyChains(options = {}) {
  return useQuery({
    queryKey: myChainsQueryKey,
    queryFn: chainsApi.listMine,
    staleTime: 15_000,
    ...options,
  });
}

export function useChainConfig(chainUid, options = {}) {
  return useQuery({
    ...chainConfigQueryOptions(chainUid),
    enabled: Boolean(chainUid),
    ...options,
  });
}

export function useUnlockChain() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (chainUid) => chainsApi.unlock(chainUid),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: myChainsQueryKey }),
  });
}
