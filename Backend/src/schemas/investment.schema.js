const { Joi, uid } = require('./common.schema');

const INTEREST_STATUSES = ['pending', 'submitIntrest', 'verifiedByIssuer', 'claimSubmitted', 'registered', 'approved', 'rejected', 'cancelled'];
const REJECT_REASON_TYPES = ['DOC_REJECTED', 'OTHER'];

// Token statuses an admin may filter the marketplace by. Investors are always restricted to
// 'deployed' in the service regardless of what they pass here.
const TOKEN_STATUSES = ['draft', 'readyToDeploy', 'deploymentPending', 'deploymentFailed', 'deployed'];

// Marketplace list: pagination + optional name/symbol search. `status` defaults to the
// investable set ('deployed'); admins may pass any token status or 'all'.
const listTokensQuery = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  search: Joi.string().trim().max(100).allow('', null),
  status: Joi.string().valid(...TOKEN_STATUSES, 'all').default('deployed'),
});

const tokenParams = Joi.object({ tokenUid: uid.required() });

const submitInterest = Joi.object({
  note: Joi.string().trim().max(500).allow('', null),
});

const myInterestsQuery = Joi.object({
  status: Joi.string().valid(...INTEREST_STATUSES),
});

const issuerInterestsQuery = Joi.object({
  status: Joi.string().valid(...INTEREST_STATUSES, 'all').default('submitIntrest'),
});

const interestParams = Joi.object({ interestUid: uid.required() });

const registryRegistrationParams = Joi.object({
  interestUid: uid.required(),
  registryRegistrationUid: uid.required(),
});

const purchaseParams = Joi.object({ purchaseUid: uid.required() });

const purchaseHistoryQuery = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  search: Joi.string().trim().max(100).allow('').default(''),
  status: Joi.string().valid(
    'PENDING_PAYMENT',
    'PAYMENT_CONFIRMED',
    'MINT_SUBMITTED',
    'COMPLETED',
    'EXPIRED',
    'all',
  ).default('all'),
});

const createPurchase = Joi.object({
  tokenAmount: Joi.string().trim().pattern(/^(?:0|[1-9]\d*)(?:\.\d+)?$/).max(80).required().messages({
    'string.pattern.base': 'tokenAmount must be a positive decimal string.',
  }),
  idempotencyKey: Joi.string().trim().min(8).max(100).required(),
});

const confirmPurchase = Joi.object({
  txHash: Joi.string().trim().lowercase().pattern(/^0x[a-fA-F0-9]{64}$/).required(),
});

const confirmRegistryRegistration = Joi.object({
  txHash: Joi.string().trim().lowercase().pattern(/^0x[a-fA-F0-9]{64}$/).required(),
});

const emptyBody = Joi.object({});

// Issuer rejection: DOC_REJECTED requires the rejected claim-topic codes; OTHER forbids them.
const rejectInterest = Joi.object({
  rejectReasonType: Joi.string().valid(...REJECT_REASON_TYPES).required(),
  rejectReason: Joi.string().trim().max(1000).required(),
  rejectedClaims: Joi.when('rejectReasonType', {
    is: 'DOC_REJECTED',
    then: Joi.array().items(Joi.string().trim().max(80)).min(1).unique().required(),
    otherwise: Joi.array().items(Joi.string().trim().max(80)).max(0).default([]),
  }),
});

const approveInterest = Joi.object({
  note: Joi.string().trim().max(500).allow('', null),
});

const interestDocumentParams = Joi.object({
  interestUid: uid.required(),
  documentUid: uid.required(),
});

module.exports = {
  listTokensQuery,
  tokenParams,
  submitInterest,
  myInterestsQuery,
  issuerInterestsQuery,
  interestParams,
  registryRegistrationParams,
  purchaseParams,
  purchaseHistoryQuery,
  createPurchase,
  confirmPurchase,
  confirmRegistryRegistration,
  emptyBody,
  interestDocumentParams,
  rejectInterest,
  approveInterest,
  INTEREST_STATUSES,
  REJECT_REASON_TYPES,
};
