import {
  ORGANIZATION_STATUSES,
  createInitialOrganization,
} from '@/services/organizationStorageService';
import { organizationUiStateService } from '@/services/organizationUiStateService';

const STEP_NUMBER = Object.freeze({
  companyinformation: 1,
  jurisdiction: 2,
  beneficialowners: 3,
  documents: 4,
  completed: 5,
});

const first = (...values) => values.find((value) => value !== undefined && value !== null);
const text = (...values) => String(first(...values, '') || '');
const flag = (value) => value === true || value === 1 || value === '1';

const inferHighestStepReached = (data, currentStep, beneficialOwners, documents) => {
  let inferred = currentStep;
  const companyComplete = Boolean(
    text(data.legalCompanyName) &&
      text(data.entityTypeUid) &&
      text(data.registrationNumber) &&
      text(data.streetAddress) &&
      text(data.countryUid) &&
      text(data.stateUid) &&
      text(data.cityUid) &&
      text(data.postalCode),
  );
  const jurisdictionComplete = Boolean(
    text(data.countryOfIncorporationUid) &&
      text(data.dateOfIncorporation) &&
      text(data.industryUid) &&
      text(data.businessActivity),
  );

  if (companyComplete) inferred = Math.max(inferred, 2);
  if (companyComplete && jurisdictionComplete) inferred = Math.max(inferred, 3);
  if (companyComplete && jurisdictionComplete && beneficialOwners.length) {
    inferred = Math.max(inferred, 4);
  }
  if (
    companyComplete &&
    jurisdictionComplete &&
    beneficialOwners.length &&
    documents.length
  ) {
    inferred = 5;
  }

  return inferred;
};

const mapBackendStatus = (status, isNotified) => {
  const normalized = String(status || '').toLowerCase().replace(/[^a-z]/g, '');
  if (normalized === 'approved') {
    return isNotified
      ? ORGANIZATION_STATUSES.VERIFIED
      : ORGANIZATION_STATUSES.VERIFIED_SUCCESS_PENDING;
  }
  if (normalized === 'submitted' || normalized === 'underreview' || normalized === 'resubmitted') {
    return ORGANIZATION_STATUSES.SUBMITTED;
  }
  if (normalized === 'rejected') {
    return ORGANIZATION_STATUSES.REJECTED;
  }
  if (normalized === 'draft') {
    return ORGANIZATION_STATUSES.DRAFT;
  }
  return ORGANIZATION_STATUSES.NOT_STARTED;
};

export const mapOrganizationOptions = (data) => ({
  entityTypes: Array.isArray(data?.entityTypes) ? data.entityTypes : [],
  industries: Array.isArray(data?.industries) ? data.industries : [],
  documentTypes: Array.isArray(data?.documentTypes)
    ? data.documentTypes.map((item) => ({ ...item, isRequired: flag(item.isRequired) }))
    : [],
});

export const toSelectOptions = (rows, valueKey, labelKey) =>
  (Array.isArray(rows) ? rows : [])
    .filter((row) => row?.[valueKey])
    .map((row) => ({ value: row[valueKey], label: row[labelKey] || row[valueKey] }));

export const mapOrganizationDocument = (document) => ({
  id: text(document?.documentUid, document?.id),
  documentUid: text(document?.documentUid, document?.id),
  documentTypeUid: text(document?.documentTypeUid),
  documentType: text(
    document?.documentTypeName,
    document?.documentType?.documentTypeName,
    document?.documentType,
    'Organization Document',
  ),
  fileName: text(
    document?.fileName,
    document?.originalFileName,
    document?.originalName,
    document?.name,
    'organization-document',
  ),
  fileSize: Number(first(document?.fileSize, document?.sizeBytes, document?.size, 0)) || 0,
  mimeType: text(document?.mimeType, document?.contentType, 'application/octet-stream'),
  uploadedAt: text(document?.uploadedAt, document?.createdAt, new Date().toISOString()),
});

