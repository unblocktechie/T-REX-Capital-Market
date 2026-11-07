import { apiClient } from '@/api/axios';
import { normalizePriceHistoryQuery, normalizePriceHistoryResponse, assertPriceHistoryAssetMatch } from '@/services/price-history/priceHistory.utils';

const requestOptions = { skipGlobalLoader: true, skipSelectedChainHeader: true };
const adminPath = '/admin';
const idPath = (userUid) => `${adminPath}/investors/${encodeURIComponent(userUid)}`;
const tokenDetailPath = (tokenUid) => `${adminPath}/tokens/${encodeURIComponent(tokenUid)}`;
const tokenPriceHistoryPath = (tokenUid) => `${tokenDetailPath(tokenUid)}/price-history`;
const applicationHistoryPath = (interestUid) => `${adminPath}/investor-applications/${encodeURIComponent(interestUid)}/history`;

// Every admin list has the same pagination contract, but each endpoint only
// receives filters that belong to it. In particular, pendingOnly is not a
// generic status filter and must never be sent to investor/token lists.
export const ADMIN_MONITORING_FILTERS = Object.freeze({
  investors: ['status', 'chainUid'],
  chains: ['status', 'chainUid'],
  tokens: ['status', 'chainUid', 'organizationUid', 'tokenUid'],
  investedTokens: ['status', 'chainUid', 'organizationUid', 'tokenUid'],
  applications: ['status', 'pendingOnly', 'chainUid', 'organizationUid', 'tokenUid'],
});

export const monitoringListParams = (kind, input = {}) => {
  const page = Math.max(1, Math.trunc(Number(input.page) || 1));
  const limit = Math.min(100, Math.max(1, Math.trunc(Number(input.limit) || 20)));
  const search = String(input.search || '').trim().slice(0, 100);
  const params = { page, limit };
  if (search) params.search = search;
  for (const field of ADMIN_MONITORING_FILTERS[kind] || []) {
    if (field === 'pendingOnly') {
      if (input.pendingOnly === true && (!input.status || ['all', 'submitIntrest'].includes(input.status))) {
        params.pendingOnly = true;
        params.status = input.status === 'submitIntrest' ? 'submitIntrest' : 'all';
      }
    } else if (input[field] !== undefined && input[field] !== null && String(input[field]).trim() && String(input[field]) !== 'all') {
      params[field] = String(input[field]).trim();
    }
  }
  if (kind === 'applications' && input.sortBy) {
    // Request global sorting when supported by the backend. Unknown keys are never forwarded.
    const allowed = ['investorName', 'tokenName', 'chainName', 'status', 'submittedAt'];
    if (allowed.includes(input.sortBy)) {
      params.sortBy = input.sortBy;
      params.sortOrder = String(input.sortOrder).toLowerCase() === 'desc' ? 'desc' : 'asc';
    }
  }
  if (kind === 'tokens' && input.sortBy) {
    // Sort tokens on the server so pagination and ordering remain consistent.
    const allowed = ['tokenName', 'legalCompanyName', 'chainName', 'currentTokenPrice', 'currentHolders', 'status', 'createdAt'];
    if (allowed.includes(input.sortBy)) {
      params.sortBy = input.sortBy;
      params.sortOrder = String(input.sortOrder).toLowerCase() === 'desc' ? 'desc' : 'asc';
    }
  }
  return params;
};

// Only fetch an application document from the exact admin endpoint the backend
// identified. Never send an administrator JWT to an arbitrary download URL.
export const adminApplicationDocumentPath = (interestUid, documentUid, downloadUrl, apiBaseUrl) => {
  if (!interestUid || !documentUid || !downloadUrl || !apiBaseUrl) return null;
  try {
    const base = new URL(`${String(apiBaseUrl).replace(/\/$/, '')}/`);
    const expectedPath = `/admin/investor-applications/${encodeURIComponent(interestUid)}/documents/${encodeURIComponent(documentUid)}/download`;
    const expected = new URL(expectedPath.slice(1), base);
    const supplied = String(downloadUrl).trim();
    const resolved = new URL(supplied.startsWith('/admin/') ? supplied.slice(1) : supplied, base);
    if (resolved.origin !== base.origin || resolved.pathname !== expected.pathname || resolved.username || resolved.password) return null;
    return expectedPath;
  } catch {
    return null;
  }
};

export const adminDocumentFilename = (disposition = '', fallback = 'application-document') => {
  const header = String(disposition || '');
  const utf8 = header.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
  const basic = header.match(/filename\s*=\s*(?:"([^"]*)"|([^;]*))/i);
  let name = (utf8?.[1] || basic?.[1] || basic?.[2] || fallback).trim();
  if (utf8?.[1]) {
    try { name = decodeURIComponent(name); } catch { /* Keep safe fallback below. */ }
  }
  const safe = name.split(/[\\/]/).pop().replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '_').trim().slice(0, 180);
  return safe && safe !== '.' && safe !== '..' ? safe : fallback;
};

