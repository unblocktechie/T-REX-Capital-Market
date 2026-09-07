const jwt = require('jsonwebtoken');
const { env } = require('../core/config/env');
const { ApiError } = require('../core/errors/api-error');
const { asyncHandler } = require('../utils/async-handler');

const createAuthenticate = (userRepository) => asyncHandler(async (req, res, next) => {
  const authorization = req.get('authorization');
  if (!authorization?.startsWith('Bearer ')) throw ApiError.unauthorized('A Bearer authentication token is required.');
  const token = authorization.slice(7).trim();
  if (!token) throw ApiError.unauthorized('A Bearer authentication token is required.');

  const claims = jwt.verify(token, env.jwt.secret, {
    issuer: env.appName,
    audience: 'trex-capital-market-api',
  });
  const identity = await userRepository.findAuthIdentityByUid(claims.userUid);
  if (!identity || !identity.isActive || !identity.roleActive) throw ApiError.unauthorized('The account associated with this token is no longer active.');
  if (!identity.emailVerified) throw ApiError.forbidden('Please verify your email before accessing protected resources.');
  if (identity.roleUid !== claims.roleUid) throw ApiError.unauthorized('Your role has changed. Please log in again.');
  req.user = identity;
  req.auth = claims;
  return next();
});

module.exports = { createAuthenticate };
