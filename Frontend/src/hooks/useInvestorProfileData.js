import { useQuery } from '@tanstack/react-query';
import { investorApi } from '@/api/investor/investor.api';
import { mapInvestor, mapInvestorOptions } from '@/api/investor/investor.mapper';
import { web3Config } from '@/config/web3';
import { useAuthStore } from '@/store/auth.store';
import { networkUserKey, useNetworkStore } from '@/store/network.store';

export function useInvestorProfileData({ enabled = true } = {}) {
  const user = useAuthStore((state) => state.user);
  const userKey = networkUserKey(user);
  const selectedChainId = useNetworkStore((state) => state.activeChainByUser[userKey] || null);
  const storedChainUid = useNetworkStore((state) => state.activeChainUidByUser[userKey] || '');
  const selectedChainUid =
    storedChainUid || web3Config.getChainRecordById(selectedChainId)?.chainUid || '';

  const query = useQuery({
    queryKey: ['investor', 'profile-data', selectedChainUid || 'unselected'],
    enabled: Boolean(enabled && selectedChainUid),
    staleTime: 2 * 60_000,
    queryFn: async () => {
      const [rawOptions, rawInvestor] = await Promise.all([
        investorApi.getOptions(),
        investorApi.getMyInvestor(),
      ]);
      const options = mapInvestorOptions(rawOptions);
      return {
        options,
        rawInvestor,
        state: mapInvestor(rawInvestor, options),
      };
    },
  });

  return {
    ...query,
    selectedChainUid,
    options: query.data?.options || mapInvestorOptions(null),
    rawInvestor: query.data?.rawInvestor || null,
    state: query.data?.state || null,
  };
}
