const express = require('express');
const { asyncHandler } = require('../../../utils/async-handler');
const { validate } = require('../../../middleware/validate.middleware');
const schemas = require('../../../schemas/chain.schema');
const { masterImageUpload, parseMasterMultipartFields } = require('../../../middleware/master-image-upload.middleware');

const createChainRouter = ({ controller, authenticate, authorize }) => {
  const router = express.Router();
  router.get('/', asyncHandler(controller.listPublic));
  router.get('/me', authenticate, authorize, asyncHandler(controller.listMine));
  router.get('/:chainUid/config', validate({ params: schemas.chainParams }), asyncHandler(controller.configuration));
  router.get('/:chainUid/image', validate({ params: schemas.chainParams }), asyncHandler(controller.image));
  router.post('/:chainUid/unlock', authenticate, validate({ params: schemas.chainParams }), authorize, asyncHandler(controller.unlock));
  return router;
};

const createChainAdminRouter = ({ chainController, paymentTokenController, authenticate, authorize }) => {
  const router = express.Router();
  router.use(authenticate);
  router.get('/chains', validate({ query: schemas.chainList }), authorize, asyncHandler(chainController.adminList));
  router.post('/chains', authorize, masterImageUpload, parseMasterMultipartFields, validate({ body: schemas.chainCreate }), asyncHandler(chainController.adminCreate));
  router.get('/chains/:chainUid', validate({ params: schemas.chainParams }), authorize, asyncHandler(chainController.adminGet));
  router.patch('/chains/:chainUid', validate({ params: schemas.chainParams, body: schemas.chainUpdate }), authorize, asyncHandler(chainController.adminUpdate));
  router.put('/chains/:chainUid/image', validate({ params: schemas.chainParams }), authorize, masterImageUpload, asyncHandler(chainController.adminUpdateImage));
  router.get('/chains/:chainUid/audits', validate({ params: schemas.chainParams, query: schemas.chainAuditList }), authorize, asyncHandler(chainController.adminAudits));
  router.get('/payment-tokens', validate({ query: schemas.paymentTokenList }), authorize, asyncHandler(paymentTokenController.list));
  router.post('/payment-tokens', authorize, masterImageUpload, validate({ body: schemas.paymentTokenCreate }), asyncHandler(paymentTokenController.create));
  router.get('/payment-tokens/:paymentTokenUid', validate({ params: schemas.paymentTokenParams }), authorize, asyncHandler(paymentTokenController.get));
  router.patch('/payment-tokens/:paymentTokenUid', validate({ params: schemas.paymentTokenParams, body: schemas.paymentTokenUpdate }), authorize, asyncHandler(paymentTokenController.update));
  router.put('/payment-tokens/:paymentTokenUid/image', validate({ params: schemas.paymentTokenParams }), authorize, masterImageUpload, asyncHandler(paymentTokenController.updateImage));
  router.delete('/payment-tokens/:paymentTokenUid', validate({ params: schemas.paymentTokenParams }), authorize, asyncHandler(paymentTokenController.remove));
  return router;
};

module.exports = { createChainRouter, createChainAdminRouter };
