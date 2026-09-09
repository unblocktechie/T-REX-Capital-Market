import { useQuery } from '@tanstack/react-query';
import { investorApi } from '@/api/investor/investor.api';
import { mapInvestor, mapInvestorOptions } from '@/api/investor/investor.mapper';

export function useInvestorProfileData({ enabled = true } = {}) {
  const query = useQuery({
    queryKey: ['investor', 'profile-data'],
    enabled,
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
    options: query.data?.options || mapInvestorOptions(null),
    rawInvestor: query.data?.rawInvestor || null,
    state: query.data?.state || null,
  };
}
