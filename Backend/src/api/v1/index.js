const express = require('express');
const { asyncHandler } = require('../../utils/async-handler');
const dependencies = require('../../dependencies');
const { createAuthRouter } = require('./routes/auth.routes');
const { createMasterRouter } = require('./routes/master.routes');
const { health } = require('./controllers/health.controller');
const { createReferenceRouter, createOrganizationRouter } = require('./routes/organization.routes');
const { createOrganizationAdminRouter } = require('./routes/organization-admin.routes');
const { createTokenRouter } = require('./routes/token.routes');
const { createInvestorReferenceRouter, createInvestorRouter } = require('./routes/investor.routes');
const { createInvestmentRouter } = require('./routes/investment.routes');
const { createIssuerClaimRouter } = require('./routes/issuer-claim.routes');
const { createInvestorClaimRouter } = require('./routes/investor-claim.routes');

const createV1Router = () => {
  const router = express.Router();
  router.get('/health', health);
  router.use('/auth', createAuthRouter(dependencies.controllers.auth));
  router.get('/token-options', asyncHandler(dependencies.controllers.tokens.options));
  router.use(createReferenceRouter({
    locationController: dependencies.controllers.locations,
    organizationController: dependencies.controllers.organizations,
  }));
  router.use('/organizations', createOrganizationRouter({
    controller: dependencies.controllers.organizations,
    authenticate: dependencies.authenticate,
    authorize: dependencies.authorize,
  }));
  router.use('/admin/organizations', createOrganizationAdminRouter({
    controller: dependencies.controllers.organizationAdmin,
    authenticate: dependencies.authenticate,
    authorize: dependencies.authorize,
  }));
  router.use('/tokens', createTokenRouter({
    controller: dependencies.controllers.tokens,
    deploymentController: dependencies.controllers.deploymentAttempts,
    authenticate: dependencies.authenticate,
    authorize: dependencies.authorize,
  }));
  router.use(createInvestorReferenceRouter(dependencies.controllers.investors));
  router.use('/investors', createInvestorRouter({
    controller: dependencies.controllers.investors,
    authenticate: dependencies.authenticate,
    authorize: dependencies.authorize,
  }));
  router.use('/investments', createInvestmentRouter({
    controller: dependencies.controllers.investments,
    registryController: dependencies.controllers.registryRegistrations,
    purchaseController: dependencies.controllers.tokenPurchases,
    authenticate: dependencies.authenticate,
    authorize: dependencies.authorize,
  }));
  router.use('/issuer/claims', createIssuerClaimRouter({
    controller: dependencies.controllers.issuerClaims,
    authenticate: dependencies.authenticate,
    authorize: dependencies.authorize,
  }));
  router.use('/investor/claims', createInvestorClaimRouter({
    controller: dependencies.controllers.investorClaims,
    authenticate: dependencies.authenticate,
    authorize: dependencies.authorize,
  }));
  router.use(createMasterRouter(dependencies));
  return router;
};

module.exports = { createV1Router };
