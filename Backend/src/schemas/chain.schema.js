const { Joi, uid, booleanQuery, listQuery } = require('./common.schema');

const evmAddress = Joi.string().trim().pattern(/^0x[a-fA-F0-9]{40}$/);
const privateKey = Joi.string().trim().pattern(/^(0x)?[a-fA-F0-9]{64}$/);
const url = Joi.string().trim().uri({ scheme: ['http', 'https', 'ws', 'wss'] }).max(1000);

const chainFields = {
  chainCode: Joi.string().trim().uppercase().pattern(/^[A-Z0-9_]{2,40}$/),
  chainName: Joi.string().trim().min(2).max(100),
  chainId: Joi.number().integer().positive().max(Number.MAX_SAFE_INTEGER),
  networkName: Joi.string().trim().min(2).max(80),
  nativeCurrencyName: Joi.string().trim().min(1).max(50),
  nativeCurrencySymbol: Joi.string().trim().uppercase().min(1).max(12),
  nativeCurrencyDecimals: Joi.number().integer().min(0).max(36),
  rpcUrl: url,
  fallbackRpcUrls: Joi.array().items(url).unique().max(10),
  publicRpcUrl: url.allow(null, ''),
  explorerUrl: Joi.string().trim().uri({ scheme: ['http', 'https'] }).max(500).allow(null, ''),
  contractSuiteDeployedAt: Joi.date().iso(),
  trexImplementationAuthorityAddress: evmAddress,
  trexGatewayAddress: evmAddress,
  identityImplementationAuthorityAddress: evmAddress,
  identityFactoryAddress: evmAddress,
  platformControllerAddress: evmAddress,
  trexFactoryAddress: evmAddress,
  countryRestrictModuleAddress: evmAddress,
  maxBalanceModuleAddress: evmAddress,
  maxInvestorsModuleAddress: evmAddress,
  platformControllerOwnerAddress: evmAddress,
  idFactoryAccessManagerAddress: evmAddress,
  idFactoryAccessManagerAdminAddress: evmAddress.allow(null, ''),
  tokenImplementationAddress: evmAddress,
  claimTopicsRegistryImplementationAddress: evmAddress,
  identityRegistryImplementationAddress: evmAddress,
  identityRegistryStorageImplementationAddress: evmAddress,
  trustedIssuersRegistryImplementationAddress: evmAddress,
  modularComplianceImplementationAddress: evmAddress,
  identityImplementationAddress: evmAddress,
  paymentTokenAddresses: Joi.array().items(evmAddress.required()).unique().min(1).max(50),
  deployerAddress: evmAddress.allow(null, ''),
  deployerPrivateKey: privateKey.allow(null, ''),
  confirmations: Joi.number().integer().min(1).max(1000),
  registryConfirmations: Joi.number().integer().min(1).max(1000),
  transactionTimeoutMs: Joi.number().integer().min(1000).max(900000),
  deploymentStartBlock: Joi.number().integer().min(0).max(Number.MAX_SAFE_INTEGER),
  claimIndexerStartBlock: Joi.number().integer().min(0).max(Number.MAX_SAFE_INTEGER),
  registryIndexerStartBlock: Joi.number().integer().min(0).max(Number.MAX_SAFE_INTEGER),
  transactionIndexerStartBlock: Joi.number().integer().min(0).max(Number.MAX_SAFE_INTEGER),
  registryRecoveryLookbackBlocks: Joi.number().integer().min(1000).max(Number.MAX_SAFE_INTEGER),
  registryRecoveryBlockOffset: Joi.number().integer().min(100).max(100000),
  reconcileBlockOffset: Joi.number().integer().min(100).max(100000),
  reconcileMaxLookbackBlocks: Joi.number().integer().min(1000).max(Number.MAX_SAFE_INTEGER),
  deploymentAttemptTtlMinutes: Joi.number().integer().min(1).max(1440),
  delegationManagerAddresses: Joi.array().items(evmAddress).unique().max(20),
  indexersEnabled: Joi.boolean(),
  isTestnet: Joi.boolean(),
  isDefault: Joi.boolean(),
  displayOrder: Joi.number().integer().min(0).max(100000),
  isActive: Joi.boolean(),
};

