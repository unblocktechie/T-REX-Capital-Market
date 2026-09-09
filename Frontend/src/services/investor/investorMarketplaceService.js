import { investorApi, mapInvestorOptions } from '@/api/investor';
import { investmentApi } from '@/api/investments';
import {
  extractList,
  mapEligibility,
  mapInterest,
  mapInvestmentHistory,
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
      return MARKETPLACE_STATUS.ACTION_REQUIRED;
    case 'submitintrest':
      return MARKETPLACE_STATUS.PENDING_REVIEW;
    case 'verifiedbyissuer':
    case 'verified_by_issuer':
    case 'verified-by-issuer':
      return MARKETPLACE_STATUS.CLAIM_REQUIRED;
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

const mergeInterestRejection = (interest, eligibility) => {
  if (!interest) return null;
  if (!eligibility?.rejection) return interest;
  return {
    ...interest,
    rejectReasonType: interest.rejectReasonType || eligibility.rejection.rejectReasonType,
    rejectReason: interest.rejectReason || eligibility.rejection.rejectReason,
    rejectedClaim: interest.rejectedClaim?.length
      ? interest.rejectedClaim
      : eligibility.rejection.rejectedClaim,
    rejectedCount: interest.rejectedCount ?? eligibility.rejection.rejectedCount,
    canResubmitClaim: interest.canResubmitClaim ?? eligibility.rejection.canResubmitClaim,
    resubmitRemaining: interest.resubmitRemaining ?? eligibility.rejection.resubmitRemaining,
    canResubmit: interest.canResubmit || eligibility.rejection.canResubmit,
  };
};

const withStatus = (token, interest, eligibility) => {
  const resolvedInterest = mergeInterestRejection(interest, eligibility);
  let status = interestStatusToMarketplace(resolvedInterest?.status || eligibility?.interestStatus);
  if (!resolvedInterest && eligibility && !eligibility.eligible) status = MARKETPLACE_STATUS.ACTION_REQUIRED;

  return {
    ...token,
    interest: resolvedInterest,
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

  async getApplicationDetail(interestUid) {
    if (!interestUid) throw new Error('Application identifier is required.');
    const [interests, rawHistory] = await Promise.all([
      getMappedInterests(),
      investmentApi.getMyInterestHistory(interestUid),
    ]);
    const interest = interests.find((item) => String(item.interestUid) === String(interestUid));
    if (!interest) throw new Error('The selected application could not be found.');
    const token = interest.token;
    return {
      application: {
        ...withStatus(token, interest, null),
        id: token.id || interest.tokenUid,
        interestUid: interest.interestUid,
        submittedAt: interest.submittedAt,
        decisionAt: interest.decisionAt,
        updatedAt: interest.updatedAt,
        note: interest.note,
      },
      history: mapInvestmentHistory(rawHistory || {}),
    };
  },

  async downloadApplicationDocument(documentUid) {
    if (!documentUid) throw new Error('Document identifier is required.');
    const response = await investorApi.downloadDocument(documentUid);
    return {
      blob: response.data,
      contentType: response.headers?.['content-type'] || response.data?.type || 'application/octet-stream',
      contentDisposition: response.headers?.['content-disposition'] || '',
    };
  },

  async getVerificationProfile(tokenUid) {
    const raw = await investmentApi.getRequiredDocuments(tokenUid);
    const eligibility = mapEligibility(raw || {});
    return {
      ...eligibility,
      kyc: eligibility.topics.find((topic) => topic.claimTopicCode === 'KYC')?.satisfied ?? true,
      accreditedInvestor:
        eligibility.topics.find((topic) => topic.claimTopicCode === 'ACCREDITED_INVESTOR')?.satisfied ?? true,
    };
  },

  async getDocumentUploadOptions() {
    const raw = await investorApi.getOptions();
    const options = mapInvestorOptions(raw || {});
    return [
      ...(options.identityDocumentTypes || []),
      ...(options.accreditationDocumentTypes || []),
    ].filter((option) => option.documentTypeUid || option.value);
  },

  async uploadClaimDocument(documentTypeUid, file, onUploadProgress, signal) {
    if (!documentTypeUid) throw new Error('Select a document type before uploading.');
    if (!file) throw new Error('Choose a document to upload.');
    return investorApi.uploadDocuments(documentTypeUid, [file], onUploadProgress, signal);
  },

  async removeClaimDocument(documentUid) {
    if (!documentUid) throw new Error('Document identifier is required.');
    return investorApi.deleteDocument(documentUid);
  },

  async ensureInterest(tokenUid, note = '') {
    await investmentApi.submitInterest(tokenUid, note);
    return this.getOffering(tokenUid);
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
  async getApplicationDetail(interestUid) {
    const application = getMarketplaceApplications().find((item) => String(item.interestUid || item.id) === String(interestUid));
    if (!application) throw new Error('The selected application could not be found.');
    return {
      application,
      history: {
        interestUid,
        tokenUid: application.id,
        tokenName: application.name,
        tokenSymbol: application.symbol,
        status: application.interest?.status || application.status,
        summary: { status: application.interest?.status || application.status, canResubmit: false },
        timeline: application.submittedAt ? [{ id: 'submitted', eventType: 'submitted', createdAt: application.submittedAt, actorRole: 'investor', documents: [] }] : [],
      },
    };
  },
  async downloadApplicationDocument() {
    throw new Error('Document download is unavailable while mock API mode is enabled.');
  },
  async getVerificationProfile() {
    return getLocalInvestorVerification();
  },
  async getDocumentUploadOptions() {
    return [];
  },
  async uploadClaimDocument() {
    throw new Error('Document upload is unavailable while mock API mode is enabled.');
  },
  async removeClaimDocument() {
    throw new Error('Document removal is unavailable while mock API mode is enabled.');
  },
  async ensureInterest(tokenId) {
    return submitMarketplaceInterest(tokenId);
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
