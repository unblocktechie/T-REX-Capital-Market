const { sendSuccess } = require('../../../utils/response');

const createBlockchainTransactionController = (service) => ({
  confirm: async (req, res) => {
    const transaction = service.present(await service.confirm(req.user, req.body));
    let message = 'Blockchain transaction confirmed and recorded successfully.';
    if (transaction.status === 'SUBMITTED') message = 'Transaction submitted and awaiting blockchain confirmations.';
    if (transaction.status === 'FAILED') message = 'Blockchain transaction failed and was recorded.';
    return sendSuccess(req, res, { statusCode: 200, message, data: transaction });
  },

  list: async (req, res) => {
    const result = await service.list(req.user, req.query);
    return sendSuccess(req, res, {
      message: 'Blockchain transaction history fetched successfully.',
      data: result.items,
      meta: result.pagination,
    });
  },

  export: async (req, res) => {
    const csv = await service.exportCsv(req.user, req.query);
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="trex-transactions-${stamp}.csv"`);
    return res.status(200).send(`\uFEFF${csv}`);
  },
});

module.exports = { createBlockchainTransactionController };
