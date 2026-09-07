export const ADMIN_ENDPOINTS = Object.freeze({
  organizations: '/admin/organizations',
  organization: (organizationUid) =>
    `/admin/organizations/${encodeURIComponent(organizationUid)}`,
  organizationStatus: (organizationUid) =>
    `/admin/organizations/${encodeURIComponent(organizationUid)}/status`,
  organizationDocumentFile: (organizationUid, documentUid) =>
    `/admin/organizations/${encodeURIComponent(organizationUid)}/documents/${encodeURIComponent(documentUid)}/file`,
  users: '/users',
});
