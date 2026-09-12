import { useQuery } from '@tanstack/react-query';
import { investmentApi } from '@/api/investments';
import {
  extractList,
  mapInterest,
  mapIssuerInterest,
} from '@/api/investments/investment.mapper';
import {
  normalizeInvitationMeta,
} from '@/api/investments/invitation.mapper';
import { ROLES } from '@/config/permissions';
import { ROUTES } from '@/config/routes';
import { issuerRedemptionStatus } from '@/utils/issuerRedemption';

const compactStatus = (value) => String(value || '').trim().toLowerCase().replace(/[\s_-]+/g, '');

const issuerRequestNeedsAction = (request) => {
  const status = compactStatus(request?.status);
  return ['pending', 'submitintrest', 'submitted', 'claimsubmitted'].includes(status);
};

const issuerRedemptionNeedsAction = (redemption) =>
  ['PENDING_ISSUER_APPROVAL', 'TOKENS_LOCKED', 'MANUAL_REVIEW'].includes(
    issuerRedemptionStatus(redemption),
  );

const investorApplicationNeedsAction = (application) => {
  const status = compactStatus(application?.status);
  return status === 'pending'
    || status === 'verifiedbyissuer'
    || (status === 'rejected' && application?.canResubmit === true);
};

const safeCount = (value) => Math.max(0, Number(value) || 0);

async function loadIssuerIndicators() {
  const [requestsResult, redemptionsResult] = await Promise.allSettled([
    investmentApi.listIssuerInterests({ status: 'all' }),
    investmentApi.listIssuerRedemptions(),
  ]);

  const requests = requestsResult.status === 'fulfilled'
    ? extractList(requestsResult.value).map(mapIssuerInterest)
    : [];
  const redemptions = redemptionsResult.status === 'fulfilled'
    ? (Array.isArray(redemptionsResult.value?.data) ? redemptionsResult.value.data : [])
    : [];

  return {
    [ROUTES.investors]: requests.filter(issuerRequestNeedsAction).length,
    [ROUTES.issuerRedemptions]: redemptions.filter(issuerRedemptionNeedsAction).length,
  };
}

async function loadInvestorIndicators() {
  const [applicationsResult, invitationsResult] = await Promise.allSettled([
    investmentApi.listMyInterests(),
    investmentApi.listMyInvitations({
      page: 1,
      limit: 1,
      search: '',
      status: 'SENT',
    }),
  ]);

  const applications = applicationsResult.status === 'fulfilled'
    ? extractList(applicationsResult.value).map(mapInterest)
    : [];

  let newInvitationTotal = 0;
  if (invitationsResult.status === 'fulfilled') {
    const response = invitationsResult.value || {};
    const meta = normalizeInvitationMeta(response.meta, {
      page: 1,
      limit: 1,
      itemCount: Array.isArray(response?.data) ? response.data.length : 0,
    });
    newInvitationTotal = safeCount(meta.total);
  }

  return {
    [ROUTES.applications]: applications.filter(investorApplicationNeedsAction).length,
    [ROUTES.invitations]: newInvitationTotal,
  };
}

export function useSidebarActionIndicators(role) {
  return useQuery({
    queryKey: ['sidebar-action-indicators', role],
    queryFn: () => (role === ROLES.issuer ? loadIssuerIndicators() : loadInvestorIndicators()),
    enabled: role === ROLES.issuer || role === ROLES.investor,
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    retry: 1,
    placeholderData: {},
  });
}
