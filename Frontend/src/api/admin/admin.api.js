import { apiClient } from '@/api/axios';
import { env } from '@/config/env';
import { ADMIN_ENDPOINTS } from './admin.endpoints';
import {
  mapAdminOrganizationDetail,
  mapAdminOrganizationListResponse,
} from './admin.mapper';
import { adminMockApi } from './admin.mock';

const unwrap = (response) => response.data?.data ?? response.data;

const normalizeListParams = ({
  page = 1,
  pageSize = 20,
  status = 'all',
  sortBy = 'submittedAt',
  sortDirection = 'desc',
} = {}) => ({
  page,
  limit: pageSize,
  ...(status && status !== 'all' ? { status: status === 'pending' ? 'submitted' : status } : {}),
  sortBy: sortBy === 'submittedAt' ? 'submittedAt' : 'submittedAt',
  sortOrder: sortDirection === 'asc' ? 'asc' : 'desc',
});

const getOrganizationPage = async (params = {}) => {
  const requestParams = normalizeListParams(params);
  const response = await apiClient.get(ADMIN_ENDPOINTS.organizations, {
    params: requestParams,
    skipGlobalLoader: true,
  });
  return mapAdminOrganizationListResponse(response, {
    page: requestParams.page,
    limit: requestParams.limit,
  });
};

const combineRejectionReason = (payload = {}) => {
  if (payload.rejectionReason?.trim()) return payload.rejectionReason.trim();
  const reason = payload.reason?.trim();
  const comment = payload.comment?.trim();
  return [reason, comment].filter(Boolean).join(': ');
};


const parseDownloadFileName = (contentDisposition = '', fallback = 'organization-document') => {
  const utf8Match = String(contentDisposition).match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1].replace(/["']/g, ''));
    } catch {
      return utf8Match[1].replace(/["']/g, '');
    }
  }
  const basicMatch = String(contentDisposition).match(/filename="?([^";]+)"?/i);
  return basicMatch?.[1]?.trim() || fallback;
};

const getOrganizationDocumentFile = async (organizationUid, documentUid, disposition = 'inline') => {
  const response = await apiClient.get(
    ADMIN_ENDPOINTS.organizationDocumentFile(organizationUid, documentUid),
    {
      params: { disposition },
      responseType: 'blob',
      skipGlobalLoader: true,
      headers: { Accept: 'application/pdf,image/*,application/octet-stream' },
    },
  );

  const contentType = response.headers?.['content-type'] || response.data?.type || 'application/octet-stream';
  const contentDisposition = response.headers?.['content-disposition'] || '';
  const fileName = parseDownloadFileName(contentDisposition, `organization-document-${documentUid}`);

  return {
    blob: response.data,
    contentType,
    contentDisposition,
    fileName,
  };
};

const getRealOverview = async () => {
  const [submitted, resubmitted, approved, rejected, total, submittedQueue, resubmittedQueue] = await Promise.all([
    getOrganizationPage({ page: 1, pageSize: 1, status: 'submitted' }),
    getOrganizationPage({ page: 1, pageSize: 1, status: 'resubmitted' }),
    getOrganizationPage({ page: 1, pageSize: 1, status: 'approved' }),
    getOrganizationPage({ page: 1, pageSize: 1, status: 'rejected' }),
    getOrganizationPage({ page: 1, pageSize: 1, status: 'all' }),
    getOrganizationPage({ page: 1, pageSize: 5, status: 'submitted', sortDirection: 'desc' }),
    getOrganizationPage({ page: 1, pageSize: 5, status: 'resubmitted', sortDirection: 'desc' }),
  ]);

  const queueItems = [...submittedQueue.items, ...resubmittedQueue.items]
    .sort((left, right) => new Date(right.submittedAt || 0) - new Date(left.submittedAt || 0))
    .slice(0, 5);
  const pendingTotal = submitted.meta.total + resubmitted.meta.total;

  const activity = queueItems.map((organization) => ({
    id: `${organization.status}-${organization.id}`,
    title: organization.status === 'resubmitted' ? 'Organization resubmitted' : 'Organization submitted',
    description: `${organization.name} entered the administrator review queue.`,
    at: organization.submittedAt,
    tone: organization.status === 'resubmitted' ? 'violet' : 'info',
  }));

  return {
    stats: {
      pending: pendingTotal,
      submitted: submitted.meta.total,
      resubmitted: resubmitted.meta.total,
      approved: approved.meta.total,
      approvedToday: approved.meta.total,
      rejected: rejected.meta.total,
      rejectedToday: rejected.meta.total,
      total: total.meta.total,
    },
    queue: queueItems,
    statusDistribution: {
      submitted: submitted.meta.total,
      resubmitted: resubmitted.meta.total,
      approved: approved.meta.total,
      rejected: rejected.meta.total,
    },
    riskDistribution: { low: 0, medium: 0, high: 0 },
    activity,
  };
};


