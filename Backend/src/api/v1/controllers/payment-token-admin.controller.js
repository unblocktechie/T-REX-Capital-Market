const { sendSuccess } = require('../../../utils/response');

const createPaymentTokenAdminController = (service) => ({
  list: async (req, res) => {
    const result = await service.list(req.query);
    return sendSuccess(req, res, { message: 'Payment tokens fetched successfully.', data: result.rows, meta: { pagination: result.pagination } });
  },
  get: async (req, res) => sendSuccess(req, res, { message: 'Payment token fetched successfully.', data: await service.get(req.params.paymentTokenUid) }),
  create: async (req, res) => sendSuccess(req, res, { statusCode: 201, message: 'Payment token created successfully.', data: await service.create(req.body, req.file) }),
  update: async (req, res) => sendSuccess(req, res, { message: 'Payment token updated successfully.', data: await service.update(req.params.paymentTokenUid, req.body) }),
  updateImage: async (req, res) => sendSuccess(req, res, { message: 'Payment-token image updated successfully.', data: await service.updateImage(req.params.paymentTokenUid, req.file) }),
  image: async (req, res, next) => {
    const result = await service.getImage(req.params.paymentTokenUid);
    res.type(result.token.imageMimeType || 'image/webp');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.setHeader('Content-Disposition', 'inline; filename="payment-token-image.webp"');
    return res.sendFile(result.filePath, (error) => {
      if (error && !res.headersSent) next(error);
    });
  },
  remove: async (req, res) => { await service.remove(req.params.paymentTokenUid); return sendSuccess(req, res, { message: 'Payment token deleted successfully.' }); },
});

module.exports = { createPaymentTokenAdminController };
