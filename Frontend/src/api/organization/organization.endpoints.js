export const ORGANIZATION_ENDPOINTS = Object.freeze({
  options: '/organization-options',
  countries: '/locations/countries',
  states: (countryUid) => `/locations/countries/${encodeURIComponent(countryUid)}/states`,
  cities: (stateUid) => `/locations/states/${encodeURIComponent(stateUid)}/cities`,
  me: '/organizations/me',
  company: '/organizations/me/company-information',
  jurisdiction: '/organizations/me/jurisdiction',
  beneficialOwners: '/organizations/me/beneficial-owners',
  documents: '/organizations/me/documents',
  document: (documentUid) => `/organizations/me/documents/${encodeURIComponent(documentUid)}`,
  downloadDocument: (documentUid) =>
    `/organizations/me/documents/${encodeURIComponent(documentUid)}/download`,
  submit: '/organizations/me/submit',
  userNotified: '/organizations/me/user-notified',
});
