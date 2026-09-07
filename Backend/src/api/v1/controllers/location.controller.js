const { sendSuccess } = require('../../../utils/response');

const createLocationController = (service) => ({
  countries: async (req, res) => {
    const result = await service.listCountries(req.query);
    return sendSuccess(req, res, { message: 'Countries fetched successfully.', data: result.rows, meta: { pagination: result.pagination } });
  },
  states: async (req, res) => {
    const result = await service.listStates(req.params.countryUid, req.query);
    return sendSuccess(req, res, { message: 'States fetched successfully.', data: result.rows, meta: { pagination: result.pagination } });
  },
  cities: async (req, res) => {
    const result = await service.listCities(req.params.stateUid, req.query);
    return sendSuccess(req, res, { message: 'Cities fetched successfully.', data: result.rows, meta: { pagination: result.pagination } });
  },
});

module.exports = { createLocationController };
