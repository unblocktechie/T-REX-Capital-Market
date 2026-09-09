import {
  ACCREDITATION_DOCUMENT_TYPE_OPTIONS,
  ACCREDITATION_OPTIONS,
  COUNTRY_OPTIONS,
  IDENTITY_DOCUMENT_TYPES,
  INVESTMENT_CAPACITY_OPTIONS,
  INVESTMENT_CATEGORIES,
  NET_WORTH_OPTIONS,
  SOURCE_OF_WEALTH_OPTIONS,
  INITIAL_INVESTOR_STATE,
} from '@/constants/investor';

const first = (...values) => values.find((value) => value !== undefined && value !== null);
const text = (...values) => String(first(...values, '') || '');
const cloneInitialState = () => JSON.parse(JSON.stringify(INITIAL_INVESTOR_STATE));
const titleCase = (value) =>
  String(value || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const normalizeOption = (item, { valueKeys = [], labelKeys = [] } = {}) => {
  if (typeof item === 'string' || typeof item === 'number') {
    const value = String(item);
    return { value, label: titleCase(value) };
  }

  if (!item || typeof item !== 'object') return null;
  const value = text(...valueKeys.map((key) => item[key]), item.value, item.code, item.id, item.uid);
  if (!value) return null;
  const label = text(
    ...labelKeys.map((key) => item[key]),
    item.label,
    item.name,
    item.displayName,
    value,
  );
  return { ...item, value, label };
};

const normalizeOptions = (rows, config) =>
  (Array.isArray(rows) ? rows : []).map((item) => normalizeOption(item, config)).filter(Boolean);

const optionArray = (data, keys, fallback, config) => {
  const rows = keys.map((key) => data?.[key]).find(Array.isArray);
  const normalized = normalizeOptions(rows, config);
  return normalized.length ? normalized : fallback;
};

const normalizeDocumentType = (item) => {
  const option = normalizeOption(item, {
    valueKeys: ['documentTypeUid'],
    labelKeys: ['documentTypeName', 'typeName'],
  });
  if (!option) return null;
  return {
    ...option,
    documentTypeUid: text(item?.documentTypeUid, option.value),
    documentCategory: text(item?.documentCategory, item?.category),
    claimTopicCode: text(item?.claimTopicCode, item?.claimTopic?.claimTopicCode).toUpperCase(),
    description: text(item?.description),
  };
};

const documentTypeArray = (data, keys, fallback) => {
  const rows = keys.map((key) => data?.[key]).find(Array.isArray);
  const normalized = (Array.isArray(rows) ? rows : []).map(normalizeDocumentType).filter(Boolean);
  return normalized.length ? normalized : fallback;
};

export const createFallbackInvestorOptions = () => ({
  countries: COUNTRY_OPTIONS,
  genders: [
    { value: 'male', label: 'Male' },
    { value: 'female', label: 'Female' },
    { value: 'other', label: 'Other' },
  ],
  identityDocumentTypes: IDENTITY_DOCUMENT_TYPES,
  accreditationDocumentTypes: ACCREDITATION_DOCUMENT_TYPE_OPTIONS,
  sourceOfWealth: SOURCE_OF_WEALTH_OPTIONS,
  netWorthRanges: NET_WORTH_OPTIONS,
  investmentCapacities: INVESTMENT_CAPACITY_OPTIONS,
  investmentCategories: INVESTMENT_CATEGORIES,
  accreditationTypes: ACCREDITATION_OPTIONS,
});

export const mapInvestorOptions = (data) => {
  const fallback = createFallbackInvestorOptions();
  return {
    countries: optionArray(data, ['countries', 'countryOptions'], fallback.countries, {
      valueKeys: ['countryName', 'name'],
      labelKeys: ['countryName', 'name'],
    }),
    genders: optionArray(data, ['genders', 'genderOptions'], fallback.genders),
    identityDocumentTypes: documentTypeArray(
      data,
      ['identityDocumentTypes', 'kycDocumentTypes'],
      fallback.identityDocumentTypes,
    ),
    accreditationDocumentTypes: documentTypeArray(
      data,
      ['accreditationDocumentTypes', 'accreditedDocumentTypes'],
      fallback.accreditationDocumentTypes,
    ),
    sourceOfWealth: optionArray(
      data,
      ['sourcesOfWealth', 'sourceOfWealth', 'sourceOfWealthOptions'],
      fallback.sourceOfWealth,
    ),
    netWorthRanges: optionArray(
      data,
      ['netWorthRanges', 'estimatedNetWorthOptions', 'netWorthOptions'],
      fallback.netWorthRanges,
    ),
    investmentCapacities: optionArray(
      data,
      ['investmentCapacities', 'annualInvestmentCapacities', 'investmentCapacityOptions'],
      fallback.investmentCapacities,
    ),
    investmentCategories: optionArray(
      data,
      ['investmentCategories', 'investmentCategoryOptions'],
      fallback.investmentCategories,
      { valueKeys: ['categoryCode', 'investmentCategoryCode'], labelKeys: ['categoryName'] },
    ),
    accreditationTypes: optionArray(
      data,
      ['accreditationTypes', 'accreditationTypeOptions'],
      fallback.accreditationTypes,
      { valueKeys: ['accreditationCode'], labelKeys: ['accreditationName'] },
    ),
  };
};

const documentLabelFromOptions = (document, options) => {
  const uid = text(document?.documentTypeUid, document?.documentType?.documentTypeUid);
  const allTypes = [
    ...(options?.identityDocumentTypes || []),
    ...(options?.accreditationDocumentTypes || []),
  ];
  return (
    text(
      document?.documentTypeName,
      document?.documentType?.documentTypeName,
      document?.documentType?.name,
    ) || allTypes.find((item) => String(item.value) === uid)?.label || 'Supporting document'
  );
};

export const mapInvestorDocument = (document, options) => {
  const documentUid = text(document?.documentUid, document?.id);
  const documentTypeUid = text(document?.documentTypeUid, document?.documentType?.documentTypeUid);
  const documentCategory = text(
    document?.documentCategory,
    document?.category,
    document?.documentType?.documentCategory,
  ).toLowerCase();
  const claimTopicCode = text(
    document?.claimTopicCode,
    document?.documentType?.claimTopicCode,
  ).toUpperCase();
  return {
    id: documentUid,
    documentUid,
    name: text(
      document?.originalFileName,
      document?.fileName,
      document?.originalName,
      document?.name,
      'investor-document',
    ),
    size: Number(first(document?.fileSize, document?.sizeBytes, document?.size, 0)) || 0,
    type: text(document?.mimeType, document?.contentType, document?.type, 'application/octet-stream'),
    documentType: documentTypeUid,
    documentTypeUid,
    documentTypeLabel: documentLabelFromOptions(document, options),
    documentCategory,
    claimTopicCode,
    status: 'success',
    progress: 100,
    uploadedAt: text(document?.uploadedAt, document?.createdAt, document?.updatedAt),
    error: '',
  };
};

const mapInvestmentCategories = (value) =>
  (Array.isArray(value) ? value : [])
    .map((item) =>
      typeof item === 'string'
        ? item
        : text(item?.code, item?.categoryCode, item?.investmentCategoryCode, item?.value),
    )
    .filter(Boolean);

const normalizeStep = (data, documents) => {
  const status = text(data?.status).toLowerCase();
  if (status === 'submitted') return 6;

  const raw = text(data?.currentStep).toLowerCase().replace(/[^a-z0-9]/g, '');
  if (raw === 'completed') return 4;
  if (raw === 'identitydocuments') return 2;
  if (raw === 'identitydetails') return 1;
  const numeric = Number(raw);
  if (Number.isFinite(numeric) && numeric >= 1 && numeric <= 4) return numeric;

  if (documents.some((document) => document.documentCategory === 'accredited')) return 3;
  if (documents.some((document) => document.documentCategory === 'kyc')) return 2;
  return 1;
};

const hasIdentity = (identity) =>
  Boolean(
    identity.firstName ||
      identity.lastName ||
      identity.dateOfBirth ||
      identity.streetAddress ||
      identity.countryOfResidence,
  );

const hasCompliance = (compliance) =>
  Boolean(
    compliance.sourceOfWealth ||
      compliance.estimatedNetWorth ||
      compliance.annualInvestmentCapacity ||
      compliance.investmentCategories.length ||
      compliance.accreditationType,
  );

export const mapInvestor = (data, options = createFallbackInvestorOptions()) => {
  if (!data) return cloneInitialState();

  const documents = (Array.isArray(data.documents) ? data.documents : []).map((document) =>
    mapInvestorDocument(document, options),
  );
  const identityDocuments = documents.filter((document) => document.documentCategory === 'kyc');
  const accreditationDocuments = documents.filter(
    (document) => document.documentCategory === 'accredited',
  );

  const countryOfResidence = text(
    data.countryUid,
    data.countryOfResidenceUid,
    data.country?.countryUid,
    data.countryOfResidence,
  );
  const stateProvince = text(
    data.stateUid,
    data.stateProvinceUid,
    data.state?.stateUid,
    data.stateProvince,
  );
  const city = text(data.cityUid, data.city?.cityUid, data.city);
  const identity = {
    firstName: text(data.firstName),
    lastName: text(data.lastName),
    dateOfBirth: text(data.dateOfBirth).slice(0, 10),
    gender: text(data.gender),
    streetAddress: text(data.streetAddress),
    city,
    cityName: text(
      data.cityName,
      data.city?.cityName,
      data.city?.name,
      data.cityUid ? '' : data.city,
    ),
    stateProvince,
    stateProvinceName: text(
      data.stateName,
      data.stateProvinceName,
      data.state?.stateName,
      data.state?.name,
      data.stateUid || data.stateProvinceUid ? '' : data.stateProvince,
    ),
    countryOfResidence,
    countryOfResidenceName: text(
      data.countryName,
      data.countryOfResidenceName,
      data.country?.countryName,
      data.country?.name,
      data.countryUid || data.countryOfResidenceUid ? '' : data.countryOfResidence,
    ),
  };
  const compliance = {
    sourceOfWealth: text(data.sourceOfWealth),
    estimatedNetWorth: text(data.estimatedNetWorth),
    annualInvestmentCapacity: text(data.annualInvestmentCapacity),
    investmentCategories: mapInvestmentCategories(data.investmentCategories),
    yearsOfExperience:
      first(data.yearsOfExperience, '') === '' ? '' : String(first(data.yearsOfExperience, '')),
    previousRwaExperience: text(data.previousRwaExperience),
    rwaExperienceDescription: text(data.rwaExperienceDescription),
    accreditationType: text(data.accreditationType),
    accreditationDocuments,
  };
  const currentStep = normalizeStep(data, documents);
  let highestStepReached = currentStep;
  if (hasIdentity(identity)) highestStepReached = Math.max(highestStepReached, 1);
  if (identityDocuments.length) highestStepReached = Math.max(highestStepReached, 2);
  if (hasCompliance(compliance) || accreditationDocuments.length) {
    highestStepReached = Math.max(highestStepReached, 3);
  }
  if (text(data.currentStep).toLowerCase() === 'completed') highestStepReached = Math.max(highestStepReached, 4);
  if (text(data.status).toLowerCase() === 'submitted') highestStepReached = 6;

  return {
    ...cloneInitialState(),
    investorUid: text(data.investorUid, data.investorMasterUid, data.id),
    backendStatus: text(data.status),
    isDraft: Boolean(data.isDraft),
    currentStep,
    highestStepReached,
    identity,
    documents: { identityDocuments },
    compliance,
    wallet: {
      isConnected: Boolean(text(data.walletAddress)),
      address: text(data.walletAddress),
      network: '',
      balance: '',
    },
    investorProfile: {
      profileId: text(data.profileReference),
      onchainId: text(data.onchainIdReference),
      status: text(data.status),
    },
    investmentRequest: {
      requestId: text(data.profileReference),
      assetName: '',
      requestedAmount: '',
      submissionDate: text(data.submittedAt, data.updatedAt),
      status: text(data.status),
    },
    lastUpdated: text(data.updatedAt, data.createdAt),
  };
};

const compactDraftPayload = (payload) =>
  Object.fromEntries(
    Object.entries(payload).filter(([key, value]) => {
      if (key === 'isDraft') return true;
      if (Array.isArray(value)) return value.length > 0;
      if (typeof value === 'number') return Number.isFinite(value);
      return value !== '' && value !== null && value !== undefined;
    }),
  );

export const toIdentityPayload = (identity, isDraft = false) => {
  const payload = {
    firstName: identity.firstName?.trim() || '',
    lastName: identity.lastName?.trim() || '',
    dateOfBirth: identity.dateOfBirth || '',
    gender: identity.gender || '',
    streetAddress: identity.streetAddress?.trim() || '',
    countryUid: identity.countryOfResidence || '',
    stateUid: identity.stateProvince || '',
    cityUid: identity.city || '',
    isDraft: Boolean(isDraft),
  };

  // The backend allows identity completion without cityUid when the city master
  // cannot return a city for the selected state. Omit the field instead of
  // sending an invalid empty UUID.
  if (!payload.cityUid) delete payload.cityUid;

  return isDraft ? compactDraftPayload(payload) : payload;
};

export const toCompliancePayload = (compliance, isDraft = false) => {
  const parsedYears = Number(compliance.yearsOfExperience);
  const payload = {
    sourceOfWealth: compliance.sourceOfWealth || '',
    estimatedNetWorth: compliance.estimatedNetWorth || '',
    annualInvestmentCapacity: compliance.annualInvestmentCapacity || '',
    investmentCategories: Array.isArray(compliance.investmentCategories)
      ? compliance.investmentCategories
      : [],
    yearsOfExperience:
      compliance.yearsOfExperience === '' || compliance.yearsOfExperience === undefined
        ? ''
        : parsedYears,
    previousRwaExperience: compliance.previousRwaExperience || '',
    accreditationType: compliance.accreditationType || '',
    isDraft: Boolean(isDraft),
  };
  return isDraft ? compactDraftPayload(payload) : payload;
};
