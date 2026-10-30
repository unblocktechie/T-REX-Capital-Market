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
const { createChainRouter, createChainAdminRouter } = require('./routes/chain.routes');
const { validate } = require('../../middleware/validate.middleware');
const chainSchemas = require('../../schemas/chain.schema');

const createV1Router = () => {
  const router = express.Router();
  router.get('/health', health);
  router.use('/auth', createAuthRouter(dependencies.controllers.auth));
  router.get('/token-options', validate({ query: chainSchemas.publicPaymentTokenQuery }), asyncHandler(dependencies.controllers.tokens.options));
  router.get('/payment-tokens', validate({ query: chainSchemas.publicPaymentTokenQuery }), asyncHandler(dependencies.controllers.tokens.paymentTokens));
  router.get('/payment-tokens/:paymentTokenUid/image', validate({ params: chainSchemas.paymentTokenParams }), asyncHandler(dependencies.controllers.paymentTokenAdmin.image));
  router.use('/chains', createChainRouter({
    controller: dependencies.controllers.chains,
    authenticate: dependencies.authenticate,
    authorize: dependencies.authorize,
  }));
  router.use('/admin', createChainAdminRouter({
    chainController: dependencies.controllers.chains,
    paymentTokenController: dependencies.controllers.paymentTokenAdmin,
    authenticate: dependencies.authenticate,
    authorize: dependencies.authorize,
  }));
  router.use(createReferenceRouter({
    locationController: dependencies.controllers.locations,
    organizationController: dependencies.controllers.organizations,
  }));
  router.use('/organizations', createOrganizationRouter({
    controller: dependencies.controllers.organizations,
    authenticate: dependencies.authenticate,
    authorize: dependencies.authorize,
    requireInvestorChain: dependencies.requireInvestorChain,
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
    requireInvestorChain: dependencies.requireInvestorChain,
  }));
  router.use(createInvestorReferenceRouter(dependencies.controllers.investors));
  router.use('/investors', createInvestorRouter({
    controller: dependencies.controllers.investors,
    authenticate: dependencies.authenticate,
    authorize: dependencies.authorize,
    requireInvestorChain: dependencies.requireInvestorChain,
  }));
  router.use('/investments', createInvestmentRouter({
    controller: dependencies.controllers.investments,
    registryController: dependencies.controllers.registryRegistrations,
    purchaseController: dependencies.controllers.tokenPurchases,
    redemptionController: dependencies.controllers.tokenRedemptions,
    transferController: dependencies.controllers.tokenTransfers,
    transactionController: dependencies.controllers.blockchainTransactions,
    invitationController: dependencies.controllers.investorInvitations,
    authenticate: dependencies.authenticate,
    authorize: dependencies.authorize,
    requireInvestorChain: dependencies.requireInvestorChain,
  }));
  router.use('/issuer/claims', createIssuerClaimRouter({
    controller: dependencies.controllers.issuerClaims,
    authenticate: dependencies.authenticate,
    authorize: dependencies.authorize,
    requireInvestorChain: dependencies.requireInvestorChain,
  }));
  router.use('/investor/claims', createInvestorClaimRouter({
    controller: dependencies.controllers.investorClaims,
    authenticate: dependencies.authenticate,
    authorize: dependencies.authorize,
    requireInvestorChain: dependencies.requireInvestorChain,
  }));
  router.use(createMasterRouter(dependencies));
  return router;
};

module.exports = { createV1Router };
