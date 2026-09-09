const express = require('express');
const { validate } = require('../../../middleware/validate.middleware');
const { asyncHandler } = require('../../../utils/async-handler');
const schemas = require('../../../schemas/investor-claim.schema');

// Investor on-chain claim submission + verification. Authenticated + DB-authorized, investor-only.
// See 20260909_investor_claim_submission.sql.
const createInvestorClaimRouter = ({ controller, authenticate, authorize }) => {
  const router = express.Router();
  router.use(authenticate);
  router.get('/', validate({ query: schemas.claimsQuery }), authorize, asyncHandler(controller.list));
  router.post(
    '/:claimId/prepare',
    validate({ params: schemas.claimParams, body: schemas.prepareClaim }),
    authorize,
    asyncHandler(controller.prepare),
  );
  router.post(
    '/:claimId/retry',
    validate({ params: schemas.claimParams, body: schemas.prepareClaim }),
    authorize,
    asyncHandler(controller.retry),
  );
  router.post(
    '/:claimId/submit',
    validate({ params: schemas.claimParams, body: schemas.submitClaim }),
    authorize,
    asyncHandler(controller.submit),
  );
  return router;
};

module.exports = { createInvestorClaimRouter };
