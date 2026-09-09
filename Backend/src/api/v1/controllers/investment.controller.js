const { sendSuccess } = require('../../../utils/response');

const createInvestmentController = (service) => ({
  // Marketplace (admin + investor).
  listTokens: async (req, res) => {
    const { items, pagination } = await service.listTokens(req.user, req.query);
    return sendSuccess(req, res, {
      message: 'Investment tokens fetched successfully.',
      data: items,
      meta: pagination,
    });
  },
  getToken: async (req, res) => sendSuccess(req, res, {
    message: 'Investment token fetched successfully.',
    data: await service.getTokenDetails(req.params.tokenUid),
  }),
  tokenImage: async (req, res, next) => {
    const result = await service.getTokenImageFile(req.params.tokenUid);
    res.type(result.token.imageMimeType || 'image/webp');
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('Content-Disposition', `inline; filename="${result.token.tokenSymbol || 'token'}-image.webp"`);
    return res.sendFile(result.filePath, (error) => {
      if (error && !res.headersSent) next(error);
    });
  },

  // Investor journey.
  requiredDocuments: async (req, res) => sendSuccess(req, res, {
    message: 'Required claim-topic documents fetched successfully.',
    data: await service.getRequiredDocuments(req.user, req.params.tokenUid),
  }),
  submitInterest: async (req, res) => sendSuccess(req, res, {
    statusCode: 201,
    message: 'Investment interest submitted successfully.',
    data: await service.submitInterest(req.user, req.params.tokenUid, req.body),
  }),
  myInterests: async (req, res) => sendSuccess(req, res, {
    message: 'Your investment interests fetched successfully.',
    data: await service.listMyInterests(req.user, req.query),
  }),
  myInterestHistory: async (req, res) => sendSuccess(req, res, {
    message: 'Investment interest history fetched successfully.',
    data: await service.getMyInterestHistory(req.user, req.params.interestUid),
  }),

  // Issuer review.
  issuerInterests: async (req, res) => sendSuccess(req, res, {
    message: 'Investment interests fetched successfully.',
    data: await service.listIssuerInterests(req.user, req.query),
  }),
  issuerInterest: async (req, res) => sendSuccess(req, res, {
    message: 'Investment interest fetched successfully.',
    data: await service.getIssuerInterest(req.user, req.params.interestUid),
  }),
  issuerInterestHistory: async (req, res) => sendSuccess(req, res, {
    message: 'Investment interest history fetched successfully.',
    data: await service.getIssuerInterestHistory(req.user, req.params.interestUid),
  }),
  approveInterest: async (req, res) => sendSuccess(req, res, {
    message: 'Investment interest verified by issuer.',
    data: await service.approveInterest(req.user, req.params.interestUid),
  }),
  rejectInterest: async (req, res) => sendSuccess(req, res, {
    message: 'Investment interest rejected.',
    data: await service.rejectInterest(req.user, req.params.interestUid, req.body),
  }),
  issuerInterestDocument: async (req, res, next) => {
    const result = await service.getIssuerInterestDocumentForDownload(
      req.user,
      req.params.interestUid,
      req.params.documentUid,
    );
    return res.download(result.filePath, result.document.originalFileName, (error) => {
      if (error && !res.headersSent) next(error);
    });
  },
});

module.exports = { createInvestmentController };
