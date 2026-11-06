const { ApiError } = require('../core/errors/api-error');
const { asyncHandler } = require('../utils/async-handler');
const { API_KEY_PREFIX } = require('../services/issuer-api-key.service');

const requestMetadata = (req) => ({
  httpMethod: req.method,
  apiPath: req.originalUrl?.split('?')[0] || req.path,
  ipAddress: req.ip,
  userAgent: req.get('user-agent'),
  requestId: req.id,
});

// The three relayed price endpoints accept either the normal interactive issuer JWT or a
// narrowly-scoped issuer API key. API keys are intentionally not accepted by any other route.
const createIssuerPriceAuthenticate = ({ jwtAuthenticate, apiKeyService }) => (requiredScope) => asyncHandler(async (req, res, next) => {
  const authorization = req.get('authorization');
  if (!authorization?.startsWith('Bearer ')) {
    throw ApiError.unauthorized('A Bearer issuer JWT or issuer API key is required.');
  }
  const credential = authorization.slice(7).trim();
  if (!credential.startsWith(API_KEY_PREFIX)) return jwtAuthenticate(req, res, next);

  const authenticated = await apiKeyService.authenticate(credential, requiredScope, requestMetadata(req));
  req.user = authenticated.user;
  req.auth = {
    type: 'issuerApiKey',
    issuerApiKeyUid: authenticated.apiKey.issuerApiKeyUid,
    scopes: authenticated.apiKey.scopes,
  };
  return next();
});

module.exports = { createIssuerPriceAuthenticate, requestMetadata };
