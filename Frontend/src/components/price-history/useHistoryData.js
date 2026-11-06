import { useQuery } from '@tanstack/react-query';
import { tokenApi } from '@/api/tokens';
import { assertPriceHistoryAssetMatch, priceHistoryQueryPrefix, priceGraphStartDate } from '@/services/price-history/priceHistory.utils';

const runningStatus = new Set(['PENDING', 'SUBMITTED']);

export function usePriceHistoryData({ userKey, chainUid, selectedChainUid, tokenUid, tokenAddress, chainId, viewer = 'issuer', page = 1, limit = 20 }) {
  const investor = viewer === 'investor';
  const matchingNetwork = Boolean(chainUid && selectedChainUid && chainUid === selectedChainUid);
  const enabled = matchingNetwork && (!investor || Boolean(String(tokenUid || '').trim()));
  const query = useQuery({
    queryKey: [...priceHistoryQueryPrefix(userKey, chainUid), viewer, tokenUid, 'table', page, limit],
    queryFn: async ({ signal }) => {
      const response = await tokenApi.getMyPriceHistory({
        page, limit, source: 'all', status: 'all', search: '',
        ...(investor ? { tokenUid: String(tokenUid).trim() } : {}),
      }, signal);
      if (investor) assertPriceHistoryAssetMatch(response.items, { tokenUid, tokenAddress, chainId });
      return response;
    },
    enabled,
    staleTime: 15_000,
    retry: 1,
    refetchInterval: (current) => current.state.data?.items?.some((row) => runningStatus.has(row.status)) ? 15_000 : false,
  });
  return { ...query, matchingNetwork, enabled };
}

// The endpoint is page-based, not range-based. Walk backwards until the one-year
// horizon is covered. Bound work, and report incomplete history rather than plotting
// a misleading complete trend when more pages remain.
const MAX_GRAPH_PAGES = 30;
export async function fetchYearPriceHistory({ investor, tokenUid, tokenAddress, chainId, signal, now = new Date() }) {
  const oldestNeeded = priceGraphStartDate(12, now).getTime();
  const records = [];
  let complete = false;
  let pending = false;
  for (let page = 1; page <= MAX_GRAPH_PAGES; page += 1) {
    const response = await tokenApi.getMyPriceHistory({
      page, limit: 100, source: 'all', status: 'all', search: '',
      ...(investor ? { tokenUid: String(tokenUid).trim() } : {}),
    }, signal);
    if (investor) assertPriceHistoryAssetMatch(response.items, { tokenUid, tokenAddress, chainId });
    records.push(...response.items);
    pending ||= response.items.some((row) => runningStatus.has(row.status));
    const reachedOlderRecords = response.items.some((row) => {
      const timestamp = Date.parse(row.createdAt);
      return Number.isFinite(timestamp) && timestamp < oldestNeeded;
    });
    const noMorePages = !response.items.length || page >= (response.pagination.totalPages || 1);
    if (reachedOlderRecords || noMorePages) { complete = true; break; }
  }
  return { records, complete, pending };
}

export function useYearPriceHistory({ userKey, chainUid, selectedChainUid, tokenUid, tokenAddress, chainId, viewer = 'issuer' }) {
  const investor = viewer === 'investor';
  const matchingNetwork = Boolean(chainUid && selectedChainUid && chainUid === selectedChainUid);
  const enabled = matchingNetwork && (!investor || Boolean(String(tokenUid || '').trim()));
  const query = useQuery({
    queryKey: [...priceHistoryQueryPrefix(userKey, chainUid), viewer, tokenUid, 'year-graph'],
    queryFn: ({ signal }) => fetchYearPriceHistory({ investor, tokenUid, tokenAddress, chainId, signal }),
    enabled,
    staleTime: 60_000,
    retry: 1,
    refetchInterval: (current) => current.state.data?.pending ? 15_000 : false,
  });
  return { ...query, matchingNetwork, enabled };
}
