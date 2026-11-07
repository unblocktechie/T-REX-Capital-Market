const express = require('express');
const { validate } = require('../../../middleware/validate.middleware');
const { asyncHandler } = require('../../../utils/async-handler');
const { sendSuccess } = require('../../../utils/response');
const schemas = require('../../../schemas/admin-platform.schema');
const { tokenPriceHistoryQuery } = require('../../../schemas/token.schema');
const createAdminPlatformRouter = ({ service, authenticate, authorize }) => {
  const router = express.Router();
  router.use(authenticate);
  const result = (method) => asyncHandler(async (req, res) => sendSuccess(req, res, {
    data: await service[method](req.body), message: 'Admin configuration fetched or updated successfully.',
  }));
  router.get('/issuer-api-key-settings', authorize, result('keySettings'));
  router.patch('/issuer-api-key-settings', validate({ body: schemas.apiKeySettings }), authorize, result('updateKeySettings'));
  router.get('/notification-settings', authorize, result('notifications'));
  router.patch('/notification-settings', validate({ body: schemas.notificationSettings }), authorize, result('updateNotifications'));
  const list = (path, kind, params = false) => router.get(path,
    validate({ query: ({ applications: schemas.applicationQuery, tokens: schemas.tokenListQuery,
      invested: schemas.tokenListQuery.fork('sortBy', field => field.invalid('currentHolders')), investors: schemas.investorQuery, chains: schemas.investorChainQuery })[kind] || schemas.query,
    ...(params ? { params: schemas.params } : {}) }), authorize,
    asyncHandler(async (req, res) => {
      const data = await service.list(kind, req.query, req.params.userUid);
      return sendSuccess(req, res, { data: data.rows, meta: { pagination: data.pagination }, message: 'Admin data fetched successfully.' });
    }));
  list('/investors', 'investors');
  router.get('/investors/:userUid', validate({ params: schemas.params }), authorize, asyncHandler(async (req, res) =>
    sendSuccess(req, res, { data: await service.requireInvestor(req.params.userUid), message: 'Investor fetched successfully.' })));
  list('/investors/:userUid/chains', 'chains', true);
  list('/investors/:userUid/invested-tokens', 'invested', true);
  list('/investors/:userUid/applications', 'applications', true);
  list('/tokens', 'tokens');
  router.get('/tokens/:tokenUid/price-history',
    validate({ params: schemas.tokenParams, query: tokenPriceHistoryQuery.fork('tokenUid', field => field.forbidden()).keys({
      sortBy: require('joi').string().valid('createdAt','submittedAt','confirmedAt','status','oldPriceFormatted','newPriceFormatted','blockNumber'),
      sortOrder: require('joi').string().lowercase().valid('asc','desc').default('desc'),
    }) }), authorize,
    asyncHandler(async (req, res) => {
      const result = await service.tokenPriceHistory(req.params.tokenUid, req.query);
      return sendSuccess(req, res, { message: 'Token price history fetched successfully.',
        data: result.rows, meta: { pagination: result.pagination } });
    }));
  router.get('/tokens/:tokenUid', validate({ params: schemas.tokenParams, query: schemas.detailQuery }), authorize,
    asyncHandler(async (req, res) => {
      const result = await service.tokenDetails(req.params.tokenUid, req.query);
      return sendSuccess(req, res, { message: 'Admin token details fetched successfully.',
        data: { token: result.token, investors: result.investors, holderSummary: result.holderSummary }, meta: { pagination: result.pagination } });
    }));
  router.get('/investor-applications/:interestUid/history', validate({ params: schemas.interestParams, query: schemas.historyQuery }), authorize,
    asyncHandler(async (req, res) => sendSuccess(req, res, {
      message: 'Investment interest history fetched successfully.', data: await service.applicationHistory(req.params.interestUid, req.query),
    })));
  list('/investor-applications', 'applications');
  router.get('/investor-applications/:interestUid/documents/:documentUid/download',
    validate({ params: schemas.documentParams }), authorize,
    asyncHandler(async (req, res, next) => {
      const result = await service.applicationDocument(req.params.interestUid, req.params.documentUid);
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      return res.download(result.filePath, result.document.originalFileName, error => {
        if (error && !res.headersSent) next(error);
      });
    }));
  return router;
};
module.exports = { createAdminPlatformRouter };
