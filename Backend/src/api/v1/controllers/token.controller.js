const { sendSuccess } = require('../../../utils/response');
const { HTTP_STATUS } = require('../../../config/constants');

const createTokenController = (service, optionRepository, paymentTokenRegistryService, priceUpdateService) => ({
  options: async (req, res) => {
    const paymentTokens = await paymentTokenRegistryService.listEnabled(req.query);
    return sendSuccess(req, res, {
      message: 'Token creation options fetched successfully.',
      data: await optionRepository.listAll(paymentTokens),
    });
  },
  paymentTokens: async (req, res) => sendSuccess(req, res, {
    message: 'Supported payment tokens fetched successfully.',
    data: await paymentTokenRegistryService.listEnabled(req.query),
  }),
  getMine: async (req, res) => sendSuccess(req, res, {
    message: 'Token form fetched successfully.',
    data: await service.getFullToken(req.user, req.selectedChain),
  }),
  saveInformation: async (req, res) => sendSuccess(req, res, {
    message: req.body.isDraft ? 'Token information draft saved.' : 'Token information saved.',
    data: await service.saveInformation(req.user, req.body, req.file, req.selectedChain),
  }),
  saveClaims: async (req, res) => sendSuccess(req, res, {
    message: req.body.isDraft ? 'Token claims draft saved.' : 'Token claims saved.',
    data: await service.saveClaims(req.user, req.body, req.selectedChain),
  }),
  saveCompliance: async (req, res) => sendSuccess(req, res, {
    message: req.body.isDraft ? 'Token compliance draft saved.' : 'Token compliance rules saved.',
    data: await service.saveCompliance(req.user, req.body, req.selectedChain),
  }),
  saveGovernance: async (req, res) => sendSuccess(req, res, {
    message: req.body.isDraft ? 'Token governance draft saved.' : 'Token governance roles saved.',
    data: await service.saveGovernance(req.user, req.body, req.selectedChain),
  }),
  updatePrice: async (req, res) => {
    const result = await priceUpdateService.confirmDirect(req.user, req.body, req.selectedChain);
    return sendSuccess(req, res, {
      statusCode: result.pending ? 202 : 200,
      message: result.pending ? 'Price transaction verification is pending. Do not submit another transaction.'
        : 'On-chain token price verified successfully.',
      data: result.data,
    });
  },
  prepareDirectPrice: async (req, res) => sendSuccess(req, res, {
    message: 'Pending price update saved. Submit the returned direct transaction from the issuer wallet.',
    data: await priceUpdateService.prepareDirect(req.user, req.body, req.selectedChain),
  }),
  cancelDirectPrice: async (req, res) => sendSuccess(req, res, {
    message: 'Unsigned price request cancellation processed.',
    data: await priceUpdateService.cancelDirect(req.user, req.params.priceUpdateUid, req.selectedChain, req.body),
  }),
  /* Retry API disabled; background indexer owns recovery.
  retryDirectPrice: async (req, res) => sendSuccess(req, res, {
    message: 'Price request recovery checked. No transaction was broadcast.',
    data: await priceUpdateService.recoverDirect(req.user, req.params.priceUpdateUid, req.selectedChain, req.body),
  }),
  */
  preparePriceUpdate: async (req, res) => sendSuccess(req, res, {
    message: 'Relayed token price update prepared successfully.',
    data: await priceUpdateService.prepare(req.user, req.body, req.selectedChain),
  }),
  submitPriceUpdate: async (req, res) => sendSuccess(req, res, {
    statusCode: HTTP_STATUS.ACCEPTED,
    message: 'Token price transaction submitted successfully.',
    data: await priceUpdateService.submit(req.user, req.body, req.selectedChain, req.auth),
  }),
  getPriceUpdate: async (req, res) => sendSuccess(req, res, {
    message: 'Token price update fetched successfully.',
    data: await priceUpdateService.get(req.user, req.params.priceUpdateUid, req.selectedChain),
  }),
  priceHistory: async (req, res) => {
    const result = await priceUpdateService.history(req.user, req.query, req.selectedChain);
    return sendSuccess(req, res, { message: 'Token price history fetched successfully.',
      data: result.rows, meta: { pagination: result.pagination } });
  },
  submit: async (req, res) => {
    const result = await service.submit(req.user, req.body, req.selectedChain);
    // Two-phase flow: the transaction is broadcast but not yet confirmed on-chain.
    if (result && result.pending) {
      return res.status(HTTP_STATUS.ACCEPTED).json({
        success: false,
        pending: true,
        message: 'Deployment transaction is still awaiting confirmation.',
        data: {
          deploymentAttemptUid: result.deploymentAttemptUid,
          status: result.status,
          transactionHash: result.transactionHash,
        },
        timestamp: new Date().toISOString(),
        requestId: req.id,
      });
    }
    return sendSuccess(req, res, {
      message: 'Token deployment transaction verified and TREX suite details saved.',
      data: result,
    });
  },
  image: async (req, res, next) => {
    const result = await service.getImage(req.user, req.selectedChain);
    res.type(result.token.imageMimeType);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('Content-Disposition', `inline; filename="${result.token.tokenSymbol || 'token'}-image.webp"`);
    return res.sendFile(result.filePath, (error) => {
      if (error && !res.headersSent) next(error);
    });
  },
});

module.exports = { createTokenController };
