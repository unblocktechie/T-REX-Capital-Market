const express = require('express');
const { validate } = require('../../../middleware/validate.middleware');
const { asyncHandler } = require('../../../utils/async-handler');
const schemas = require('../../../schemas/issuer-claim.schema');

// Issuer claim-signature verification. Authenticated + DB-authorized (permissionMaster),
// issuer-only. See 20260814_issuer_claim_verification.sql.
const createIssuerClaimRouter = ({ controller, authenticate, authorize }) => {
  const router = express.Router();
  router.use(authenticate);
  router.post('/sign', validate({ body: schemas.signClaims }), authorize, asyncHandler(controller.sign));
  router.get('/:subscriptionId', validate({ params: schemas.subscriptionParams }), authorize, asyncHandler(controller.status));
  return router;
};

module.exports = { createIssuerClaimRouter };
