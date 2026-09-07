const express = require('express');
const { validate } = require('../../../middleware/validate.middleware');
const { asyncHandler } = require('../../../utils/async-handler');
const { organizationUpload } = require('../../../middleware/organization-upload.middleware');
const schemas = require('../../../schemas/organization.schema');

const createReferenceRouter = ({ locationController, organizationController }) => {
  const router = express.Router();
  router.get('/locations/countries', validate({ query: schemas.locationListQuery }), asyncHandler(locationController.countries));
  router.get('/locations/countries/:countryUid/states', validate({ params: schemas.countryParams, query: schemas.locationListQuery }), asyncHandler(locationController.states));
  router.get('/locations/states/:stateUid/cities', validate({ params: schemas.stateParams, query: schemas.locationListQuery }), asyncHandler(locationController.cities));
  router.get('/organization-options', asyncHandler(organizationController.options));
  return router;
};

const createOrganizationRouter = ({ controller, authenticate, authorize }) => {
  const router = express.Router();
  router.use(authenticate);
  router.get('/me', authorize, asyncHandler(controller.getMine));
  router.patch('/me/user-notified', authorize, asyncHandler(controller.markUserNotified));
  router.put('/me/company-information', validate({ body: schemas.companyInformation }), authorize, asyncHandler(controller.saveCompanyInformation));
  router.put('/me/jurisdiction', validate({ body: schemas.jurisdiction }), authorize, asyncHandler(controller.saveJurisdiction));
  router.put('/me/beneficial-owners', validate({ body: schemas.beneficialOwners }), authorize, asyncHandler(controller.saveBeneficialOwners));
  router.post('/me/documents', authorize, organizationUpload, validate({ body: schemas.documentUpload }), asyncHandler(controller.uploadDocuments));
  router.get('/me/documents', authorize, asyncHandler(controller.listDocuments));
  router.get('/me/documents/:documentUid/download', validate({ params: schemas.documentParams }), authorize, asyncHandler(controller.downloadDocument));
  router.delete('/me/documents/:documentUid', validate({ params: schemas.documentParams }), authorize, asyncHandler(controller.deleteDocument));
  router.post('/me/submit', validate({ body: schemas.submitOrganization }), authorize, asyncHandler(controller.submit));
  return router;
};

module.exports = { createReferenceRouter, createOrganizationRouter };
