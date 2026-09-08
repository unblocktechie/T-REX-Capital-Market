const express = require('express');
const { validate } = require('../../../middleware/validate.middleware');
const { asyncHandler } = require('../../../utils/async-handler');
const { tokenImageUpload } = require('../../../middleware/token-image-upload.middleware');
const schemas = require('../../../schemas/token.schema');
const deploymentSchemas = require('../../../schemas/deployment-attempt.schema');

const createTokenRouter = ({ controller, deploymentController, authenticate, authorize }) => {
  const router = express.Router();
  router.use(authenticate);
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