const chainCreate = Joi.object(chainFields).fork([
  'chainCode', 'chainName', 'chainId', 'networkName', 'nativeCurrencyName', 'nativeCurrencySymbol',
  'rpcUrl', 'publicRpcUrl', 'contractSuiteDeployedAt', 'trexImplementationAuthorityAddress', 'trexGatewayAddress',
  'identityImplementationAuthorityAddress', 'identityFactoryAddress', 'platformControllerAddress',
  'trexFactoryAddress', 'countryRestrictModuleAddress', 'maxBalanceModuleAddress',
  'maxInvestorsModuleAddress', 'platformControllerOwnerAddress', 'tokenImplementationAddress',
  'idFactoryAccessManagerAddress',
  'claimTopicsRegistryImplementationAddress', 'identityRegistryImplementationAddress',
  'identityRegistryStorageImplementationAddress', 'trustedIssuersRegistryImplementationAddress',
  'modularComplianceImplementationAddress', 'identityImplementationAddress', 'paymentTokenAddresses',
  'deployerPrivateKey',
], (schema) => schema.required());
const chainUpdate = Joi.object({
  publicRpcUrl: chainFields.publicRpcUrl,
  explorerUrl: chainFields.explorerUrl,
  fallbackRpcUrls: chainFields.fallbackRpcUrls,
  isActive: chainFields.isActive,
  // Image bytes use PUT /admin/chains/:chainUid/image, never a JSON path or URL.
  ...Object.fromEntries(
    Object.keys(chainFields)
      .filter((field) => !['publicRpcUrl', 'explorerUrl', 'fallbackRpcUrls', 'isActive'].includes(field))
      .map((field) => [field, Joi.any().forbidden()]),
  ),
}).min(1);
const chainList = listQuery.keys({ isActive: booleanQuery });
const chainAuditList = listQuery;
const chainParams = Joi.object({ chainUid: uid.required() });

const paymentTokenFields = {
  chainUid: uid,
  paymentTokenCode: Joi.string().trim().uppercase().pattern(/^[A-Z0-9_]{2,50}$/),
  paymentTokenName: Joi.string().trim().min(1).max(80),
  paymentTokenSymbol: Joi.string().trim().uppercase().pattern(/^[A-Z0-9]{2,20}$/),
  contractAddress: evmAddress,
  decimals: Joi.number().integer().min(0).max(36),
  explorerUrl: Joi.string().trim().uri({ scheme: ['http', 'https'] }).max(500).allow(null, ''),
  supportsPurchase: Joi.boolean(),
  supportsRedemption: Joi.boolean(),
  isDefault: Joi.boolean(),
  displayOrder: Joi.number().integer().min(0).max(100000),
  isActive: Joi.boolean(),
};
const paymentTokenCreate = Joi.object(paymentTokenFields).fork([
  'chainUid', 'paymentTokenCode', 'paymentTokenName', 'paymentTokenSymbol', 'contractAddress', 'decimals',
], (schema) => schema.required());
const paymentTokenUpdate = Joi.object({
  ...paymentTokenFields,
  supportsPurchase: Joi.any().forbidden(),
  supportsRedemption: Joi.any().forbidden(),
}).min(1);
const paymentTokenList = listQuery.keys({ chainUid: uid, isActive: booleanQuery });
const paymentTokenParams = Joi.object({ paymentTokenUid: uid.required() });
const publicPaymentTokenQuery = Joi.object({
  chainUid: uid,
  chainId: Joi.number().integer().positive(),
  action: Joi.string().uppercase().valid('PURCHASE', 'REDEMPTION'),
}).oxor('chainUid', 'chainId');

module.exports = {
  chainCreate, chainUpdate, chainList, chainAuditList, chainParams,
  paymentTokenCreate, paymentTokenUpdate, paymentTokenList, paymentTokenParams,
  publicPaymentTokenQuery,
};
