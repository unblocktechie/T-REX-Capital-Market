const express = require('express');
const { validate } = require('../../../middleware/validate.middleware');
const { asyncHandler } = require('../../../utils/async-handler');
const schemas = require('../../../schemas/investment.schema');

// All investment routes are authenticated + DB-authorized (permissionMaster). The
// marketplace list/detail/image are granted to admin + investor; the journey endpoints to
// investor; the review endpoints to issuer. See 20260909_add_investment_journey.sql.
const createInvestmentRouter = ({ controller, registryController, purchaseController, redemptionController, transferController, transactionController, invitationController, authenticate, authorize }) => {
  const router = express.Router();
  router.use(authenticate);

  // Wallet transactions are executed by the frontend. This endpoint is only a fast,
  // independently verified path into the same canonical history used by the indexer.
  router.post(
    '/transactions/confirm',
    validate({ body: schemas.confirmBlockchainTransaction }),
    authorize,
    asyncHandler(transactionController.confirm),
  );
  router.get(
    '/transactions',
    validate({ query: schemas.blockchainTransactionHistoryQuery }),
    authorize,
    asyncHandler(transactionController.list),
  );
  router.get(
    '/transactions/export',
    validate({ query: schemas.blockchainTransactionExportQuery }),
    authorize,
    asyncHandler(transactionController.export),
  );

  // Marketplace (admin + investor).
  router.get('/tokens', validate({ query: schemas.listTokensQuery }), authorize, asyncHandler(controller.listTokens));
  router.get('/tokens/:tokenUid', validate({ params: schemas.tokenParams }), authorize, asyncHandler(controller.getToken));
  router.get('/tokens/:tokenUid/image', validate({ params: schemas.tokenParams }), authorize, asyncHandler(controller.tokenImage));

  // Legacy purchase/transfer rows remain read-only during migration. Wallet transaction
  // execution never depends on creating a backend intent.
  router.get(
    '/tokens/:tokenUid/transfers',
    validate({ params: schemas.tokenParams, query: schemas.transferHistoryQuery }),
    authorize,
    asyncHandler(transferController.list),
  );
  router.get(
    '/transfers/:transferUid',
    validate({ params: schemas.transferParams }),
    authorize,
    asyncHandler(transferController.get),
  );

  // Off-chain redemption request and issuer decision workflow. The approved redemption
  // transaction is signed by the token issuer in the frontend and observed above.
  router.post(
    '/tokens/:tokenUid/redemptions',
    validate({ params: schemas.tokenParams, body: schemas.createRedemption }),
    authorize,
    asyncHandler(redemptionController.create),
  );
  router.get(
    '/tokens/:tokenUid/redemptions',
    validate({ params: schemas.tokenParams, query: schemas.redemptionListQuery }),
    authorize,
    asyncHandler(redemptionController.investorList),
  );
  router.get(
    '/redemptions/:redemptionUid',
    validate({ params: schemas.redemptionParams }),
    authorize,
    asyncHandler(redemptionController.investorGet),
  );
  router.post(
    '/redemptions/:redemptionUid/authorize',
    validate({ params: schemas.redemptionParams, body: schemas.authorizeRedemption }),
    authorize,
    asyncHandler(redemptionController.authorize),
  );
  router.post(
    '/redemptions/:redemptionUid/cancel',
    validate({ params: schemas.redemptionParams, body: schemas.emptyBody }),
    authorize,
    asyncHandler(redemptionController.cancel),
  );
  router.get(
    '/tokens/:tokenUid/purchases',
    validate({ params: schemas.tokenParams, query: schemas.purchaseHistoryQuery }),
    authorize,
    asyncHandler(purchaseController.history),
  );
  router.get(
    '/purchases/:purchaseUid',
    validate({ params: schemas.purchaseParams }),
    authorize,
    asyncHandler(purchaseController.get),
  );

  // Investor journey.
  router.get(
    '/me/portfolio',
    validate({ query: schemas.portfolioQuery }),
    authorize,
    asyncHandler(purchaseController.portfolio),
  );
  router.get(
    '/tokens/:tokenUid/required-documents',
    validate({ params: schemas.tokenParams }),
    authorize,
    asyncHandler(controller.requiredDocuments),
  );

  // Backend-authoritative Identity Registry registration. The first call records PENDING intent;
  // confirm accepts only txHash and independently proves the exact on-chain operation.
  router.post(
    '/issuer/interests/:interestUid/registry-registration',
    validate({ params: schemas.interestParams, body: schemas.emptyBody }),
    authorize,
    asyncHandler(registryController.create),
  );
  router.get(
    '/issuer/interests/:interestUid/registry-registration',
    validate({ params: schemas.interestParams }),
    authorize,
    asyncHandler(registryController.get),
  );
  router.post(
    '/issuer/interests/:interestUid/registry-registration/:registryRegistrationUid/confirm',
    validate({ params: schemas.registryRegistrationParams, body: schemas.confirmRegistryRegistration }),
    authorize,
    asyncHandler(registryController.confirm),
  );
  router.post(
    '/tokens/:tokenUid/interest',
    validate({ params: schemas.tokenParams, body: schemas.submitInterest }),
    authorize,
    asyncHandler(controller.submitInterest),
  );
  router.get('/me/interests', validate({ query: schemas.myInterestsQuery }), authorize, asyncHandler(controller.myInterests));
  router.get(
    '/me/interests/:interestUid/history',
    validate({ params: schemas.interestParams }),
    authorize,
    asyncHandler(controller.myInterestHistory),
  );
  router.get(
    '/me/invitations',
    validate({ query: schemas.investorInvitationsQuery }),
    authorize,
    asyncHandler(invitationController.investorList),
  );
  router.get(
    '/me/invitations/:invitationUid',
    validate({ params: schemas.invitationParams }),
    authorize,
    asyncHandler(invitationController.investorGet),
  );
  router.patch(
    '/me/invitations/:invitationUid/viewed',
    validate({ params: schemas.invitationParams, body: schemas.emptyBody }),
    authorize,
    asyncHandler(invitationController.investorViewed),
  );

  // Issuer review.
  router.get(
    '/issuer/investors',
    validate({ query: schemas.issuerInvestorsQuery }),
    authorize,
    asyncHandler(invitationController.issuerInvestors),
  );
  router.post(
    '/issuer/investors/:investorUid/invitations',
    validate({ params: schemas.investorParams, body: schemas.createInvestorInvitation }),
    authorize,
    asyncHandler(invitationController.invite),
  );
  router.get('/issuer/interests', validate({ query: schemas.issuerInterestsQuery }), authorize, asyncHandler(controller.issuerInterests));
  router.get(
    '/issuer/redemptions',
    validate({ query: schemas.redemptionListQuery }),
    authorize,
    asyncHandler(redemptionController.issuerList),
  );
  router.get(
    '/issuer/redemptions/:redemptionUid',
    validate({ params: schemas.redemptionParams }),
    authorize,
    asyncHandler(redemptionController.issuerGet),
  );
  router.post(
    '/issuer/redemptions/:redemptionUid/approve',
    validate({ params: schemas.redemptionParams, body: schemas.approveRedemption }),
    authorize,
    asyncHandler(redemptionController.approve),
  );
  router.post(
    '/issuer/redemptions/:redemptionUid/reject',
    validate({ params: schemas.redemptionParams, body: schemas.rejectRedemption }),
    authorize,
    asyncHandler(redemptionController.reject),
  );
  router.get(
    '/issuer/interests/:interestUid',
    validate({ params: schemas.interestParams }),
    authorize,
    asyncHandler(controller.issuerInterest),
  );
  router.post(
    '/issuer/interests/:interestUid/approve',
    validate({ params: schemas.interestParams, body: schemas.approveInterest }),
    authorize,
    asyncHandler(controller.approveInterest),
  );
  router.post(
    '/issuer/interests/:interestUid/reject',
    validate({ params: schemas.interestParams, body: schemas.rejectInterest }),
    authorize,
    asyncHandler(controller.rejectInterest),
  );
  router.get(
    '/issuer/interests/:interestUid/history',
    validate({ params: schemas.interestParams }),
    authorize,
    asyncHandler(controller.issuerInterestHistory),
  );
  router.get(
    '/issuer/interests/:interestUid/documents/:documentUid/download',
    validate({ params: schemas.interestDocumentParams }),
    authorize,
    asyncHandler(controller.issuerInterestDocument),
  );

  return router;
};

module.exports = { createInvestmentRouter };
