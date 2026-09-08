import { apiClient } from '@/api/axios';
import { TOKEN_ENDPOINTS } from './token.endpoints';

const unwrap = (response) =>
  response.data && Object.prototype.hasOwnProperty.call(response.data, 'data')
    ? response.data.data
    : response.data;

export const tokenApi = Object.freeze({
  deploy: (payload) =>
    apiClient
      .post(TOKEN_ENDPOINTS.deploy, payload, {
        skipGlobalLoader: true,
        timeout: 180_000,
      })
      .then(unwrap),
  getDetails: (tokenAddress) =>
    apiClient
      .get(TOKEN_ENDPOINTS.details(tokenAddress), { skipGlobalLoader: true })
      .then(unwrap),
});
