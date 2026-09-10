const { sendSuccess } = require('../../../utils/response');

const createTokenTransferController = (service) => ({
  create: async (req, res) => {
    const result = await service.create(req.user, req.params.tokenUid, req.body);
    return sendSuccess(req, res, {
      statusCode: result.existing ? 200 : 201,
      message: result.existing ? 'Existing token transfer returned.' : 'Pending token transfer created.',
      data: result.transfer,
    });
  },

  get: async (req, res) => sendSuccess(req, res, {
    message: 'Token transfer fetched successfully.',
    data: await service.get(req.user, req.params.transferUid),
  }),

  list: async (req, res) => {
    const result = await service.list(req.user, req.params.tokenUid, req.query);
    return sendSuccess(req, res, {
      message: 'Token transfer history fetched successfully.',
      data: result.items,
      meta: result.pagination,
    });
  },

  confirm: async (req, res) => {
    const result = await service.confirm(req.user, req.params.transferUid, req.body.txHash);
    let message = 'Token transfer confirmed successfully.';
    if (result.expired) message = 'Token transfer intent has expired. Create a new intent.';
    else if (result.pendingVerification) message = 'Token transfer verification is pending.';
    else if (result.idempotent) message = 'Token transfer is already confirmed.';
    return sendSuccess(req, res, { statusCode: 200, message, data: result.transfer });
  },

  retry: async (req, res) => {
    const result = await service.retry(req.user, req.params.transferUid);
    let statusCode = 202;
    let message = 'Token transfer reconciliation queued.';
    if (result.alreadyCompleted) {
      statusCode = 200;
      message = 'Token transfer is already complete.';
    } else if (result.transactionRequired) {
      statusCode = 200;
      message = 'A new wallet transaction is required for this transfer intent.';
    }
    return sendSuccess(req, res, { statusCode, message, data: result.transfer });
  },
});

module.exports = { createTokenTransferController };
