const { sendSuccess } = require('../../../utils/response');
const { ApiError } = require('../../../core/errors/api-error');
const { withSelectedChainId } = require('../../../utils/selected-chain');

const createBlockchainTransactionController = (service) => ({
  confirm: async (req, res) => {
    if (req.selectedChain && Number(req.body.chainId) !== Number(req.selectedChain.chainId)) {
      throw new ApiError(422, 'Transaction chain does not match the selected network.', undefined, 'SELECTED_CHAIN_MISMATCH');
    }
    const transaction = service.present(await service.confirm(
      req.user,
      withSelectedChainId(req.body, req.selectedChain),
    ));
    let message = 'Blockchain transaction confirmed and recorded successfully.';
    if (transaction.status === 'SUBMITTED') message = 'Transaction submitted and awaiting blockchain confirmations.';
    if (transaction.status === 'FAILED') message = 'Blockchain transaction failed and was recorded.';
    return sendSuccess(req, res, { statusCode: 200, message, data: transaction });
  },

  list: async (req, res) => {
    const result = await service.list(req.user, withSelectedChainId(req.query, req.selectedChain));
    return sendSuccess(req, res, {
      message: 'Blockchain transaction history fetched successfully.',
      data: result.items,
      meta: result.pagination,
    });
  },

  export: async (req, res) => {
    const csv = await service.exportCsv(req.user, withSelectedChainId(req.query, req.selectedChain));
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="trex-transactions-${stamp}.csv"`);
    return res.status(200).send(`\uFEFF${csv}`);
  },
});

module.exports = { createBlockchainTransactionController };
