import { investmentApi } from '@/api/investments';
import { extractList, mapInvestorPortfolioItem } from '@/api/investments/investment.mapper';

const positiveInteger = (value, fallback) => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const nonNegativeInteger = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : fallback;
};

const normalizeMeta = (meta = {}, { page, limit, itemCount }) => {
  const source = meta?.pagination && typeof meta.pagination === 'object' ? meta.pagination : meta;
  const resolvedPage = positiveInteger(source?.page ?? source?.currentPage, page);
  const resolvedLimit = positiveInteger(source?.limit ?? source?.pageSize ?? source?.perPage, limit);
  const total = nonNegativeInteger(source?.total ?? source?.totalItems ?? source?.count, itemCount);
  const totalPages = positiveInteger(
    source?.totalPages ?? source?.pages ?? source?.pageCount,
    Math.max(1, Math.ceil(total / resolvedLimit)),
  );

  return {
    page: Math.min(resolvedPage, totalPages),
    limit: resolvedLimit,
    total,
    totalPages,
  };
};

export const investorPortfolioService = Object.freeze({
  async list({ page = 1, limit = 20, search = '', signal } = {}) {
    const response = await investmentApi.listMyPortfolio({ page, limit, search, signal });
    const rawItems = Array.isArray(response?.data?.portfolio)
      ? response.data.portfolio
      : extractList(response?.data);
    const items = rawItems.map(mapInvestorPortfolioItem).filter((item) => item.tokenUid);
    return {
      items,
      meta: normalizeMeta(response?.meta || response?.data?.pagination || {}, {
        page,
        limit,
        itemCount: items.length,
      }),
    };
  },

  refreshAfterCompletedActivity() {
    return investmentApi.listMyPortfolio({ page: 1, limit: 20, search: '' });
  },
});
