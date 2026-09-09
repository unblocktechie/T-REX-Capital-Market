const { Joi, uid } = require('./common.schema');

const claimsQuery = Joi.object({ interestId: uid.required() });

const claimParams = Joi.object({ claimId: uid.required() });

// Phase 1: prepare records a PENDING submission before the on-chain transaction.
const prepareClaim = Joi.object({ interestId: uid.required() }).unknown(false);

// The frontend sends ONLY interestId + txHash. Everything trusted (topic, data, signature,
// identity addresses, claim/application ownership, status) is derived by the backend.
const submitClaim = Joi.object({
  interestId: uid.required(),
  txHash: Joi.string().pattern(/^0x[0-9a-fA-F]{64}$/).required().messages({
    'string.pattern.base': 'txHash must be a 0x-prefixed 32-byte transaction hash.',
  }),
}).unknown(false);

module.exports = { claimsQuery, claimParams, prepareClaim, submitClaim };
