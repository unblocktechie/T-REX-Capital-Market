const { Joi, uid } = require('./common.schema');
const settings = {
  IssuerApiKeyAllowPrivateIps: false,
  IssuerApiKeyMaxActive: 5,
  IssuerApiKeyCooldownMinSeconds: 30,
  IssuerApiKeyCooldownMaxSeconds: 2592000,
  IssuerApiKeyAllowedIpsMin: 1,
  IssuerApiKeyAllowedIpsMax: 3,
  TokenPriceRelaySignatureTtlSeconds: 600,
  TokenPriceRelayRateLimitCount: 10,
  TokenPriceRelayRateLimitWindowSeconds: 60,
  TokenPriceApiReadRateLimitCount: 60,
  TokenPriceApiReadRateLimitWindowSeconds: 60,
};
const emailArray = Joi.array().items(Joi.string().trim().lowercase().email({ tlds: { allow: false } })).unique().max(20);
const apiKeySettings = Joi.object(Object.fromEntries(Object.keys(settings).map((key) => [key,
  key === 'IssuerApiKeyAllowPrivateIps' ? Joi.boolean() : Joi.number().integer().min(key === 'TokenPriceRelaySignatureTtlSeconds' ? 60 : 1).max(key.includes('Cooldown') ? 2592000 : 1000000)]))).min(1);
const notificationSettings = Joi.object({ teamNotificationEmails: emailArray.required() });
const query = Joi.object({
  page: Joi.number().integer().min(1).default(1), limit: Joi.number().integer().min(1).max(100).default(20),
  search: Joi.string().trim().max(100).allow('').default(''), chainUid: uid, organizationUid: uid, tokenUid: uid,
  status: Joi.string().max(40), pendingOnly: Joi.boolean().default(false),
});
const params = Joi.object({ userUid: uid.required() });
const sortable = (schema, fields) => schema.keys({ sortBy: Joi.string().valid(...fields),
  sortOrder: Joi.string().lowercase().valid('asc','desc').default('desc') });
const investorQuery = sortable(query, ['fullName','email','walletAddress','profileStatus','createdAt','submittedAt','isActive']);
const investorChainQuery = sortable(query, ['chainId','chainName','status','walletAddress','identityAddress','isUnlocked','unlockedAt']);
const historyQuery = sortable(Joi.object({}), ['createdAt','eventType','actorRole','submissionNumber']);
const applicationQuery = query.keys({
  sortBy: Joi.string().valid('createdAt', 'submittedAt', 'decisionAt', 'investorName', 'investorEmail',
    'walletAddress', 'tokenAddress', 'tokenName', 'tokenSymbol', 'issuerName', 'chainName', 'chainId', 'status').default('createdAt'),
  sortOrder: Joi.string().lowercase().valid('asc', 'desc').default('desc'),
});
const tokenParams = Joi.object({ tokenUid: uid.required() });
const tokenListQuery = query.keys({
  sortBy: Joi.string().valid('createdAt', 'deployedAt', 'tokenName', 'tokenSymbol', 'tokenAddress',
    'status', 'chainName', 'chainId', 'legalCompanyName', 'decimals', 'initialTokenPrice', 'currentTokenPrice', 'currentHolders').default('createdAt'),
  sortOrder: Joi.string().lowercase().valid('asc', 'desc').default('desc'),
});
const interestParams = Joi.object({ interestUid: uid.required() });
const detailQuery = Joi.object({ page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20), search: Joi.string().trim().max(100).allow('').default(''),
  holderStatus: Joi.string().valid('all', 'current', 'former').default('all') });
const documentParams = Joi.object({ interestUid: uid.required(), documentUid: uid.required() });
const investorDetailQuery = sortable(detailQuery, ['fullName','email','walletAddress','createdAt','submittedAt','currentTokenBalance','holderStatus']);
module.exports = { settings, apiKeySettings, notificationSettings, emailArray, query, applicationQuery, tokenListQuery, investorQuery, investorChainQuery, historyQuery, params, tokenParams, interestParams, detailQuery: investorDetailQuery, documentParams };
