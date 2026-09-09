const { sendSuccess } = require('../../../utils/response');

const createInvestorClaimController = (service) => ({
  list: async (req, res) => sendSuccess(req, res, {
    message: 'Issuer-signed claims fetched successfully.',
    data: await service.getClaims(req.user, req.query.interestId),
  }),
  prepare: async (req, res) => sendSuccess(req, res, {
    statusCode: 201,
    message: 'Claim submission prepared. Submit the transaction on-chain, then confirm with txHash.',
    data: await service.prepareClaim(req.user, req.params.claimId, req.body),
  }),
  retry: async (req, res) => {
    const result = await service.retryClaim(req.user, req.params.claimId, req.body);
    return sendSuccess(req, res, {
      statusCode: result.status === 'SYNCING' ? 202 : 200,
      message: result.message,
      data: { status: result.status, detected: result.detected, claim: result.claim, application: result.application },
    });
  },
  submit: async (req, res) => {
    const result = await service.submitClaim(req.user, req.params.claimId, req.body);
    return sendSuccess(req, res, {
      statusCode: result.status === 'PENDING_CONFIRMATION' ? 202 : 200,
      message: result.message,
      data: { status: result.status, claim: result.claim, application: result.application },
    });
  },
});

module.exports = { createInvestorClaimController };
