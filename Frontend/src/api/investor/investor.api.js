import { apiClient } from '@/api/axios';
import { INVESTOR_ENDPOINTS } from './investor.endpoints';

const unwrap = (response) =>
  response.data && Object.prototype.hasOwnProperty.call(response.data, 'data')
    ? response.data.data
    : response.data;

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
});
