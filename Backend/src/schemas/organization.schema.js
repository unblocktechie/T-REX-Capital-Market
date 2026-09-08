const { Joi, uid } = require('./common.schema');

const optionalText = (max) => Joi.string().trim().max(max).allow('', null);
const optionalUid = uid.allow(null);

const locationListQuery = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(250).default(50),
  search: Joi.string().trim().max(100),
});

const companyInformation = Joi.object({
  legalCompanyName: optionalText(200),
  entityTypeUid: optionalUid,
  registrationNumber: optionalText(100),
  streetAddress: optionalText(255),
  countryUid: optionalUid,
  stateUid: optionalUid,
  cityUid: optionalUid,
  postalCode: optionalText(20),
  isDraft: Joi.boolean().required(),
});

const jurisdiction = Joi.object({
  countryOfIncorporationUid: optionalUid,
  dateOfIncorporation: Joi.date().iso().max('now').allow(null),
  taxIdentificationNumber: Joi.string().trim().pattern(/^[A-Za-z0-9][A-Za-z0-9\-./ ]{1,99}$/).allow('', null),
  industryUid: optionalUid,
  businessActivity: optionalText(5000),
  website: Joi.string().trim().uri({ scheme: ['http', 'https'] }).max(500).allow('', null),
  isDraft: Joi.boolean().required(),
});

const beneficialOwner = Joi.object({
  fullName: optionalText(120),
  dateOfBirth: Joi.date().iso().max('now').allow(null),
  nationalityCountryUid: optionalUid,
  ownershipPercentage: Joi.number().precision(2).min(0).allow(null),
  isPrimary: Joi.boolean().default(false),
});

const beneficialOwners = Joi.object({
  owners: Joi.array().items(beneficialOwner).max(20).required(),
  isDraft: Joi.boolean().required(),
});

const submitOrganization = Joi.object({
  walletAddress: Joi.string().trim().pattern(/^0x[a-fA-F0-9]{40}$/).required().messages({
    'string.pattern.base': 'walletAddress must be a valid EVM wallet address.',
  }),
});

const adminOrganizationListQuery = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  search: Joi.string().trim().max(100),
  status: Joi.string().valid('submitted', 'resubmitted', 'underReview', 'approved', 'rejected'),
  sortBy: Joi.string().valid('legalCompanyName', 'status', 'submittedAt', 'updatedAt').default('submittedAt'),
  sortOrder: Joi.string().lowercase().valid('asc', 'desc').default('desc'),
});

const reviewOrganization = Joi.object({
  status: Joi.string().valid('approved', 'rejected').required(),
  rejectionReason: Joi.when('status', {
    is: 'rejected',
    then: Joi.string().trim().min(10).max(2000).required(),
    otherwise: Joi.forbidden(),
  }),
});

const documentUpload = Joi.object({ documentTypeUid: uid.required() });
const documentParams = Joi.object({ documentUid: uid.required() });
const organizationParams = Joi.object({ organizationUid: uid.required() });
const adminDocumentParams = Joi.object({
  organizationUid: uid.required(),
  documentUid: uid.required(),
});
const adminDocumentFileQuery = Joi.object({
  disposition: Joi.string().valid('inline', 'attachment').default('inline'),
});
const countryParams = Joi.object({ countryUid: uid.required() });
const stateParams = Joi.object({ stateUid: uid.required() });

module.exports = {
  locationListQuery, companyInformation, jurisdiction, beneficialOwners, documentUpload,
  submitOrganization, adminOrganizationListQuery, reviewOrganization,
  documentParams, organizationParams, adminDocumentParams, adminDocumentFileQuery,
  countryParams, stateParams,
};
