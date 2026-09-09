import { investmentApi } from '@/api/investments';
import {
  extractList,
  mapEligibility,
  mapInterest,
  mapMarketplaceToken,
} from '@/api/investments/investment.mapper';
import { env } from '@/config/env';
import {
  getLocalInvestorVerification,
  getMarketplaceApplications,
  getMarketplaceToken,
  getMarketplaceTokens,
  submitMarketplaceInterest,
} from './investorMarketplaceLocalService';
import { MARKETPLACE_STATUS, MARKETPLACE_STATUS_META } from './investorMarketplaceLocalService';

const interestStatusToMarketplace = (interestStatus) => {
  switch (String(interestStatus || '').toLowerCase()) {
    case 'pending':
      return MARKETPLACE_STATUS.PENDING_REVIEW;
    case 'approved':
      return MARKETPLACE_STATUS.APPROVED;
    case 'rejected':
      return MARKETPLACE_STATUS.REJECTED;
    case 'cancelled':
      return MARKETPLACE_STATUS.CANCELLED;
    default:
      return MARKETPLACE_STATUS.NOT_APPLIED;
  }
};

const withStatus = (token, interest, eligibility) => {
  let status = interestStatusToMarketplace(interest?.status);
  if (!interest && eligibility && !eligibility.eligible) status = MARKETPLACE_STATUS.ACTION_REQUIRED;

  return {
    ...token,
    interest: interest || null,
    eligibility: eligibility || token.eligibility || null,
    status,
    statusMeta: MARKETPLACE_STATUS_META[status] || MARKETPLACE_STATUS_META[MARKETPLACE_STATUS.NOT_APPLIED],
  };
};

const getMappedInterests = async (params) => {
  const response = await investmentApi.listMyInterests(params);
  return extractList(response).map(mapInterest);
};

const findInterest = (interests, tokenUid) =>
  interests.find((interest) => String(interest.tokenUid) === String(tokenUid)) || null;

const apiService = {
  async listOfferings({ page = 1, limit = 12, search = '', status = 'deployed' } = {}) {
    const [catalogue, interests] = await Promise.all([
      investmentApi.listTokens({ page, limit, search, status }),
      getMappedInterests(),
    ]);
    const items = extractList(catalogue.data).map((raw) => {
      const token = mapMarketplaceToken(raw);
      return withStatus(token, findInterest(interests, token.id), null);
    });
    return { items, meta: catalogue.meta || {} };
  },

  async getOffering(tokenUid) {
    const [rawToken, rawEligibility, interests] = await Promise.all([
      investmentApi.getToken(tokenUid),
      investmentApi.getRequiredDocuments(tokenUid),
      getMappedInterests(),
    ]);
    const eligibility = mapEligibility(rawEligibility || {});
    const token = mapMarketplaceToken(rawToken || {}, { eligibility });
    return withStatus(token, findInterest(interests, tokenUid), eligibility);
  },

  async listApplications({ status } = {}) {
    const interests = await getMappedInterests({ status });
    return interests.map((interest) => {
      const token = interest.token;
      return {
        ...withStatus(token, interest, null),
        id: token.id || interest.tokenUid,
        interestUid: interest.interestUid,
        submittedAt: interest.submittedAt,
        decisionAt: interest.decisionAt,
        updatedAt: interest.updatedAt,
        note: interest.note,
      };
    });
  },

  async getVerificationProfile(tokenUid) {
    const raw = await investmentApi.getRequiredDocuments(tokenUid);
    const eligibility = mapEligibility(raw || {});
    return {
      eligible: eligibility.eligible,
      topics: eligibility.topics,
      missingClaimTopics: eligibility.missingClaimTopics,
      kyc: eligibility.topics.find((topic) => topic.claimTopicCode === 'KYC')?.satisfied ?? true,
      accreditedInvestor:
        eligibility.topics.find((topic) => topic.claimTopicCode === 'ACCREDITED_INVESTOR')?.satisfied ?? true,
    };
  },

  async submitInterest(tokenUid, note = '') {
    await investmentApi.submitInterest(tokenUid, note);
    return this.getOffering(tokenUid);
  },

  async getTokenImageBlob(tokenUid, signal) {
    return investmentApi.getTokenImage(tokenUid, signal);
  },
};

const mockService = {
  async listOfferings() {
    return { items: getMarketplaceTokens(), meta: { page: 1, limit: 100, total: getMarketplaceTokens().length, totalPages: 1 } };
  },
  async getOffering(tokenId) {
    return getMarketplaceToken(tokenId);
  },
  async listApplications() {
    return getMarketplaceApplications();
  },
  async getVerificationProfile() {
    return getLocalInvestorVerification();
  },
  async submitInterest(tokenId) {
    return submitMarketplaceInterest(tokenId);
  },
  async getTokenImageBlob() {
    return null;
  },
};

export const investorMarketplaceService = Object.freeze(
  env.features.mockApi ? mockService : apiService,
);
