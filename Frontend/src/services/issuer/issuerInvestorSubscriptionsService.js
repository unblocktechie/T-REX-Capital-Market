import { investmentApi } from '@/api/investments';
import {
  extractList,
  mapIssuerInterest,
  mapIssuerInterestDetail,
} from '@/api/investments/investment.mapper';
import { env } from '@/config/env';
import {
  getIssuerSubscriptionRequest,
  listIssuerSubscriptionRequests,
} from './issuerInvestorSubscriptionsLocalService';

const apiService = {
  async listRequests({ status = 'pending' } = {}) {
    const response = await investmentApi.listIssuerInterests({ status });
    return extractList(response).map(mapIssuerInterest);
  },

  async getRequest(interestUid) {
    const response = await investmentApi.getIssuerInterest(interestUid);
    return mapIssuerInterestDetail(response || {});
  },

  async downloadDocument(interestUid, documentUid) {
    const response = await investmentApi.downloadIssuerDocument(interestUid, documentUid);
    return {
      blob: response.data,
      contentType: response.headers?.['content-type'] || response.data?.type || 'application/octet-stream',
      contentDisposition: response.headers?.['content-disposition'] || '',
    };
  },
};

const mockService = {
  async listRequests() {
    return listIssuerSubscriptionRequests();
  },
  async getRequest(interestUid) {
    return getIssuerSubscriptionRequest(interestUid);
  },
  async downloadDocument() {
    throw new Error('Document download is unavailable while mock API mode is enabled.');
  },
};

export const issuerInvestorSubscriptionsService = Object.freeze(
  env.features.mockApi ? mockService : apiService,
);
