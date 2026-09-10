const { sendSuccess } = require('../../../utils/response');

const createIdentityRegistryRegistrationController = (service) => ({
  create: async (req, res) => {
    const result = await service.create(req.user, req.params.interestUid);
    let message = 'Registry operation created.';
    if (result.alreadyRegistered) {
      message = 'Existing on-chain registry registration synchronized successfully.';
    } else if (result.existing) {
      message = 'Existing registry operation returned.';
    }
    return sendSuccess(req, res, {
      statusCode: result.existing || result.alreadyRegistered ? 200 : 201,
      message,
      data: result.operation,
    });
  },
  get: async (req, res) => sendSuccess(req, res, {
    message: 'Registry operation fetched successfully.',
    data: await service.get(req.user, req.params.interestUid),
  }),
  confirm: async (req, res) => {
    const result = await service.confirm(
      req.user,
      req.params.interestUid,
      req.params.registryRegistrationUid,
      req.body.txHash,
    );
    return sendSuccess(req, res, {
      statusCode: result.pendingVerification ? 202 : 200,
      message: result.pendingVerification
        ? (result.message || 'Registry transaction verification is pending.')
        : (result.idempotent ? 'Registry operation was already confirmed.' : 'Registry transaction verified successfully.'),
      data: result.operation,
    });
  },
});

module.exports = { createIdentityRegistryRegistrationController };