const unpack = (response) => response?.data?.data ?? response?.data;
const unpackList = (response, params) => {
  const body = response?.data || {};
  const data = unpack(response);
  const rows = Array.isArray(data) ? data : [];
  const pagination = body.meta?.pagination || data?.meta?.pagination || {};
  const page = Number(pagination.page) || params.page;
  const limit = Number(pagination.limit) || params.limit;
  const total = Number.isFinite(Number(pagination.total)) ? Number(pagination.total) : rows.length;
  const totalPages = Number(pagination.totalPages) || Math.max(1, Math.ceil(total / limit));
  return { items: rows, pagination: { page, limit, total, totalPages } };
};

const getList = async (url, kind, input) => {
  const params = monitoringListParams(kind, input);
  return unpackList(await apiClient.get(url, { ...requestOptions, params }), params);
};

export const adminMonitoringApi = Object.freeze({
  listInvestors: (params) => getList(`${adminPath}/investors`, 'investors', params),
  getInvestor: (userUid) => apiClient.get(idPath(userUid), requestOptions).then(unpack),
  listInvestorChains: (userUid, params) => getList(`${idPath(userUid)}/chains`, 'chains', params),
  listInvestorTokens: (userUid, params) => getList(`${idPath(userUid)}/invested-tokens`, 'investedTokens', params),
  listInvestorApplications: (userUid, params) => getList(`${idPath(userUid)}/applications`, 'applications', params),
  listTokens: (params) => getList(`${adminPath}/tokens`, 'tokens', params),
  // Investor status and balances are returned by this existing read-only endpoint.
  // The selected token determines its chain; don't forward the UI chain header.
  getTokenDetails: async (tokenUid, input = {}) => {
    const { page, limit, search } = monitoringListParams('investors', input);
    const holderStatus = ['current', 'former'].includes(input.holderStatus) ? input.holderStatus : 'all';
    const params = { page, limit, search, holderStatus };
    const response = await apiClient.get(tokenDetailPath(tokenUid), { ...requestOptions, params });
    const data = unpack(response) || {};
    const pagination = response?.data?.meta?.pagination || data?.meta?.pagination || {};
    const investors = Array.isArray(data.investors) ? data.investors : [];
    const actualLimit = Number(pagination.limit) || limit;
    const total = Number.isFinite(Number(pagination.total)) ? Number(pagination.total) : investors.length;
    return {
      token: data.token || null,
      investors,
      holderSummary: data.holderSummary || null,
      // The fallback pagination total is only a page length; do not present
      // it as a global invested-investor count unless the API supplied it.
      confirmedInvestorTotal: pagination.total !== undefined && pagination.total !== null && Number.isFinite(Number(pagination.total)) ? Number(pagination.total) : null,
      pagination: {
        page: Number(pagination.page) || page,
        limit: actualLimit,
        total,
        totalPages: Number(pagination.totalPages) || Math.max(1, Math.ceil(total / actualLimit)),
      },
    };
  },
  // Authenticated admin price history, not the public block scanner.
  // The UID belongs ONLY in the path; backend determines the chain and issuer.
  getTokenPriceHistory: async (tokenUid, input = {}) => {
    const params = normalizePriceHistoryQuery({
      page: input.page, limit: input.limit ?? 20,
      source: input.source, status: input.status, search: input.search,
    });
    const response = await apiClient.get(tokenPriceHistoryPath(tokenUid), {
      ...requestOptions, params,
    });
    const history = normalizePriceHistoryResponse(response?.data || {});
    assertPriceHistoryAssetMatch(history.items, { tokenUid });
    return history;
  },
  listApplications: async (params) => {
    try {
      return await getList(`${adminPath}/investor-applications`, 'applications', params);
    } catch (error) {
      // Deployments without application sort support may return 422. Keep the
      // existing API and allow the UI to sort the visible page as a fallback.
      if (params?.sortBy && Number(error?.response?.status) === 422) {
        return getList(`${adminPath}/investor-applications`, 'applications', { ...params, sortBy: undefined, sortOrder: undefined });
      }
      throw error;
    }
  },
  getApplicationHistory: (interestUid) => apiClient.get(applicationHistoryPath(interestUid), requestOptions).then(unpack),
  downloadApplicationDocument: async (interestUid, doc) => {
    const documentUid = doc?.documentUid || doc?.submissionDocumentUid;
    const path = adminApplicationDocumentPath(interestUid, documentUid, doc?.downloadUrl, apiClient.defaults.baseURL);
    if (!path) throw new Error('This document does not have a valid administrator download link.');
    const response = await apiClient.get(path, {
      ...requestOptions,
      responseType: 'blob',
      headers: { Accept: 'application/pdf,image/png,image/jpeg,image/webp,application/octet-stream' },
    });
    const contentType = String(response.headers?.['content-type'] || response.data?.type || 'application/octet-stream').split(';')[0].trim().toLowerCase();
    return {
      blob: response.data,
      contentType,
      fileName: adminDocumentFilename(response.headers?.['content-disposition'], doc?.originalFileName || `application-document-${documentUid}`),
    };
  },
  getNotificationSettings: () => apiClient.get(`${adminPath}/notification-settings`, requestOptions).then(unpack),
  updateNotificationSettings: (teamNotificationEmails) => apiClient.patch(
    `${adminPath}/notification-settings`,
    { teamNotificationEmails },
    requestOptions,
  ).then(unpack),
});
