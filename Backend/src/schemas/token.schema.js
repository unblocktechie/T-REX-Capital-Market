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
  tokenName,
  tokenSymbol: Joi.string().trim().uppercase().pattern(/^[A-Z0-9]{2,10}$/).allow('', null).messages({
    'string.pattern.base': 'tokenSymbol must contain 2 to 10 uppercase letters or numbers.',
  }),
  decimals: Joi.number().integer().valid(2, 6, 8, 18).allow('', null),
  initialTokenPrice: Joi.number().positive().precision(18).max(999999999999999999).allow('', null),
  treasuryWalletAddress: evmAddress.allow('', null),
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
  countryUids: Joi.array().items(uid.required()).unique().max(250).required(),
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
});

module.exports = {
  tokenInformation,
  tokenClaims,
  tokenCompliance,
  tokenGovernance,
  tokenSubmit,
};
