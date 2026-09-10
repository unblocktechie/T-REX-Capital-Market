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
    case 'verified':
      return MARKETPLACE_STATUS.CLAIM_REQUIRED;
    case 'claimsubmitted':
    case 'claim_submitted':
    case 'claim-submitted':
      return MARKETPLACE_STATUS.CLAIMS_SUBMITTED;
    case 'registered':
    case 'ready_to_invest':
    case 'ready-to-invest':
      return MARKETPLACE_STATUS.READY_TO_INVEST;
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

const normalizeMatchValue = (value) => String(value || '').trim().toLowerCase();

const tokenIdentifiers = (token = {}) => {
  const raw = token?.raw || {};
  const values = [
    token?.id,
    token?.tokenUid,
    token?.tokenId,
    token?.tokenAddress,
    token?.contractAddress,
    raw?.id,
    raw?.uid,
    raw?.tokenUid,
    raw?.tokenId,
    raw?.tokenAddress,
    raw?.contractAddress,
  ];
  return new Set(values.map(normalizeMatchValue).filter(Boolean));
};

const interestTokenIdentifiers = (interest = {}) => {
  const raw = interest?.raw || {};
  const nested = interest?.token || {};
  const rawToken = raw?.token || raw?.tokenSummary || raw?.tokenInvestment || {};
  const values = [
    interest?.tokenUid,
    interest?.tokenId,
    nested?.id,
    nested?.tokenUid,
    nested?.tokenId,
    nested?.tokenAddress,
    nested?.contractAddress,
    raw?.tokenUid,
    raw?.tokenId,
    rawToken?.id,
    rawToken?.uid,
    rawToken?.tokenUid,
    rawToken?.tokenId,
    raw?.tokenAddress,
    raw?.contractAddress,
    rawToken?.tokenAddress,
    rawToken?.contractAddress,
  ];
  return new Set(values.map(normalizeMatchValue).filter(Boolean));
};

const findInterest = (interests, token) => {
  const expectedIds = tokenIdentifiers(token);
  const byIdentifier = interests.find((interest) => {
    const interestIds = interestTokenIdentifiers(interest);
    return [...expectedIds].some((id) => interestIds.has(id));
  });
  if (byIdentifier) return byIdentifier;

  // Fallback only when both token name and symbol match, preventing a different
  // offering from being treated as the investor's application.
  const expectedName = normalizeMatchValue(token?.name || token?.tokenName);
  const expectedSymbol = normalizeMatchValue(token?.symbol || token?.tokenSymbol);
  if (!expectedName || !expectedSymbol) return null;

  return interests.find((interest) => {
    const interestToken = interest?.token || {};
    const interestRaw = interest?.raw || {};
    const interestName = normalizeMatchValue(
      interestToken?.name
      || interestToken?.tokenName
      || interestRaw?.tokenName
      || interestRaw?.name,
    );
    const interestSymbol = normalizeMatchValue(
      interestToken?.symbol
      || interestToken?.tokenSymbol
      || interestRaw?.tokenSymbol
      || interestRaw?.symbol,
    );
    return interestName === expectedName && interestSymbol === expectedSymbol;
  }) || null;
};

const apiService = {
  async listOfferings({ page = 1, limit = 12, search = '', status = 'deployed' } = {}) {
    const [catalogue, interests] = await Promise.all([
      investmentApi.listTokens({ page, limit, search, status }),
      getMappedInterests(),
    ]);
    const items = extractList(catalogue.data).map((raw) => {
      const token = mapMarketplaceToken(raw);
      return withStatus(token, findInterest(interests, token), null);
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
    return withStatus(token, findInterest(interests, token), eligibility);
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
