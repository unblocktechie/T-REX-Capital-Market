export const ORGANIZATION_STATUSES = Object.freeze({
  NOT_STARTED: 'NOT_STARTED',
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
  REJECTED: 'REJECTED',
  VERIFIED_SUCCESS_PENDING: 'VERIFIED_SUCCESS_PENDING',
  VERIFIED: 'VERIFIED',
});

export const createInitialOrganization = () => ({
  version: 2,
  organizationUid: '',
  backendStatus: '',
  status: ORGANIZATION_STATUSES.NOT_STARTED,
  currentStep: 1,
  highestStepReached: 1,
  submittedAt: null,
  verifiedAt: null,
  rejectedAt: null,
  rejectionReason: '',
  canResubmit: false,
  isNotified: false,
  verifiedScreenViewed: false,
  isDraft: true,
  walletAddress: '',
  walletChainId: null,
  walletNetwork: '',
  company: {
    legalName: '',
    entityType: '',
    entityTypeName: '',
    registrationNumber: '',
    postalCode: '',
    address: {
      street: '',
      city: '',
      cityName: '',
      state: '',
      stateName: '',
      country: '',
      countryName: '',
    },
  },
  jurisdiction: {
    countryOfIncorporation: '',
    countryOfIncorporationName: '',
    dateOfIncorporation: '',
    taxIdentificationNumber: '',
    industry: '',
    industryName: '',
    businessActivity: '',
    website: '',
  },
  beneficialOwners: [],
  documents: [],
  confirmations: {
    ownershipAccurate: false,
    processingTimeAccepted: false,
    authorizedSubmitter: false,
  },
});

export const isOrganizationWorkspaceUnlocked = (organization) =>
  organization?.status === ORGANIZATION_STATUSES.VERIFIED &&
  organization?.isNotified === true;

export const getOrganizationDestination = (organization) => {
  switch (organization.status) {
    case ORGANIZATION_STATUSES.DRAFT:
      return Math.min(Math.max(Number(organization.currentStep) || 1, 1), 5);
    case ORGANIZATION_STATUSES.SUBMITTED:
      return 'pending';
    case ORGANIZATION_STATUSES.REJECTED:
      return 'rejected';
    case ORGANIZATION_STATUSES.VERIFIED_SUCCESS_PENDING:
      return organization.verifiedScreenViewed ? 'overview' : 'verified';
    case ORGANIZATION_STATUSES.VERIFIED:
      return 'overview';
    case ORGANIZATION_STATUSES.NOT_STARTED:
    default:
      return 1;
  }
};
