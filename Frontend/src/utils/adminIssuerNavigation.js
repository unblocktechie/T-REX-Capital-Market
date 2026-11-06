// An issuer user ID isn't an organization ID. Use only explicit organization
// identifiers or an unambiguous directory match for older monitoring records.
export const resolveAdminIssuerOrganizationUid = (record, organizations = []) => {
  const direct = record?.organizationUid || record?.issuerOrganizationUid || record?.organizationId
    || record?.issuer?.organizationUid || record?.organization?.organizationUid;
  if (typeof direct === 'string' && direct.trim()) return direct.trim();
  const name = String(record?.legalCompanyName || record?.issuerName || record?.organizationName || '').trim().toLowerCase();
  if (!name) return '';
  const matches = organizations.filter((organization) =>
    String(organization?.name || organization?.legalCompanyName || '').trim().toLowerCase() === name,
  );
  const uid = matches.length === 1 ? (matches[0].organizationUid || matches[0].id) : '';
  return typeof uid === 'string' ? uid.trim() : '';
};
