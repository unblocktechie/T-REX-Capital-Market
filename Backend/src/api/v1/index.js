const express = require('express');
const dependencies = require('../../dependencies');
const { createAuthRouter } = require('./routes/auth.routes');
const { createMasterRouter } = require('./routes/master.routes');
const { health } = require('./controllers/health.controller');
const { createReferenceRouter, createOrganizationRouter } = require('./routes/organization.routes');

const createV1Router = () => {
  const router = express.Router();
  router.get('/health', health);
  router.use('/auth', createAuthRouter(dependencies.controllers.auth));
  router.use(createReferenceRouter({
    locationController: dependencies.controllers.locations,
    organizationController: dependencies.controllers.organizations,
  }));
  router.use('/organizations', createOrganizationRouter({
    controller: dependencies.controllers.organizations,
    authenticate: dependencies.authenticate,
    authorize: dependencies.authorize,
  }));
  router.use(createMasterRouter(dependencies));
  return router;
};

module.exports = { createV1Router };
