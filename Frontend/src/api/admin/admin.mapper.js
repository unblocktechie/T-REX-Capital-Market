const first = (...values) => values.find((value) => value !== undefined && value !== null && value !== '');
const text = (...values) => String(first(...values, '') || '').trim();
const number = (...values) => {
  const parsed = Number(first(...values, 0));
  return Number.isFinite(parsed) ? parsed : 0;
};
const truthy = (value) => value === true || value === 1 || value === '1' || value === 'true';

const normalizeToken = (value) => text(value).toLowerCase().replace(/[\s-]+/g, '_');

export const normalizeAdminOrganizationStatus = (value) => {
  const status = normalizeToken(value);
  if (['approved', 'rejected', 'submitted', 'resubmitted', 'under_review'].includes(status)) return status;
  if (status === 'underreview' || status === 'reviewing') return 'under_review';
  if (status === 'pending') return 'submitted';
  return status || 'submitted';
};

const initials = (value) => {
  const parts = text(value).split(/\s+/).filter(Boolean);
  return (parts.length ? parts.slice(0, 2).map((part) => part[0]).join('') : 'OR').toUpperCase();
};

const countryCodeToFlag = (countryCode) => {
  const code = text(countryCode).toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return '';
  return String.fromCodePoint(...[...code].map((character) => 127397 + character.charCodeAt(0)));
};

const joinAddress = (...parts) => parts.map((part) => text(part)).filter(Boolean).join(', ');

const mapWallet = (data) => {
  const address = text(
    data?.walletAddress,
    data?.organizationWalletAddress,
    data?.organizationWallet?.address,
    data?.wallet?.address,
  );
  const chainId = number(
    data?.walletChainId,
    data?.organizationWalletChainId,
    data?.organizationWallet?.chainId,
    data?.wallet?.chainId,
  ) || null;
  return {
    address,
    chainId,
    network: text(
      data?.walletNetwork,
      data?.organizationWalletNetwork,
      data?.organizationWallet?.network,
      data?.wallet?.network,
      address ? 'Sepolia' : '',
    ),
    provider: text(data?.walletProvider, data?.organizationWallet?.provider, data?.wallet?.provider),
    connectedAt: first(
      data?.walletConnectedAt,
      data?.organizationWallet?.connectedAt,
      data?.wallet?.connectedAt,
      data?.submittedAt,
      null,
    ),
    verified: address ? truthy(first(data?.walletVerified, data?.organizationWallet?.verified, true)) : false,
    contractAddress: text(
      data?.contractAddress,
      data?.contractaddress,
      data?.contract_address,
      data?.organizationContractAddress,
      data?.organization_contract_address,
      data?.onChainId,
      data?.onchainId,
      data?.onchainid,
      data?.on_chain_id,
      data?.organizationWallet?.contractAddress,
      data?.organizationWallet?.contractaddress,
      data?.wallet?.contractAddress,
      data?.wallet?.contractaddress,
    ),
  };
};

export const mapAdminOrganizationSummary = (data = {}) => {
  const name = text(data.legalCompanyName, data.companyName, data.organizationName, data.name, 'Unnamed organization');
  const country = text(
    data.countryName,
    data.countryOfIncorporationName,
    data.companyCountryName,
    data.country?.countryName,
    data.country,
  );
  const countryCode = text(data.countryCode, data.country?.countryCode);

  return {
    id: text(data.organizationUid, data.id),
    organizationUid: text(data.organizationUid, data.id),
    logo: initials(name),
    name,
    legalName: name,
    registrationNumber: text(data.registrationNumber, data.companyRegistrationNumber),
    country,
    countryCode,
    flag: countryCodeToFlag(countryCode),
    entityType: text(data.entityTypeName, data.entityType?.entityTypeName, data.entityType),
    submittedAt: first(data.submittedAt, data.createdAt, null),
    updatedAt: first(data.updatedAt, data.reviewedAt, data.approvedAt, data.rejectedAt, null),
    status: normalizeAdminOrganizationStatus(data.status),
    wallet: mapWallet(data),
    rejectionReason: text(data.rejectionReason),
    raw: data,
  };
};

const mapBeneficialOwner = (owner = {}, index = 0) => ({
  id: text(owner.beneficialOwnerUid, owner.id, `owner-${index + 1}`),
  name: text(owner.fullName, owner.name, `Beneficial owner ${index + 1}`),
  initials: initials(text(owner.fullName, owner.name)),
  ownership: number(owner.ownershipPercentage, owner.ownership),
  nationality: text(
    owner.nationalityCountryName,
    owner.countryName,
    owner.nationality,
    owner.nationalityCountry?.countryName,
  ),
  dateOfBirth: text(owner.dateOfBirth).slice(0, 10),
  isPrimary: truthy(owner.isPrimary),
});

const documentTone = (index) => ['blue', 'violet', 'emerald', 'amber', 'cyan'][index % 5];

