const { sendSuccess } = require('../../../utils/response');

const createCrudController = (service, { singular, plural, uidParam }) => ({
  create: async (req, res) => sendSuccess(req, res, {
    statusCode: 201, message: `${singular} created successfully.`, data: await service.create(req.body),
  }),
  list: async (req, res) => {
    const result = await service.list(req.query);
    return sendSuccess(req, res, { message: `${plural} fetched successfully.`, data: result.rows, meta: { pagination: result.pagination } });
  },
  getByUid: async (req, res) => sendSuccess(req, res, {
    message: `${singular} fetched successfully.`, data: await service.getByUid(req.params[uidParam]),
  }),
  update: async (req, res) => sendSuccess(req, res, {
    message: `${singular} updated successfully.`, data: await service.update(req.params[uidParam], req.body),
  }),
  delete: async (req, res) => {
    await service.delete(req.params[uidParam]);
    return sendSuccess(req, res, { message: `${singular} deleted successfully.` });
  },
});

module.exports = { createCrudController };
