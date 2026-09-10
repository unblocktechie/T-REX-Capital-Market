import { apiClient } from '@/api/axios';
import { INVESTOR_ENDPOINTS } from './investor.endpoints';

const unwrap = (response) =>
  response.data && Object.prototype.hasOwnProperty.call(response.data, 'data')
    ? response.data.data
    : response.data;

const unwrapClaimResponse = (response) => {
  const data = unwrap(response);
  if (!data || typeof data !== 'object' || Array.isArray(data)) return data;
  return {
    ...data,
    message: response?.data?.message || data.message || '',
    requestId: response?.data?.requestId || data.requestId || '',
  };
};

const accept2xx = (status) => status >= 200 && status < 300;

export const investorApi = Object.freeze({
  getOptions: () =>
    apiClient.get(INVESTOR_ENDPOINTS.options, { skipGlobalLoader: true }).then(unwrap),

  getMyInvestor: () =>
    apiClient.get(INVESTOR_ENDPOINTS.me, { skipGlobalLoader: true }).then(unwrap),

  saveIdentity: (payload) =>
    apiClient.put(INVESTOR_ENDPOINTS.identity, payload, { skipGlobalLoader: true }).then(unwrap),

  saveCompliance: (payload) =>
    apiClient.put(INVESTOR_ENDPOINTS.compliance, payload, { skipGlobalLoader: true }).then(unwrap),

  uploadDocuments: (documentTypeUid, files, onUploadProgress, signal) => {
    const formData = new FormData();
    formData.append('documentTypeUid', documentTypeUid);
    Array.from(files || []).forEach((file) => formData.append('documents', file));

    return apiClient
      .post(INVESTOR_ENDPOINTS.documents, formData, {
        onUploadProgress,
        signal,
        timeout: 60_000,
        skipGlobalLoader: true,
      })
      .then(unwrap);
  },

  listDocuments: () =>
    apiClient.get(INVESTOR_ENDPOINTS.documents, { skipGlobalLoader: true }).then(unwrap),

  deleteDocument: (documentUid) =>
    apiClient.delete(INVESTOR_ENDPOINTS.document(documentUid), { skipGlobalLoader: true }).then(unwrap),

  downloadDocument: (documentUid) =>
    apiClient.get(INVESTOR_ENDPOINTS.downloadDocument(documentUid), {
      responseType: 'blob',
      timeout: 60_000,
      skipGlobalLoader: true,
    }),

  submit: ({ walletAddress }) =>
    apiClient
      .post(
        INVESTOR_ENDPOINTS.submit,
        { walletAddress },
        { skipGlobalLoader: true },
      )
      .then(unwrap),

  getClaims: (interestId) =>
    apiClient
      .get(INVESTOR_ENDPOINTS.claims, {
        params: { interestId },
        skipGlobalLoader: true,
      })
      .then(unwrapClaimResponse),

  prepareClaim: (claimId, { interestId }) =>
    apiClient
      .post(
        INVESTOR_ENDPOINTS.prepareClaim(claimId),
        { interestId },
        { skipGlobalLoader: true, validateStatus: accept2xx },
      )
      .then(unwrapClaimResponse),

  retryClaim: (claimId, { interestId }) =>
    apiClient
      .post(
        INVESTOR_ENDPOINTS.retryClaim(claimId),
        { interestId },
        { skipGlobalLoader: true, validateStatus: accept2xx },
      )
      .then(unwrapClaimResponse),

  submitClaim: (claimId, { interestId, txHash }) =>
    apiClient
      .post(
        INVESTOR_ENDPOINTS.submitClaim(claimId),
        { interestId, txHash },
        { skipGlobalLoader: true, validateStatus: accept2xx },
      )
      .then(unwrapClaimResponse),
});
