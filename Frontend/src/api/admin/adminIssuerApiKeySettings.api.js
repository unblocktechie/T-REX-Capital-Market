import { apiClient } from '@/api/axios';

const ENDPOINT = '/admin/issuer-api-key-settings';
const unwrap = (response) => response.data?.data ?? response.data;

const requestConfig = Object.freeze({
  skipGlobalLoader: true,
  // Admin API-key settings are global. Never inherit an issuer/investor selected-chain header.
  skipSelectedChainHeader: true,
});

export const adminIssuerApiKeySettingsApi = Object.freeze({
  get: () => apiClient.get(ENDPOINT, requestConfig).then(unwrap),
  update: (payload) => apiClient.patch(ENDPOINT, payload, requestConfig).then(unwrap),
});
