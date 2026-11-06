const { rateLimit } = require('express-rate-limit');
const { env } = require('../core/config/env');
const { sendError } = require('../utils/response');

const createLimiter = (max) => rateLimit({
  windowMs: env.rateLimit.windowMs,
  limit: max,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (req, res) => sendError(req, res, {
    statusCode: 429,
    message: 'Too many requests. Please try again later.',
    code: 'RATE_LIMIT_EXCEEDED',
  }),
});

const apiRateLimiter = createLimiter(env.rateLimit.max);
const authRateLimiter = createLimiter(env.rateLimit.authMax);

const createIssuerPriceRateLimiter = (service) => require('../utils/async-handler').asyncHandler(async (req, res, next) => {
  const result = await service.consume(req.user.userUid);
  if (result.allowed) return next();
  res.set('Retry-After', String(result.retryAfter));
  return sendError(req, res, {
    statusCode: 429,
    message: 'Too many issuer price API requests. Please try again later.',
    code: 'PRICE_API_RATE_LIMITED',
  });
});

module.exports = { apiRateLimiter, authRateLimiter, createIssuerPriceRateLimiter };
