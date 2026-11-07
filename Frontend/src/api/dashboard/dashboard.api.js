import { investmentApi } from '@/api/investments';
import {
  extractInvitationList,
  mapInvestorInvitation,
  mapIssuerInvestor,
  normalizeInvitationMeta,
} from '@/api/investments/invitation.mapper';
import {
  extractList,
  mapInterest,
  mapIssuerInterest,
  mapMarketplaceToken,
} from '@/api/investments/investment.mapper';

const settledValue = (result, fallback) =>
  result?.status === 'fulfilled' ? result.value : fallback;

const sectionError = (section, result) =>
  result?.status === 'rejected'
    ? {
        section,
        status: result.reason?.response?.status || null,
        message: result.reason?.message || `Unable to load ${section}.`,
      }
    : null;

const normalizeMeta = (meta = {}, { page = 1, limit = 4, itemCount = 0 } = {}) => {
  const source = meta?.pagination && typeof meta.pagination === 'object' ? meta.pagination : meta;
  const safePage = Math.max(1, Number(source?.page ?? source?.currentPage ?? page) || 1);
  const safeLimit = Math.max(1, Number(source?.limit ?? source?.pageSize ?? source?.perPage ?? limit) || limit);
  const total = Math.max(0, Number(source?.total ?? source?.totalItems ?? source?.count ?? itemCount) || 0);
  const totalPages = Math.max(1, Number(source?.totalPages ?? source?.pages ?? Math.ceil(total / safeLimit)) || 1);
  return { page: Math.min(safePage, totalPages), limit: safeLimit, total, totalPages };
};

/**
 * Builds role dashboards from the backend APIs that already exist in the app.
 * No dashboard figures are fabricated: totals, rows, statuses and timestamps
 * come from the authenticated investment/invitation/catalogue endpoints.
 */
export const dashboardApi = Object.freeze({
  async getIssuerOverview({ tokenUid = '', includeInvestors = false, signal } = {}) {
    const requestsPromise = investmentApi.listIssuerInterests({ status: 'all' });
    const redemptionsPromise = investmentApi.listIssuerRedemptions({ signal });
    const investorsPromise = includeInvestors && tokenUid
      ? investmentApi.listIssuerInvestors({
          tokenUid,
          page: 1,
          limit: 5,
          search: '',
          invitationStatus: 'all',
          signal,
        })
      : Promise.resolve({ data: [], meta: { page: 1, limit: 5, total: 0, totalPages: 1 } });

    const [requestsResult, redemptionsResult, investorsResult] = await Promise.allSettled([
      requestsPromise,
      redemptionsPromise,
      investorsPromise,
    ]);

    const rawRequests = settledValue(requestsResult, []);
    const requests = extractList(rawRequests).map(mapIssuerInterest);

    const redemptionsResponse = settledValue(redemptionsResult, { data: [], meta: {} });
    const redemptions = Array.isArray(redemptionsResponse?.data) ? redemptionsResponse.data : [];

    const investorsResponse = settledValue(investorsResult, { data: [], meta: {} });
    const investors = extractInvitationList(investorsResponse?.data).map(mapIssuerInvestor);
    const investorMeta = normalizeInvitationMeta(investorsResponse?.meta, {
      page: 1,
      limit: 5,
      itemCount: investors.length,
    });

    return {
      requests,
      redemptions,
      investors,
      investorMeta,
      errors: [
        sectionError('subscription requests', requestsResult),
        sectionError('redemptions', redemptionsResult),
        includeInvestors ? sectionError('investors', investorsResult) : null,
      ].filter(Boolean),
    };
  },

  async getInvestorOverview({ signal } = {}) {
    const applicationsPromise = investmentApi.listMyInterests();
    const invitationsPromise = investmentApi.listMyInvitations({
      page: 1,
      limit: 4,
      search: '',
      status: 'all',
      signal,
    });
    const newInvitationsPromise = investmentApi.listMyInvitations({
      page: 1,
      limit: 1,
      search: '',
      status: 'SENT',
      signal,
    });
    const offeringsPromise = investmentApi.listTokens({
      page: 1,
      limit: 4,
      search: '',
      status: 'deployed',
    });

    const [applicationsResult, invitationsResult, newInvitationsResult, offeringsResult] = await Promise.allSettled([
      applicationsPromise,
      invitationsPromise,
      newInvitationsPromise,
      offeringsPromise,
    ]);

    const rawApplications = settledValue(applicationsResult, []);
    const applications = extractList(rawApplications).map(mapInterest);

    const invitationsResponse = settledValue(invitationsResult, { data: [], meta: {} });
    const invitations = extractInvitationList(invitationsResponse?.data).map(mapInvestorInvitation);
    const invitationMeta = normalizeInvitationMeta(invitationsResponse?.meta, {
      page: 1,
      limit: 4,
      itemCount: invitations.length,
    });

    const newInvitationsResponse = settledValue(newInvitationsResult, { data: [], meta: {} });
    const newInvitationItems = extractInvitationList(newInvitationsResponse?.data).map(mapInvestorInvitation);
    const newInvitationMeta = normalizeInvitationMeta(newInvitationsResponse?.meta, {
      page: 1,
      limit: 1,
      itemCount: newInvitationItems.length,
    });

    const offeringsResponse = settledValue(offeringsResult, { data: [], meta: {} });
    const offerings = extractList(offeringsResponse?.data).map((raw) => mapMarketplaceToken(raw));
    const offeringMetaSource = offeringsResponse?.meta && Object.keys(offeringsResponse.meta).length
      ? offeringsResponse.meta
      : offeringsResponse?.data?.pagination || {};
    const offeringMeta = normalizeMeta(offeringMetaSource, {
      page: 1,
      limit: 4,
      itemCount: offerings.length,
    });

    return {
      applications,
      invitations,
      invitationMeta,
      newInvitationTotal: newInvitationMeta.total,
      offerings,
      offeringMeta,
      errors: [
        sectionError('applications', applicationsResult),
        sectionError('invitations', invitationsResult),
        sectionError('new invitations', newInvitationsResult),
        sectionError('marketplace offerings', offeringsResult),
      ].filter(Boolean),
    };
  },
});