const mapDocument = (document = {}, index = 0) => {
  const fileName = text(document.fileName, document.originalFileName, document.originalName, document.name, 'organization-document');
  const extension = fileName.includes('.') ? fileName.split('.').pop().toUpperCase() : text(document.fileType, 'FILE').toUpperCase();
  return {
    id: text(document.documentUid, document.id, `document-${index + 1}`),
    documentUid: text(document.documentUid, document.id),
    name: text(
      document.documentTypeName,
      document.documentType?.documentTypeName,
      document.documentType,
      document.name,
      'Organization document',
    ),
    fileName,
    type: extension,
    size: number(document.fileSize, document.sizeBytes, document.size),
    uploadedAt: first(document.uploadedAt, document.createdAt, null),
    status: normalizeToken(document.status) || 'uploaded',
    mimeType: text(document.mimeType, document.contentType),
    sourceUrl: text(
      document.previewUrl,
      document.downloadUrl,
      document.fileUrl,
      document.documentUrl,
      document.url,
      document.path,
      document.filePath,
    ),
    downloadUrl: text(document.downloadUrl, document.previewUrl, document.fileUrl, document.url),
    previewTone: documentTone(index),
  };
};

const buildProgressSteps = (data, owners, documents, wallet, status) => {
  const companyComplete = Boolean(text(data.legalCompanyName, data.companyName) && text(data.registrationNumber));
  const jurisdictionComplete = Boolean(text(data.countryOfIncorporationName, data.countryName, data.countryOfIncorporationUid));
  const finalState = status === 'approved' ? 'complete' : status === 'rejected' ? 'rejected' : 'current';
  return [
    ['Company information', companyComplete ? 'complete' : 'pending'],
    ['Jurisdiction', jurisdictionComplete ? 'complete' : 'pending'],
    ['Beneficial owners', owners.length ? 'complete' : 'pending'],
    ['Documents uploaded', documents.length ? 'complete' : 'pending'],
    ['Organization wallet', wallet.address ? 'complete' : 'pending'],
    ['Final admin decision', finalState],
  ];
};

export const mapAdminOrganizationDetail = (data = {}) => {
  const summary = mapAdminOrganizationSummary(data);
  const owners = (Array.isArray(data.beneficialOwners) ? data.beneficialOwners : []).map(mapBeneficialOwner);
  const documents = (Array.isArray(data.documents) ? data.documents : []).map(mapDocument);
  const wallet = mapWallet(data);
  const progressSteps = buildProgressSteps(data, owners, documents, wallet, summary.status);
  const completedSteps = progressSteps.filter(([, state]) => state === 'complete').length;
  const address = joinAddress(
    data.streetAddress,
    data.cityName,
    data.stateName,
    data.countryName,
    data.postalCode,
  );

  const activity = [
    summary.submittedAt
      ? {
          id: summary.status === 'resubmitted' ? 'resubmitted' : 'submitted',
          title: summary.status === 'resubmitted' ? 'Organization resubmitted' : 'Organization submitted',
          description: summary.status === 'resubmitted'
            ? 'The corrected application was resubmitted for administrator review.'
            : 'The application was submitted for administrator review.',
          at: summary.submittedAt,
          tone: summary.status === 'resubmitted' ? 'violet' : 'info',
        }
      : null,
    summary.status === 'approved'
      ? {
          id: 'approved',
          title: 'Organization approved',
          description: 'The organization was approved for the next capital market steps.',
          at: first(data.approvedAt, summary.updatedAt, new Date().toISOString()),
          tone: 'success',
        }
      : null,
    summary.status === 'rejected'
      ? {
          id: 'rejected',
          title: 'Organization rejected',
          description: summary.rejectionReason || 'The application did not pass the compliance review.',
          at: first(data.rejectedAt, summary.updatedAt, new Date().toISOString()),
          tone: 'danger',
        }
      : null,
  ].filter(Boolean);

  return {
    ...summary,
    legalName: text(data.legalCompanyName, summary.name),
    jurisdiction: text(data.countryOfIncorporationName, data.countryName),
    entityType: text(data.entityTypeName, data.entityType?.entityTypeName, data.entityType),
    taxId: text(data.taxIdentificationNumber, data.taxId, data.taxIdNumber),
    address,
    website: text(data.website),
    registrationDate: text(data.dateOfIncorporation).slice(0, 10),
    industry: text(data.industryName, data.industry?.industryName, data.industry),
    businessActivity: text(data.businessActivity),
    wallet,
    ubos: owners,
    beneficialOwners: owners,
    documents,
    progressSteps,
    progress: Math.round((completedSteps / progressSteps.length) * 100),
    activity,
  };
};

export const mapAdminPagination = (payload = {}, fallback = {}) => {
  const pagination = payload?.meta?.pagination || payload?.pagination || fallback?.meta?.pagination || fallback?.pagination || {};
  const page = number(pagination.page, fallback.page, 1) || 1;
  const pageSize = number(pagination.limit, pagination.pageSize, fallback.limit, fallback.pageSize, 20) || 20;
  const total = number(pagination.total, pagination.totalItems, fallback.total, 0);
  const totalPages = number(pagination.totalPages, Math.ceil(total / pageSize), 1) || 1;
  return { page, pageSize, total, totalPages };
};

export const mapAdminOrganizationListResponse = (response, request = {}) => {
  const body = response?.data || response || {};
  const rows = Array.isArray(body.data)
    ? body.data
    : Array.isArray(body.items)
      ? body.items
      : Array.isArray(body)
        ? body
        : [];
  return {
    items: rows.map(mapAdminOrganizationSummary),
    meta: mapAdminPagination(body, request),
  };
};
