const express = require('express');
const { validate } = require('../../../middleware/validate.middleware');
const { asyncHandler } = require('../../../utils/async-handler');
const schemas = require('../../../schemas/organization.schema');

const createOrganizationAdminRouter = ({ controller, authenticate, authorize }) => {
  const router = express.Router();
  router.use(authenticate);
  router.get('/', validate({ query: schemas.adminOrganizationListQuery }), authorize, asyncHandler(controller.list));
  router.get(
    '/:organizationUid/documents/:documentUid/file',
    validate({ params: schemas.adminDocumentParams, query: schemas.adminDocumentFileQuery }),
    authorize,
    asyncHandler(controller.documentFile),
  );
  router.get('/:organizationUid', validate({ params: schemas.organizationParams }), authorize, asyncHandler(controller.getByUid));
  router.patch(
    '/:organizationUid/status',
    validate({ params: schemas.organizationParams, body: schemas.reviewOrganization }),
    authorize,
    asyncHandler(controller.review),
  );
  return router;
};

module.exports = { createOrganizationAdminRouter };
