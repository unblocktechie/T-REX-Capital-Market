const { sendSuccess } = require('../../../utils/response');
const { requestMetadata } = require('../../../middleware/issuer-api-key-auth.middleware');

const createIssuerApiKeyController = (service) => ({
  policyOptions: async (req, res) => {
    service.assertIssuer(req.user);
    return sendSuccess(req, res, { data: await service.policyService.limits() });
  },
  updatePolicy: async (req, res) => sendSuccess(req, res, {
    message: 'API key policy updated.', data: await service.updatePolicy(req.user, req.params.issuerApiKeyUid, req.body, requestMetadata(req)),
  }),
  create: async (req, res) => sendSuccess(req, res, {
    statusCode: 201,
    message: 'Issuer API key created successfully. Copy it now because it will not be shown again.',
    data: await service.create(req.user, req.body, requestMetadata(req)),
  }),
  list: async (req, res) => {
    const result = await service.list(req.user);
    return sendSuccess(req, res, {
      message: 'Issuer API keys fetched successfully.',
      data: result.keys,
      meta: result.meta,
    });
  },
  revoke: async (req, res) => sendSuccess(req, res, {
    message: 'Issuer API key revoked successfully.',
    data: await service.revoke(req.user, req.params.issuerApiKeyUid, requestMetadata(req)),
  }),
  rotate: async (req, res) => sendSuccess(req, res, {
    statusCode: 201,
    message: 'Issuer API key rotated successfully. The previous key is revoked; copy the new key now.',
    data: await service.rotate(req.user, req.params.issuerApiKeyUid, req.body, requestMetadata(req)),
  }),
});

module.exports = { createIssuerApiKeyController };
