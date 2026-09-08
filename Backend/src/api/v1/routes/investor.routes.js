const express = require('express');
const { validate } = require('../../../middleware/validate.middleware');
const { asyncHandler } = require('../../../utils/async-handler');
const { investorUpload } = require('../../../middleware/investor-upload.middleware');
const schemas = require('../../../schemas/investor.schema');

const createInvestorReferenceRouter = (controller) => {
  const router = express.Router();
  router.get('/investor-options', asyncHandler(controller.options));
  return router;
};

const createInvestorRouter = ({ controller, authenticate, authorize }) => {
  const router = express.Router();
  router.use(authenticate);
  router.get('/me', authorize, asyncHandler(controller.getMine));
  router.put('/me/identity', validate({ body: schemas.identityDetails }), authorize, asyncHandler(controller.saveIdentity));
  router.put('/me/compliance', validate({ body: schemas.compliance }), authorize, asyncHandler(controller.saveCompliance));
  router.post('/me/documents', authorize, investorUpload, validate({ body: schemas.documentUpload }), asyncHandler(controller.uploadDocuments));
  router.get('/me/documents', authorize, asyncHandler(controller.listDocuments));
  router.get('/me/documents/:documentUid/download', validate({ params: schemas.documentParams }), authorize, asyncHandler(controller.downloadDocument));
  router.delete('/me/documents/:documentUid', validate({ params: schemas.documentParams }), authorize, asyncHandler(controller.deleteDocument));
  router.post('/me/submit', validate({ body: schemas.submitInvestor }), authorize, asyncHandler(controller.submit));
  return router;
};

module.exports = { createInvestorReferenceRouter, createInvestorRouter };
