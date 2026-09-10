const { sendSuccess } = require('../../../utils/response');

const createTokenRedemptionController = (service) => ({
  create: async (req, res) => {
    const result = await service.create(req.user, req.params.tokenUid, req.body);
    return sendSuccess(req, res, {
      statusCode: result.existing ? 200 : 201,
      message: result.existing ? 'Existing redemption request returned.' : 'Redemption request created.',
      data: result.redemption,
    });
  },
  authorize: async (req, res) => {
    const result = await service.authorize(req.user, req.params.redemptionUid, req.body.signature);
    return sendSuccess(req, res, {
      message: result.idempotent ? 'Redemption was already authorized.' : 'Redemption authorization verified.',
      data: result.redemption,
    });
  },
  investorGet: async (req, res) => sendSuccess(req, res, {
    message: 'Redemption fetched successfully.', data: await service.getInvestor(req.user, req.params.redemptionUid),
  }),
  investorList: async (req, res) => {
    const result = await service.listInvestor(req.user, req.params.tokenUid, req.query);
    return sendSuccess(req, res, { message: 'Redemption history fetched successfully.', data: result.items, meta: result.pagination });
  },
  cancel: async (req, res) => {
    const result = await service.cancel(req.user, req.params.redemptionUid);
    return sendSuccess(req, res, {
      message: result.redemption.status === 'CANCELLATION_PENDING'
        ? 'Cancellation queued while the token lock is safely released.'
        : (result.idempotent ? 'Redemption was already cancelled.' : 'Redemption cancelled.'),
      data: result.redemption,
    });
  },
  retry: async (req, res) => {
    const result = await service.retry(req.user, req.params.redemptionUid);
    return sendSuccess(req, res, {
      message: result.terminal ? 'Current terminal redemption state returned.' : 'Redemption reconciliation queued.',
      data: result.redemption,
    });
  },
  issuerList: async (req, res) => {
    const result = await service.listIssuer(req.user, req.query);
    return sendSuccess(req, res, { message: 'Issuer redemption requests fetched successfully.', data: result.items, meta: result.pagination });
  },
  issuerGet: async (req, res) => sendSuccess(req, res, {
    message: 'Issuer redemption request fetched successfully.', data: await service.getIssuer(req.user, req.params.redemptionUid),
  }),
  approve: async (req, res) => {
    const result = await service.approve(req.user, req.params.redemptionUid, req.body.note);
    return sendSuccess(req, res, {
      message: result.lockSubmitted ? 'Redemption approved and token lock submitted.' : 'Redemption approved; token lock is queued.',
      data: result.redemption,
    });
  },
  reject: async (req, res) => {
    const result = await service.reject(req.user, req.params.redemptionUid, req.body.reason);
    return sendSuccess(req, res, {
      message: result.idempotent ? 'Redemption was already rejected.' : 'Redemption rejected.', data: result.redemption,
    });
  },
  confirmPayment: async (req, res) => {
    const result = await service.confirmPayment(req.user, req.params.redemptionUid, req.body.txHash);
    let message = 'Issuer payment verified; token burn is queued.';
    if (result.pending) message = 'Issuer payment verification is pending.';
    else if (result.burnSubmitted) message = 'Issuer payment verified and token burn submitted.';
    else if (result.idempotent) message = 'Issuer payment was already verified.';
    return sendSuccess(req, res, { message, data: result.redemption });
  },
});

module.exports = { createTokenRedemptionController };
