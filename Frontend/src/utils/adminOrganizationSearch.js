/** Filter only the organizations loaded for the current page of results. */
export function filterOrganizationsByQuery(organizations = [], query = '') {
  const term = String(query).trim().toLowerCase();
  if (!term) return organizations;
  return organizations.filter((organization) => [
    organization.name,
    organization.registrationNumber,
    organization.wallet?.address,
  ].some((value) => value != null && String(value).toLowerCase().includes(term)));
}
