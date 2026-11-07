const express = require('express');
const { validate } = require('../../../middleware/validate.middleware');
const { asyncHandler } = require('../../../utils/async-handler');
const { tokenImageUpload } = require('../../../middleware/token-image-upload.middleware');
const schemas = require('../../../schemas/token.schema');
const deploymentSchemas = require('../../../schemas/deployment-attempt.schema');

const createTokenRouter = ({
  controller, deploymentController, authenticate, issuerPriceAuthenticate, issuerPriceRateLimit, authorize, requireInvestorChain,
}) => {
  const router = express.Router();
  // These three routes alone allow either an interactive issuer JWT or a scoped issuer API key.
  // All remaining token APIs continue to require the normal JWT below.
  router.post(
    '/me/price-updates/prepare',
    issuerPriceAuthenticate('TOKEN_PRICE_PREPARE'),
    issuerPriceRateLimit,
    requireInvestorChain,
    validate({ body: schemas.tokenPriceRelayPrepare }),
    authorize,
    asyncHandler(controller.preparePriceUpdate),
  );
  router.post(
    '/me/price-updates',
    issuerPriceAuthenticate('TOKEN_PRICE_SUBMIT'),
    issuerPriceRateLimit,
    requireInvestorChain,
    validate({ body: schemas.tokenPriceRelaySubmit }),
    authorize,
    asyncHandler(controller.submitPriceUpdate),
  );
  router.get(
    '/me/price-updates/:priceUpdateUid',
    issuerPriceAuthenticate('TOKEN_PRICE_READ'),
    issuerPriceRateLimit,
    requireInvestorChain,
    validate({ params: schemas.tokenPriceUpdateParams }),
    authorize,
    asyncHandler(controller.getPriceUpdate),
  );

  router.use(authenticate);
  router.use(requireInvestorChain);
  router.get('/me/price-history', validate({ query: schemas.tokenPriceHistoryQuery }), authorize, asyncHandler(controller.priceHistory));
  router.get('/me', authorize, asyncHandler(controller.getMine));
  router.put(
    '/me/information',
    authorize,
    tokenImageUpload,
    validate({ body: schemas.tokenInformation }),
    asyncHandler(controller.saveInformation),
  );
  router.get('/me/image', authorize, asyncHandler(controller.image));
  router.put('/me/claims', validate({ body: schemas.tokenClaims }), authorize, asyncHandler(controller.saveClaims));
  router.put('/me/compliance', validate({ body: schemas.tokenCompliance }), authorize, asyncHandler(controller.saveCompliance));
  router.put('/me/governance', validate({ body: schemas.tokenGovernance }), authorize, asyncHandler(controller.saveGovernance));
  router.patch(
    '/me/price',
    validate({ body: schemas.tokenPriceUpdate }),
    authorize,
    asyncHandler(controller.updatePrice),
  );
  router.post('/me/price/prepare', validate({ body: schemas.tokenDirectPricePrepare }), authorize,
    asyncHandler(controller.prepareDirectPrice));
  // Disabled: price recovery is handled by the background indexer, not a Retry API.
  // router.post('/me/price/:priceUpdateUid/retry', validate({ params: schemas.tokenPriceUpdateParams, body: schemas.tokenPriceRecovery }), authorize,
  //   asyncHandler(controller.retryDirectPrice));
  router.post('/me/price/:priceUpdateUid/cancel', validate({ params: schemas.tokenPriceUpdateParams, body: schemas.tokenPriceRecovery }), authorize,
    asyncHandler(controller.cancelDirectPrice));

  // Two-phase deployment attempt lifecycle (must precede final submit conceptually).
  router.post(
    '/me/deployment-attempts',
    validate({ body: deploymentSchemas.createAttempt }),
    authorize,
    asyncHandler(deploymentController.create),
  );
  router.get('/me/deployment-attempts/active', authorize, asyncHandler(deploymentController.active));
  router.patch(
    '/me/deployment-attempts/:deploymentAttemptUid/submitted',
    validate({ params: deploymentSchemas.deploymentAttemptParams, body: deploymentSchemas.submittedTransaction }),
    authorize,
    asyncHandler(deploymentController.submitted),
  );
  router.patch(
    '/me/deployment-attempts/:deploymentAttemptUid/fail',
    validate({ params: deploymentSchemas.deploymentAttemptParams, body: deploymentSchemas.failAttempt }),
    authorize,
    asyncHandler(deploymentController.fail),
  );

  router.post('/me/submit', validate({ body: schemas.tokenSubmit }), authorize, asyncHandler(controller.submit));
  return router;
};

module.exports = { createTokenRouter };
