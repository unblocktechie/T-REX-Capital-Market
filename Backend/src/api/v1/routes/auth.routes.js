const express = require('express');
const { validate } = require('../../../middleware/validate.middleware');
const { asyncHandler } = require('../../../utils/async-handler');
const { authRateLimiter } = require('../../../middleware/rate-limit.middleware');
const schemas = require('../../../schemas/auth.schema');

const createAuthRouter = (controller) => {
  const router = express.Router();
  router.use(authRateLimiter);
  router.post('/signup', validate({ body: schemas.signup }), asyncHandler(controller.signup));
  router.post('/resend-verification', validate({ body: schemas.emailOnly }), asyncHandler(controller.resendVerification));
  router.post('/verify-email', validate({ body: schemas.tokenBody }), asyncHandler(controller.verifyEmail));
  router.post('/login', validate({ body: schemas.login }), asyncHandler(controller.login));
  router.post('/forgot-password', validate({ body: schemas.emailOnly }), asyncHandler(controller.forgotPassword));
  router.get('/verify-reset-token', validate({ query: schemas.tokenQuery }), asyncHandler(controller.verifyResetToken));
  router.post('/reset-password', validate({ body: schemas.resetPassword }), asyncHandler(controller.resetPassword));
  return router;
};

module.exports = { createAuthRouter };
