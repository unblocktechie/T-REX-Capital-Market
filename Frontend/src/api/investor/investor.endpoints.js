export const INVESTOR_ENDPOINTS = Object.freeze({
  options: '/investor-options',
  me: '/investors/me',
  identity: '/investors/me/identity',
  compliance: '/investors/me/compliance',
  documents: '/investors/me/documents',
  document: (documentUid) => `/investors/me/documents/${encodeURIComponent(documentUid)}`,
  downloadDocument: (documentUid) =>
    `/investors/me/documents/${encodeURIComponent(documentUid)}/download`,
  submit: '/investors/me/submit',
  claims: '/investor/claims',
  prepareClaim: (claimId) => `/investor/claims/${encodeURIComponent(claimId)}/prepare`,
  retryClaim: (claimId) => `/investor/claims/${encodeURIComponent(claimId)}/retry`,
  submitClaim: (claimId) => `/investor/claims/${encodeURIComponent(claimId)}/submit`,
});
