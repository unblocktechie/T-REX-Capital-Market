const express = require('express');
const { validate } = require('../../../middleware/validate.middleware');
const { asyncHandler } = require('../../../utils/async-handler');

const createCrudRouter = ({ controller, schemas, authenticate, authorize }) => {
  const router = express.Router();
  const uidPath = `/:${schemas.uidParam}`;
  router.use(authenticate);
  router.post('/', validate({ body: schemas.create }), authorize, asyncHandler(controller.create));
  router.get('/', validate({ query: schemas.list }), authorize, asyncHandler(controller.list));
  router.get(uidPath, validate({ params: schemas.params }), authorize, asyncHandler(controller.getByUid));
  router.put(uidPath, validate({ params: schemas.params, body: schemas.update }), authorize, asyncHandler(controller.update));
  router.delete(uidPath, validate({ params: schemas.params }), authorize, asyncHandler(controller.delete));
  return router;
};

module.exports = { createCrudRouter };
