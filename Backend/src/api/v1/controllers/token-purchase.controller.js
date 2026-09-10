const { sendSuccess } = require('../../../utils/response');

const createTokenPurchaseController = (service) => ({
  create: async (req, res) => {
    const result = await service.create(req.user, req.params.tokenUid, req.body);
    return sendSuccess(req, res, {
      statusCode: result.existing ? 200 : 201,
      message: result.existing ? 'Existing token purchase returned.' : 'Pending token purchase created.',
      data: result.purchase,
    });
  },
  get: async (req, res) => sendSuccess(req, res, {
    message: 'Token purchase fetched successfully.', data: await service.get(req.user, req.params.purchaseUid),
  }),
  history: async (req, res) => {
    const result = await service.listByToken(req.user, req.params.tokenUid, req.query);
    return sendSuccess(req, res, {
      message: 'Token purchase history fetched successfully.',
      data: result.items,
      meta: result.pagination,
    });
  },
  portfolio: async (req, res) => {
    const result = await service.portfolio(req.user, req.query);
    return sendSuccess(req, res, {
      message: 'Investor portfolio fetched successfully.',
      data: result.items,
      meta: result.pagination,
    });
  },
  confirm: async (req, res) => {
    const result = await service.confirm(req.user, req.params.purchaseUid, req.body.txHash);
    let message = 'USDT payment verified.';
    if (result.expired) message = 'Payment intent has expired. Create a new purchase intent.';
    else if (result.pendingVerification) message = 'Payment verification is pending.';
    else if (result.mintConfirmed) message = 'USDT payment verified and token mint completed.';
    else if (result.mintPending && result.mintSubmitted) message = 'USDT payment verified; token mint submitted and awaiting confirmation.';
    else if (result.mintPending) message = 'USDT payment verified; token minting is pending recovery.';
    else if (result.mintSubmitted) message = 'USDT payment verified and token mint submitted.';
    else if (result.purchase.status === 'COMPLETED') message = 'Token purchase is already complete.';
    else if (result.purchase.status === 'MINT_SUBMITTED') message = 'USDT payment verified; token mint is already submitted.';
    return sendSuccess(req, res, {
      // A persisted lifecycle state is a successful API result. The frontend uses `data.status`
      // as the source of truth and does not infer settlement state from HTTP 200 vs 202.
      statusCode: 200,
      message,
      data: result.purchase,
    });
  },
  retry: async (req, res) => {
    const result = await service.retry(req.user, req.params.purchaseUid);
    return sendSuccess(req, res, {
      statusCode: result.alreadyCompleted ? 200 : 202,
      message: result.alreadyCompleted ? 'Token purchase is already complete.' : 'Purchase reconciliation queued.',
      data: result.purchase,
    });
  },
});

module.exports = { createTokenPurchaseController };