export const adminApi = Object.freeze({
  getOverview: () =>
    env.features.mockApi ? adminMockApi.getOverview() : getRealOverview(),

  listOrganizations: async (params) => {
    if (env.features.mockApi) {
      const mockParams = {
        ...params,
        status: params?.status === 'submitted' ? 'all' : params?.status,
      };
      const result = await adminMockApi.listOrganizations(mockParams);
      const items = params?.status === 'submitted'
        ? result.items.filter((item) => ['pending', 'under_review', 'submitted', 'resubmitted'].includes(item.status))
        : result.items;
      return { ...result, items, meta: { ...result.meta, total: items.length, totalPages: 1 } };
    }
    return getOrganizationPage(params);
  },

  getOrganization: async (organizationUid) => {
    if (env.features.mockApi) return adminMockApi.getOrganization(organizationUid);
    const response = await apiClient.get(ADMIN_ENDPOINTS.organization(organizationUid), {
      skipGlobalLoader: true,
    });
    return mapAdminOrganizationDetail(unwrap(response));
  },

  approveOrganization: async (organizationUid) => {
    if (env.features.mockApi) return adminMockApi.approveOrganization(organizationUid, {});
    const response = await apiClient.patch(
      ADMIN_ENDPOINTS.organizationStatus(organizationUid),
      { status: 'approved' },
      { skipGlobalLoader: true },
    );
    return mapAdminOrganizationDetail(unwrap(response));
  },

  rejectOrganization: async (organizationUid, payload = {}) => {
    if (env.features.mockApi) return adminMockApi.rejectOrganization(organizationUid, payload);
    const rejectionReason = combineRejectionReason(payload);
    if (!rejectionReason) throw new Error('A rejection reason is required.');
    const response = await apiClient.patch(
      ADMIN_ENDPOINTS.organizationStatus(organizationUid),
      { status: 'rejected', rejectionReason },
      { skipGlobalLoader: true },
    );
    return mapAdminOrganizationDetail(unwrap(response));
  },

  // The current backend collection does not expose these organization-review actions.
  // The UI does not call them in real API mode.
  requestInformation: (organizationUid, payload) =>
    env.features.mockApi
      ? adminMockApi.requestInformation(organizationUid, payload)
      : Promise.reject(new Error('Request-more-information is not available in the current backend API.')),

  assignReviewer: (organizationUid, reviewerUid) =>
    env.features.mockApi
      ? adminMockApi.assignReviewer(organizationUid, reviewerUid)
      : Promise.reject(new Error('Reviewer assignment is not available in the current backend API.')),

  updateDocumentStatus: (organizationUid, documentUid, status, note = '') =>
    env.features.mockApi
      ? adminMockApi.updateDocumentStatus(organizationUid, documentUid, status, note)
      : Promise.reject(new Error('Document review is not available in the current backend API.')),

  previewOrganizationDocument: (organizationUid, documentUid) =>
    env.features.mockApi
      ? adminMockApi.downloadDocument(organizationUid, documentUid)
      : getOrganizationDocumentFile(organizationUid, documentUid, 'inline'),

  downloadOrganizationDocument: (organizationUid, documentUid) =>
    env.features.mockApi
      ? adminMockApi.downloadDocument(organizationUid, documentUid)
      : getOrganizationDocumentFile(organizationUid, documentUid, 'attachment'),

  downloadDocument: (organizationUid, documentUid) =>
    env.features.mockApi
      ? adminMockApi.downloadDocument(organizationUid, documentUid)
      : getOrganizationDocumentFile(organizationUid, documentUid, 'attachment'),

  addNote: (organizationUid, payload) =>
    env.features.mockApi
      ? adminMockApi.addNote(organizationUid, payload)
      : Promise.reject(new Error('Admin notes are not available in the current backend API.')),

  listReviewers: () =>
    env.features.mockApi ? adminMockApi.listReviewers() : Promise.resolve([]),

  listAuditLogs: (params) =>
    env.features.mockApi ? adminMockApi.listAuditLogs(params) : Promise.resolve({ items: [], meta: { total: 0 } }),

  listSecurityLogs: () =>
    env.features.mockApi ? adminMockApi.listSecurityLogs() : Promise.resolve([]),
});
