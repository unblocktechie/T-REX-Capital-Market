import { investmentApi } from '@/api/investments';
import { issuerClaimsApi } from '@/api/issuer';
import {
  extractList,
  mapIssuerInterest,
  mapIssuerInterestDetail,
  mapInvestmentHistory,
} from '@/api/investments/investment.mapper';
import { env } from '@/config/env';
import {
  getIssuerSubscriptionRequest,
  listIssuerSubscriptionRequests,
} from './issuerInvestorSubscriptionsLocalService';

const apiService = {
  async listRequests({ status = 'submitIntrest' } = {}) {
    const response = await investmentApi.listIssuerInterests({ status });
    return extractList(response).map(mapIssuerInterest);
  },

  async getRequest(interestUid) {
    const response = await investmentApi.getIssuerInterest(interestUid);
    return mapIssuerInterestDetail(response || {});
  },

  async getRequestHistory(interestUid) {
    const response = await investmentApi.getIssuerInterestHistory(interestUid);
    return mapInvestmentHistory(response || {});
  },

  async downloadDocument(interestUid, documentUid) {
    const response = await investmentApi.downloadIssuerDocument(interestUid, documentUid);
    return {
      blob: response.data,
      contentType: response.headers?.['content-type'] || response.data?.type || 'application/octet-stream',
      contentDisposition: response.headers?.['content-disposition'] || '',
    };
  },

  async approveRequest(interestUid, note = '') {
    await investmentApi.approveIssuerInterest(interestUid, note);
    return this.getRequest(interestUid);
  },

  async rejectRequest(interestUid, payload) {
    await investmentApi.rejectIssuerInterest(interestUid, payload);
    return this.getRequest(interestUid);
  },

  submitClaimSignatures(subscriptionId, claims) {
    return issuerClaimsApi.submitSignatures(subscriptionId, claims);
  },

  getClaimVerification(subscriptionId) {
    return issuerClaimsApi.getVerification(subscriptionId);
  },
};

const mockService = {
  async listRequests() {
    return listIssuerSubscriptionRequests();
  },
  async getRequest(interestUid) {
    return getIssuerSubscriptionRequest(interestUid);
  },
  async getRequestHistory(interestUid) {
    const request = getIssuerSubscriptionRequest(interestUid);
    return {
      interestUid,
      tokenUid: request?.tokenUid || '',
      tokenName: request?.tokenName || '',
      tokenSymbol: request?.tokenSymbol || '',
      status: request?.status || '',
      summary: { status: request?.status || '', canResubmit: false },
      timeline: request?.submittedAt ? [{ id: 'submitted', eventType: 'submitted', createdAt: request.submittedAt, actorRole: 'investor', documents: request.documents || [] }] : [],
    };
  },
  async downloadDocument() {
    throw new Error('Document download is unavailable while mock API mode is enabled.');
  },
  async approveRequest(interestUid) {
    const request = getIssuerSubscriptionRequest(interestUid);
    return request ? { ...request, status: 'approved', decisionAt: new Date().toISOString() } : request;
  },
  async rejectRequest(interestUid, payload) {
    const request = getIssuerSubscriptionRequest(interestUid);
    return request ? {
      ...request,
      status: 'rejected',
      decisionAt: new Date().toISOString(),
      rejectReasonType: payload?.rejectReasonType || '',
      rejectReason: payload?.rejectReason || '',
      rejectedClaim: payload?.rejectedClaims || [],
    } : request;
  },

  async submitClaimSignatures(subscriptionId, claims) {
    return {
      verificationId: `mock-${subscriptionId}`,
      subscriptionId,
      status: 'SIGNED',
      attemptNumber: 1,
      requiredClaimCount: claims.length,
      verifiedClaimCount: claims.length,
      completedAt: new Date().toISOString(),
      claims: claims.map((claim) => ({
        claimTopic: claim.claimTopic,
        status: 'SIGNED',
        signedByWallet: '',
        verificationError: null,
      })),
    };
  },

  async getClaimVerification(subscriptionId) {
    return {
      subscriptionId,
      status: 'PENDING',
      requiredClaimCount: 0,
      verifiedClaimCount: 0,
      claims: [],
    };
  },
};

export const issuerInvestorSubscriptionsService = Object.freeze(
  env.features.mockApi ? mockService : apiService,
);
