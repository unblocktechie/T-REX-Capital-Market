const express = require('express');
const { validate } = require('../../../middleware/validate.middleware');
const { asyncHandler } = require('../../../utils/async-handler');
const schemas = require('../../../schemas/investment.schema');

// All investment routes are authenticated + DB-authorized (permissionMaster). The
// marketplace list/detail/image are granted to admin + investor; the journey endpoints to
// investor; the review endpoints to issuer. See 20260909_add_investment_journey.sql.
const createInvestmentRouter = ({ controller, registryController, purchaseController, authenticate, authorize }) => {
  const router = express.Router();
  router.use(authenticate);

  // Marketplace (admin + investor).
  router.get('/tokens', validate({ query: schemas.listTokensQuery }), authorize, asyncHandler(controller.listTokens));
  router.get('/tokens/:tokenUid', validate({ params: schemas.tokenParams }), authorize, asyncHandler(controller.getToken));
  router.get('/tokens/:tokenUid/image', validate({ params: schemas.tokenParams }), authorize, asyncHandler(controller.tokenImage));

  // Backend-authoritative USDT purchase intent -> payment verification -> platform-agent mint.
  router.post(
    '/tokens/:tokenUid/purchases',
    validate({ params: schemas.tokenParams, body: schemas.createPurchase }),
    authorize,
    asyncHandler(purchaseController.create),
  );
  router.get(
    '/tokens/:tokenUid/purchases',
    validate({ params: schemas.tokenParams, query: schemas.purchaseHistoryQuery }),
    authorize,
    asyncHandler(purchaseController.history),
  );
  router.get(
    '/purchases/:purchaseUid',
    validate({ params: schemas.purchaseParams }),
    authorize,
    asyncHandler(purchaseController.get),
  );
  router.post(
    '/purchases/:purchaseUid/confirm',
    validate({ params: schemas.purchaseParams, body: schemas.confirmPurchase }),
    authorize,
    asyncHandler(purchaseController.confirm),
  );
  router.post(
    '/purchases/:purchaseUid/retry',
    validate({ params: schemas.purchaseParams, body: schemas.emptyBody }),
    authorize,
    asyncHandler(purchaseController.retry),
  );

  // Investor journey.
  router.get(
    '/tokens/:tokenUid/required-documents',
    validate({ params: schemas.tokenParams }),
    authorize,
    asyncHandler(controller.requiredDocuments),
  );

  // Backend-authoritative Identity Registry registration. The first call records PENDING intent;
  // confirm accepts only txHash and independently proves the exact on-chain operation.
  router.post(
    '/issuer/interests/:interestUid/registry-registration',
    validate({ params: schemas.interestParams, body: schemas.emptyBody }),
    authorize,
    asyncHandler(registryController.create),
  );
  router.get(
    '/issuer/interests/:interestUid/registry-registration',
    validate({ params: schemas.interestParams }),
    authorize,
    asyncHandler(registryController.get),
  );
  router.post(
    '/issuer/interests/:interestUid/registry-registration/:registryRegistrationUid/confirm',
    validate({ params: schemas.registryRegistrationParams, body: schemas.confirmRegistryRegistration }),
    authorize,
    asyncHandler(registryController.confirm),
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
