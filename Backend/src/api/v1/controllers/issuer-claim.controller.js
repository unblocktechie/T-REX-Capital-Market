const { sendSuccess } = require('../../../utils/response');

const createIssuerClaimController = (service) => ({
  sign: async (req, res) => sendSuccess(req, res, {
    statusCode: 201,
    message: 'Issuer claim signatures processed.',
    data: await service.signClaims(req.user, req.body, req.selectedChain),
  }),
  status: async (req, res) => sendSuccess(req, res, {
    message: 'Issuer claim verification status fetched successfully.',
    data: await service.getStatus(req.user, req.params.subscriptionId, req.selectedChain),
  }),
});

module.exports = { createIssuerClaimController };
