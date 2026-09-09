const { Joi, uid } = require('./common.schema');

// A single claim topic signature. The frontend sends ONLY claimTopic + data + signature —
// never status, wallet, or any verification result (those are backend-controlled).
const claimItem = Joi.object({
  claimTopic: Joi.number().integer().min(1).required(),
  // Signed data as hex bytes (0x + even-length hex).
  data: Joi.string().pattern(/^0x([0-9a-fA-F]{2})*$/).required().messages({
    'string.pattern.base': 'data must be a 0x-prefixed hex byte string.',
  }),
  // 65-byte ECDSA signature (r,s,v) = 0x + 130 hex chars.
  signature: Joi.string().pattern(/^0x[0-9a-fA-F]{130}$/).required().messages({
    'string.pattern.base': 'signature must be a 0x-prefixed 65-byte hex signature.',
  }),
}).unknown(false);

const signClaims = Joi.object({
  subscriptionId: uid.required(),
  claims: Joi.array().items(claimItem).min(1).max(50).required(),
}).unknown(false);

const subscriptionParams = Joi.object({ subscriptionId: uid.required() });

module.exports = { signClaims, subscriptionParams };
