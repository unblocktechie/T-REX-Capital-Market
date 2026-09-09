const express = require('express');
const { validate } = require('../../../middleware/validate.middleware');
const { asyncHandler } = require('../../../utils/async-handler');
const schemas = require('../../../schemas/investment.schema');

// All investment routes are authenticated + DB-authorized (permissionMaster). The
// marketplace list/detail/image are granted to admin + investor; the journey endpoints to
// investor; the review endpoints to issuer. See 20260808_add_investment_journey.sql.
const createInvestmentRouter = ({ controller, authenticate, authorize }) => {
  const router = express.Router();
  router.use(authenticate);

  // Marketplace (admin + investor).
  router.get('/tokens', validate({ query: schemas.listTokensQuery }), authorize, asyncHandler(controller.listTokens));
  router.get('/tokens/:tokenUid', validate({ params: schemas.tokenParams }), authorize, asyncHandler(controller.getToken));
  router.get('/tokens/:tokenUid/image', validate({ params: schemas.tokenParams }), authorize, asyncHandler(controller.tokenImage));

  // Investor journey.
  router.get(
    '/tokens/:tokenUid/required-documents',
    validate({ params: schemas.tokenParams }),
    authorize,
    asyncHandler(controller.requiredDocuments),
  );
  router.post(
    '/tokens/:tokenUid/interest',
    validate({ params: schemas.tokenParams, body: schemas.submitInterest }),
    authorize,
    asyncHandler(controller.submitInterest),
  );
  router.get('/me/interests', validate({ query: schemas.myInterestsQuery }), authorize, asyncHandler(controller.myInterests));
  router.get(
    '/me/interests/:interestUid/history',
    validate({ params: schemas.interestParams }),
    authorize,
    asyncHandler(controller.myInterestHistory),
  );

  // Issuer review.
  router.get('/issuer/interests', validate({ query: schemas.issuerInterestsQuery }), authorize, asyncHandler(controller.issuerInterests));
  router.get(
    '/issuer/interests/:interestUid',
    validate({ params: schemas.interestParams }),
    authorize,
    asyncHandler(controller.issuerInterest),
  );
  router.post(
    '/issuer/interests/:interestUid/approve',
    validate({ params: schemas.interestParams, body: schemas.approveInterest }),
    authorize,
    asyncHandler(controller.approveInterest),
  );
  router.post(
    '/issuer/interests/:interestUid/reject',
    validate({ params: schemas.interestParams, body: schemas.rejectInterest }),
    authorize,
    asyncHandler(controller.rejectInterest),
  );
  router.get(
    '/issuer/interests/:interestUid/history',
    validate({ params: schemas.interestParams }),
    authorize,
    asyncHandler(controller.issuerInterestHistory),
  );
  router.get(
    '/issuer/interests/:interestUid/documents/:documentUid/download',
    validate({ params: schemas.interestDocumentParams }),
    authorize,
    asyncHandler(controller.issuerInterestDocument),
  );

  return router;
};

module.exports = { createInvestmentRouter };
