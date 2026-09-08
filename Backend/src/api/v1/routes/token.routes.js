const express = require('express');
const { validate } = require('../../../middleware/validate.middleware');
const { asyncHandler } = require('../../../utils/async-handler');
const { tokenImageUpload } = require('../../../middleware/token-image-upload.middleware');
const schemas = require('../../../schemas/token.schema');

const createTokenRouter = ({ controller, authenticate, authorize }) => {
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
  router.post('/me/submit', validate({ body: schemas.tokenSubmit }), authorize, asyncHandler(controller.submit));
  return router;
};

module.exports = { createTokenRouter };
