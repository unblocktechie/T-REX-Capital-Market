const { sendSuccess } = require('../../../utils/response');

const createChainController = ({ runtimeService, publicConfigurationService, adminService, identityService }) => ({
  listPublic: async (req, res) => sendSuccess(req, res, {
    message: 'Supported chains fetched successfully.', data: await runtimeService.listPublic(),
  }),
  listMine: async (req, res) => sendSuccess(req, res, {
    message: 'Chain access and ONCHAINID status fetched successfully.', data: await identityService.listForUser(req.user),
  }),
  configuration: async (req, res) => sendSuccess(req, res, {
    message: 'Chain configuration fetched successfully.',
    data: await publicConfigurationService.get(req.params.chainUid),
  }),
  image: async (req, res, next) => {
    const result = await adminService.getImage(req.params.chainUid);
    res.type(result.chain.imageMimeType || 'image/webp');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.setHeader('Content-Disposition', 'inline; filename="network-image.webp"');
    return res.sendFile(result.filePath, (error) => {
      if (error && !res.headersSent) next(error);
    });
  },
  unlock: async (req, res) => sendSuccess(req, res, {
    message: 'Chain unlocked and ONCHAINID verified successfully.',
    data: await identityService.unlock(req.user, req.params.chainUid),
  }),
  adminList: async (req, res) => {
    const result = await adminService.list(req.query);
    return sendSuccess(req, res, { message: 'Chain configurations fetched successfully.', data: result.rows, meta: { pagination: result.pagination } });
  },
  adminGet: async (req, res) => sendSuccess(req, res, {
    message: 'Chain configuration fetched successfully.', data: await adminService.get(req.params.chainUid),
  }),
  adminCreate: async (req, res) => sendSuccess(req, res, {
    statusCode: 201, message: 'Chain configuration created successfully.', data: await adminService.create(req.body, req.user, req.file),
  }),
  adminUpdate: async (req, res) => sendSuccess(req, res, {
    message: 'Chain configuration updated successfully.', data: await adminService.update(req.params.chainUid, req.body, req.user),
  }),
  adminUpdateImage: async (req, res) => sendSuccess(req, res, {
    message: 'Network image updated successfully.',
    data: await adminService.updateImage(req.params.chainUid, req.file, req.user),
  }),
  adminAudits: async (req, res) => {
    const result = await adminService.listAudits(req.params.chainUid, req.query);
    return sendSuccess(req, res, { message: 'Network audit history fetched successfully.', data: result.rows, meta: { pagination: result.pagination } });
  },
});

module.exports = { createChainController };
