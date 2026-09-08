const { sendSuccess } = require('../../../utils/response');
const { HTTP_STATUS } = require('../../../config/constants');

const createTokenController = (service, optionRepository) => ({
  options: async (req, res) => sendSuccess(req, res, {
    message: 'Token creation options fetched successfully.',
    data: await optionRepository.listAll(),
  }),
  getMine: async (req, res) => sendSuccess(req, res, {
    message: 'Token form fetched successfully.',
    data: await service.getFullToken(req.user),
  }),
  saveInformation: async (req, res) => sendSuccess(req, res, {
    message: req.body.isDraft ? 'Token information draft saved.' : 'Token information saved.',
    data: await service.saveInformation(req.user, req.body, req.file),
  }),
  saveClaims: async (req, res) => sendSuccess(req, res, {
    message: req.body.isDraft ? 'Token claims draft saved.' : 'Token claims saved.',
    data: await service.saveClaims(req.user, req.body),
  }),
  saveCompliance: async (req, res) => sendSuccess(req, res, {
    message: req.body.isDraft ? 'Token compliance draft saved.' : 'Token compliance rules saved.',
    data: await service.saveCompliance(req.user, req.body),
  }),
  saveGovernance: async (req, res) => sendSuccess(req, res, {
    message: req.body.isDraft ? 'Token governance draft saved.' : 'Token governance roles saved.',
    data: await service.saveGovernance(req.user, req.body),
  }),
  submit: async (req, res) => {
    const result = await service.submit(req.user, req.body);
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
    const result = await service.getImage(req.user);
    res.type(result.token.imageMimeType);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('Content-Disposition', `inline; filename="${result.token.tokenSymbol || 'token'}-image.webp"`);
    return res.sendFile(result.filePath, (error) => {
      if (error && !res.headersSent) next(error);
    });
  },
});

module.exports = { createTokenController };
