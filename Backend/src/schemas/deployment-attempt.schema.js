const { Joi, uid } = require('./common.schema');

const evmAddress = Joi.string().trim().pattern(/^0x[a-fA-F0-9]{40}$/).messages({
  'string.pattern.base': '{{#label}} must be a valid EVM wallet address.',
});

const transactionHash = Joi.string().trim().pattern(/^0x[a-fA-F0-9]{64}$/).messages({
  'string.pattern.base': 'transactionHash must be a 32-byte EVM transaction hash.',
});

// Fields the frontend must never be able to set on any deployment-attempt endpoint.
// Declaring them as forbidden makes their presence an explicit validation error
// instead of a silent strip.
const forbiddenTrustedFields = {
  status: Joi.any().forbidden(),
  contractAddress: Joi.any().forbidden(),
  blockNumber: Joi.any().forbidden(),
  confirmed: Joi.any().forbidden(),
  deployed: Joi.any().forbidden(),
  confirmedAt: Joi.any().forbidden(),
  tokenAddress: Joi.any().forbidden(),
};

const createAttempt = Joi.object({
  chainId: Joi.number().integer().positive().max(2147483647).required(),
  walletAddress: evmAddress.required(),
  idempotencyKey: Joi.string().trim().min(8).max(100).required(),
  networkName: Joi.string().trim().max(50).allow('', null),
  metadata: Joi.object().max(20).unknown(true).allow(null),
  ...forbiddenTrustedFields,
});

const submittedTransaction = Joi.object({
  transactionHash: transactionHash.required(),
  walletAddress: evmAddress.required(),
  chainId: Joi.number().integer().positive().max(2147483647).required(),
  // status/contractAddress/blockNumber etc. remain forbidden.
  ...forbiddenTrustedFields,
});

const failAttempt = Joi.object({
  status: Joi.string().valid('wallet_rejected', 'cancelled', 'failed').required(),
  errorCode: Joi.string().trim().max(80).allow('', null),
  errorMessage: Joi.string().trim().max(1000).allow('', null),
  contractAddress: Joi.any().forbidden(),
  blockNumber: Joi.any().forbidden(),
  transactionHash: Joi.any().forbidden(),
  confirmed: Joi.any().forbidden(),
  deployed: Joi.any().forbidden(),
});

const deploymentAttemptParams = Joi.object({
  deploymentAttemptUid: uid.required(),
});

module.exports = {
  createAttempt,
  submittedTransaction,
  failAttempt,
  deploymentAttemptParams,
  evmAddress,
  transactionHash,
};
