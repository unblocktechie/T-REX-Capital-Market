import { apiClient } from '@/api/axios';
import { assertValidTransactionHash } from '@/utils/transactionHash';
import { TOKEN_ENDPOINTS } from './token.endpoints';

const unwrap = (response) =>
  response.data && Object.prototype.hasOwnProperty.call(response.data, 'data')
    ? response.data.data
    : response.data;

export const tokenApi = Object.freeze({
  getOptions: () =>
    apiClient
      .get(TOKEN_ENDPOINTS.options, { skipGlobalLoader: true })
      .then(unwrap),

  getMyToken: () =>
    apiClient
      .get(TOKEN_ENDPOINTS.me, { skipGlobalLoader: true })
      .then(unwrap),

  saveInformation: (formData, onUploadProgress) =>
    apiClient
      .put(TOKEN_ENDPOINTS.information, formData, {
        skipGlobalLoader: true,
        timeout: 60_000,
        onUploadProgress,
      })
      .then(unwrap),

  getImage: () =>
    apiClient
      .get(TOKEN_ENDPOINTS.image, {
        responseType: 'blob',
        skipGlobalLoader: true,
        timeout: 60_000,
      })
      .then((response) => response.data),

  saveClaims: (payload) =>
    apiClient
      .put(TOKEN_ENDPOINTS.claims, payload, { skipGlobalLoader: true })
      .then(unwrap),

  saveCompliance: (payload) =>
    apiClient
      .put(TOKEN_ENDPOINTS.compliance, payload, { skipGlobalLoader: true })
      .then(unwrap),

  saveGovernance: (payload) =>
    apiClient
      .put(TOKEN_ENDPOINTS.governance, payload, { skipGlobalLoader: true })
      .then(unwrap),

  // Finalize the token proposal only after Sepolia confirms the deployment.
  // The confirmed transaction hash is the only deployment value accepted from the client.
  submit: (hash) => {
    const transactionHash = assertValidTransactionHash(hash);

    return apiClient
      .post(
        TOKEN_ENDPOINTS.submit,
        { transactionHash },
        {
          skipGlobalLoader: true,
          timeout: 180_000,
        },
      )
      .then((response) => ({
        data: unwrap(response),
        httpStatus: response.status,
        ok: response.status >= 200 && response.status < 300,
      }));
  },

  getDetails: (tokenAddress) =>
    apiClient
      .get(TOKEN_ENDPOINTS.details(tokenAddress), { skipGlobalLoader: true })
      .then(unwrap),
});