export const mapOrganization = (data) => {
  if (!data) return createInitialOrganization();

  const organizationUid = text(data.organizationUid, data.id);
  const normalizedStep = String(data.currentStep || '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
  const currentStep = STEP_NUMBER[normalizedStep] || 1;
  const documents = Array.isArray(data.documents)
    ? data.documents.map(mapOrganizationDocument)
    : [];
  const beneficialOwners = (Array.isArray(data.beneficialOwners) ? data.beneficialOwners : []).map(
    (owner, index) => ({
      id: text(owner.beneficialOwnerUid, owner.id, `ubo-${index}`),
      beneficialOwnerUid: text(owner.beneficialOwnerUid, owner.id),
      fullName: text(owner.fullName),
      dateOfBirth: text(owner.dateOfBirth).slice(0, 10),
      nationality: text(owner.nationalityCountryUid, owner.countryUid),
      nationalityName: text(owner.nationalityCountryName, owner.countryName, owner.nationality),
      ownershipPercentage: first(owner.ownershipPercentage, ''),
      isPrimary: flag(owner.isPrimary),
      relationship: text(owner.relationship, owner.isPrimary ? 'Primary beneficial owner' : ''),
    }),
  );

  const isNotified = flag(
    first(
      data.isNotified,
      data.is_notified,
      data.userNotified,
      data.isUserNotified,
      data.isusernotified,
      data.is_user_notified,
      data.user_notified,
    ),
  );
  const highestStepReached = Math.max(
    currentStep,
    inferHighestStepReached(data, currentStep, beneficialOwners, documents),
    organizationUiStateService.getHighestStepReached(organizationUid),
  );
  organizationUiStateService.setHighestStepReached(organizationUid, highestStepReached);

  return {
    version: 2,
    organizationUid,
    backendStatus: text(data.status),
    status: mapBackendStatus(data.status, isNotified),
    currentStep,
    highestStepReached,
    submittedAt: first(data.submittedAt, null),
    verifiedAt: first(data.approvedAt, data.verifiedAt, data.updatedAt, null),
    rejectedAt: first(data.rejectedAt, data.reviewedAt, data.updatedAt, null),
    rejectionReason: text(data.rejectionReason, data.rejection_reason, data.reviewComment),
    canResubmit: flag(first(data.canResubmit, data.can_resubmit, data.isResubmissionAllowed)),
    isNotified,
    verifiedScreenViewed: isNotified,
    isDraft: flag(data.isDraft),
    walletAddress: text(
      data.walletAddress,
      data.organizationWalletAddress,
      data.organizationWallet?.address,
      data.wallet?.address,
    ),
    walletChainId: Number(
      first(
        data.walletChainId,
        data.organizationWalletChainId,
        data.organizationWallet?.chainId,
        data.wallet?.chainId,
        0,
      ),
    ) || null,
    walletNetwork: text(
      data.walletNetwork,
      data.organizationWalletNetwork,
      data.organizationWallet?.network,
      data.wallet?.network,
    ),
    contractAddress: text(
      data.contractAddress,
      data.contractaddress,
      data.contract_address,
      data.organizationContractAddress,
      data.organization_contract_address,
      data.onChainId,
      data.onchainId,
      data.onchainid,
      data.on_chain_id,
      data.organizationWallet?.contractAddress,
      data.organizationWallet?.contractaddress,
      data.wallet?.contractAddress,
      data.wallet?.contractaddress,
    ),
    company: {
      legalName: text(data.legalCompanyName),
      entityType: text(data.entityTypeUid),
      entityTypeName: text(data.entityTypeName, data.entityType?.entityTypeName),
      registrationNumber: text(data.registrationNumber),
      postalCode: text(data.postalCode),
      address: {
        street: text(data.streetAddress),
        country: text(data.countryUid),
        countryName: text(data.countryName),
        state: text(data.stateUid),
        stateName: text(data.stateName),
        city: text(data.cityUid),
        cityName: text(data.cityName),
      },
    },
    jurisdiction: {
      countryOfIncorporation: text(data.countryOfIncorporationUid),
      countryOfIncorporationName: text(data.countryOfIncorporationName),
      dateOfIncorporation: text(data.dateOfIncorporation).slice(0, 10),
      taxIdentificationNumber: text(data.taxIdentificationNumber),
      industry: text(data.industryUid),
      industryName: text(data.industryName, data.industry?.industryName),
      businessActivity: text(data.businessActivity),
      website: text(data.website),
    },
    beneficialOwners,
    documents,
    confirmations: organizationUiStateService.getConfirmations(organizationUid),
  };
};

export const toCompanyPayload = (company, isDraft) => ({
  legalCompanyName: company.legalName?.trim() || '',
  entityTypeUid: company.entityType || '',
  registrationNumber: company.registrationNumber?.trim() || '',
  streetAddress: company.address?.street?.trim() || '',
  countryUid: company.address?.country || '',
  stateUid: company.address?.state || '',
  cityUid: company.address?.city || '',
  postalCode: company.postalCode?.trim() || '',
  isDraft: Boolean(isDraft),
});

export const toJurisdictionPayload = (jurisdiction, isDraft) => {
  const taxIdentificationNumber = jurisdiction.taxIdentificationNumber?.trim() || '';
  const website = jurisdiction.website?.trim() || '';

  return {
    countryOfIncorporationUid: jurisdiction.countryOfIncorporation || '',
    dateOfIncorporation: jurisdiction.dateOfIncorporation || '',
    industryUid: jurisdiction.industry || '',
    businessActivity: jurisdiction.businessActivity?.trim() || '',
    ...(taxIdentificationNumber ? { taxIdentificationNumber } : {}),
    ...(website ? { website } : {}),
    isDraft: Boolean(isDraft),
  };
};

const isBackendUid = (value) => /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(String(value || ''));

export const toBeneficialOwnersPayload = (owners, isDraft) => ({
  owners: (Array.isArray(owners) ? owners : []).map((owner, index) => ({
    ...(isBackendUid(owner.beneficialOwnerUid || owner.id)
      ? { beneficialOwnerUid: owner.beneficialOwnerUid || owner.id }
      : {}),
    fullName: owner.fullName?.trim() || '',
    dateOfBirth: owner.dateOfBirth || '',
    nationalityCountryUid: owner.nationality || '',
    ownershipPercentage:
      owner.ownershipPercentage === '' || owner.ownershipPercentage == null
        ? null
        : Number(owner.ownershipPercentage),
    isPrimary: index === 0,
  })),
  isDraft: Boolean(isDraft),
});

export const enrichOrganizationLabels = (organization, options) => {
  if (!organization) return organization;
  const entityType = options?.entityTypes?.find(
    (item) => item.entityTypeUid === organization.company.entityType,
  );
  const industry = options?.industries?.find(
    (item) => item.industryUid === organization.jurisdiction.industry,
  );
  const documentTypes = new Map(
    (options?.documentTypes || []).map((item) => [item.documentTypeUid, item]),
  );

  return {
    ...organization,
    company: {
      ...organization.company,
      entityTypeName:
        organization.company.entityTypeName || entityType?.entityTypeName || '',
    },
    jurisdiction: {
      ...organization.jurisdiction,
      industryName:
        organization.jurisdiction.industryName || industry?.industryName || '',
    },
    documents: organization.documents.map((document) => ({
      ...document,
      documentType:
        document.documentType === 'Organization Document'
          ? documentTypes.get(document.documentTypeUid)?.documentTypeName ||
            document.documentType
          : document.documentType,
    })),
  };
};
