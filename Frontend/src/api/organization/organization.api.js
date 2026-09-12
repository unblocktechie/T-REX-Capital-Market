import { apiClient } from '@/api/axios';
import { ORGANIZATION_ENDPOINTS } from './organization.endpoints';

const unwrap = (response) =>
  response.data && Object.prototype.hasOwnProperty.call(response.data, 'data')
    ? response.data.data
    : response.data;
const unwrapEnvelope = (response) => response.data;

const fetchAllPages = async (requestPage, limit = 100) => {
  const rows = [];
  let page = 1;
  let totalPages = 1;

  do {
    const envelope = await requestPage(page, limit);
    rows.push(...(Array.isArray(envelope?.data) ? envelope.data : []));
    totalPages = Math.max(1, Number(envelope?.meta?.pagination?.totalPages) || 1);
    page += 1;
  } while (page <= totalPages && page <= 25);

  return rows;
};

export const organizationApi = Object.freeze({
  getOptions: () => apiClient.get(ORGANIZATION_ENDPOINTS.options, { skipGlobalLoader: true }).then(unwrap),

  getCountries: ({ page = 1, limit = 100, search = '' } = {}) =>
    apiClient
      .get(ORGANIZATION_ENDPOINTS.countries, { params: { page, limit, search }, skipGlobalLoader: true })
      .then(unwrapEnvelope),

  getAllCountries: () =>
    fetchAllPages((page, limit) =>
      apiClient
        .get(ORGANIZATION_ENDPOINTS.countries, { params: { page, limit }, skipGlobalLoader: true })
        .then(unwrapEnvelope),
    ),

  getAllStates: (countryUid) =>
    countryUid
      ? fetchAllPages((page, limit) =>
          apiClient
            .get(ORGANIZATION_ENDPOINTS.states(countryUid), { params: { page, limit }, skipGlobalLoader: true })
            .then(unwrapEnvelope),
        )
      : Promise.resolve([]),

  getAllCities: (stateUid) =>
    stateUid
      ? fetchAllPages((page, limit) =>
          apiClient
            .get(ORGANIZATION_ENDPOINTS.cities(stateUid), { params: { page, limit }, skipGlobalLoader: true })
            .then(unwrapEnvelope),
        )
      : Promise.resolve([]),

  getMyOrganization: () => apiClient.get(ORGANIZATION_ENDPOINTS.me, { skipGlobalLoader: true }).then(unwrap),

  saveCompanyInformation: (payload) =>
    apiClient.put(ORGANIZATION_ENDPOINTS.company, payload, { skipGlobalLoader: true }).then(unwrap),

  saveJurisdiction: (payload) =>
    apiClient.put(ORGANIZATION_ENDPOINTS.jurisdiction, payload, { skipGlobalLoader: true }).then(unwrap),

  saveBeneficialOwners: (payload) =>
    apiClient.put(ORGANIZATION_ENDPOINTS.beneficialOwners, payload, { skipGlobalLoader: true }).then(unwrap),

  listDocuments: () => apiClient.get(ORGANIZATION_ENDPOINTS.documents, { skipGlobalLoader: true }).then(unwrap),

  uploadDocuments: (documentTypeUid, files, onUploadProgress) => {
    const formData = new FormData();
    formData.append('documentTypeUid', documentTypeUid);
    Array.from(files || []).forEach((file) => formData.append('documents', file));

    return apiClient
      .post(ORGANIZATION_ENDPOINTS.documents, formData, {
        onUploadProgress,
        timeout: 60_000,
        skipGlobalLoader: true,
      })
      .then(unwrap);
  },

  deleteDocument: (documentUid) =>
    apiClient.delete(ORGANIZATION_ENDPOINTS.document(documentUid), { skipGlobalLoader: true }).then(unwrap),

  downloadDocument: (documentUid) =>
    apiClient.get(ORGANIZATION_ENDPOINTS.downloadDocument(documentUid), {
      responseType: 'blob',
      timeout: 60_000,
      skipGlobalLoader: true,
    }),

  submit: () =>
    apiClient
      .post(ORGANIZATION_ENDPOINTS.submit, {}, { skipGlobalLoader: true })
      .then(unwrap),

  markUserNotified: () =>
    apiClient
      .patch(ORGANIZATION_ENDPOINTS.userNotified, undefined, { skipGlobalLoader: true })
      .then(unwrap),
});
