const { Joi, uid } = require('./common.schema');

const evmAddress = Joi.string().trim().pattern(/^0x[a-fA-F0-9]{40}$/).messages({
  'string.pattern.base': '{{#label}} must be a valid EVM wallet address.',
});

const tokenName = Joi.string()
  .trim()
  .min(3)
  .max(50)
  .pattern(/^[A-Za-z0-9][A-Za-z0-9 .'-]{1,48}[A-Za-z0-9]$/)
  .pattern(/ {2,}/, { invert: true })
  .allow('', null)
  .messages({
    'string.pattern.base': 'tokenName may contain letters, numbers, spaces, hyphens, periods, and apostrophes; it cannot start/end with punctuation or contain consecutive spaces.',
  });

const tokenInformation = Joi.object({
  chainUid: uid,
  tokenName,
  tokenSymbol: Joi.string().trim().uppercase().pattern(/^[A-Z0-9]{2,10}$/).allow('', null).messages({
    'string.pattern.base': 'tokenSymbol must contain 2 to 10 uppercase letters or numbers.',
  }),
  decimals: Joi.number().integer().valid(2, 6, 8, 18).allow('', null),
  initialTokenPrice: Joi.number().positive().precision(18).max(999999999999999999).allow('', null),
  treasuryWalletAddress: evmAddress.allow('', null),
  paymentTokenAddress: evmAddress.allow('', null),
  tokenDescription: Joi.string().trim().max(2000).allow('', null),
  isDraft: Joi.boolean().required(),
});

const tokenClaims = Joi.object({
  claimTopicUids: Joi.array().items(uid.required()).unique().max(20).required(),
  organizationActsAsTrustedClaimIssuer: Joi.boolean().required(),
  isDraft: Joi.boolean().required(),
});

const tokenCompliance = Joi.object({
  maxInvestors: Joi.number().integer().min(1).max(1000000000).allow(null),
  maxBalancePerInvestor: Joi.number().positive().precision(18).allow(null),
  countryRestrictionMode: Joi.string().valid('allowlist', 'blocklist').allow(null),
  // The array itself is required so clients must state their intent, but it may
  // be empty to explicitly configure no geographic restriction.
  countryUids: Joi.array().items(uid).unique().max(250).required(),
  isDraft: Joi.boolean().required(),
});

const tokenGovernance = Joi.object({
  tokenAgentWalletAddress: evmAddress.allow('', null),
  identityManagerWalletAddress: evmAddress.allow('', null),
  isDraft: Joi.boolean().required(),
});

const tokenSubmit = Joi.object({
  transactionHash: Joi.string().trim().pattern(/^0x[a-fA-F0-9]{64}$/).required().messages({
    'string.pattern.base': 'transactionHash must be a 32-byte EVM transaction hash.',
  }),
  // Optional link to a deployment attempt. When omitted, legacy behavior is preserved
  // and the backend auto-links any attempt by (tokenUid, transactionHash).
  deploymentAttemptUid: uid,
});

const tokenPriceUpdate = Joi.object({
  priceUpdateUid: Joi.string().guid({ version: 'uuidv4' }).required(),
  txHash: Joi.string().trim().pattern(/^0x[a-fA-F0-9]{64}$/).required(),
  currentTokenPrice: Joi.number()
    .positive()
    .precision(18)
    .max(999999999999999999)
    .required(),
});

const tokenDirectPricePrepare = tokenPriceUpdate.fork(['txHash', 'priceUpdateUid'], (field) => field.forbidden());

const positiveDecimalPrice = Joi.alternatives().try(
  Joi.number().positive().precision(18).max(999999999999999999),
  Joi.string().trim().pattern(/^(?:0|[1-9][0-9]{0,17})(?:\.[0-9]{1,18})?$/),
).required();

const tokenPriceRelayPrepare = Joi.object({ price: positiveDecimalPrice });

const bytes32 = Joi.string().trim().pattern(/^0x[a-fA-F0-9]{64}$/);
const tokenPriceRelaySubmit = Joi.object({
  tokenAddress: evmAddress.required(),
  newPriceRaw: Joi.string().trim().pattern(/^[1-9][0-9]{0,77}$/).required(),
  nonce: Joi.string().trim().pattern(/^(?:0|[1-9][0-9]{0,77})$/).required(),
  deadline: Joi.number().integer().positive().required(),
  v: Joi.number().integer().valid(0, 1, 27, 28).required(),
  r: bytes32.required(),
  s: bytes32.required(),
});

const tokenPriceUpdateParams = Joi.object({ priceUpdateUid: uid.required() });
const tokenPriceHistoryQuery = Joi.object({
  tokenUid: Joi.string().guid({ version: 'uuidv4' }),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  search: Joi.string().trim().max(100).allow('').default(''),
  source: Joi.string().valid('all', 'manual', 'automated', 'legacy', 'blockchain').default('all'),
  status: Joi.string().valid('all', 'PENDING', 'SUBMITTED', 'CONFIRMED', 'FAILED', 'CANCELLED', 'EXPIRED', 'ORPHANED', 'APPLIED').default('all'),
});

module.exports = {
  tokenPriceRecovery: Joi.object({ txHash: bytes32, confirmNotBroadcast: Joi.boolean().default(false) }),
  tokenDirectPricePrepare,
  tokenInformation,
  tokenClaims,
  tokenCompliance,
  tokenGovernance,
  tokenSubmit,
  tokenPriceUpdate,
  tokenPriceRelayPrepare,
  tokenPriceRelaySubmit,
  tokenPriceUpdateParams,
  tokenPriceHistoryQuery,
};
