const { sendSuccess } = require('../../../utils/response');
const { HTTP_STATUS } = require('../../../config/constants');

const createDeploymentAttemptController = (service) => ({
  create: async (req, res) => {
    const result = await service.createDeploymentAttempt({
      user: req.user,
      chainId: req.body.chainId,
      walletAddress: req.body.walletAddress,
      idempotencyKey: req.body.idempotencyKey,
      networkName: req.body.networkName,
      metadata: req.body.metadata,
    });
    return sendSuccess(req, res, {
      statusCode: result.created ? HTTP_STATUS.CREATED : HTTP_STATUS.OK,
      message: result.created
        ? 'Deployment attempt created successfully.'
        : 'Existing deployment attempt returned.',
      data: service.publicAttempt(result.attempt),
    });
  },

  submitted: async (req, res) => {
    const attempt = await service.markDeploymentSubmitted({
      user: req.user,
      deploymentAttemptUid: req.params.deploymentAttemptUid,
      transactionHash: req.body.transactionHash,
      walletAddress: req.body.walletAddress,
      chainId: req.body.chainId,
    });
    return sendSuccess(req, res, {
      message: 'Deployment transaction recorded.',
      data: service.publicAttempt(attempt),
    });
  },

  fail: async (req, res) => {
    const attempt = await service.markDeploymentAttemptFailed({
      user: req.user,
      deploymentAttemptUid: req.params.deploymentAttemptUid,
      status: req.body.status,
      errorCode: req.body.errorCode,
      errorMessage: req.body.errorMessage,
    });
    return sendSuccess(req, res, {
      message: 'Deployment attempt closed.',
      data: service.publicAttempt(attempt),
    });
  },

  active: async (req, res) => sendSuccess(req, res, {
    message: 'Active deployment attempt fetched successfully.',
    data: await service.getActiveDeploymentAttempt({ user: req.user }),
  }),
});

module.exports = { createDeploymentAttemptController };
