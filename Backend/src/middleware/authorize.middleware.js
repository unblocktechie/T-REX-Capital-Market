const { ApiError } = require('../core/errors/api-error');
const { asyncHandler } = require('../utils/async-handler');

const createAuthorize = (permissionRepository) => asyncHandler(async (req, res, next) => {
  const routePath = `${req.baseUrl}${req.route.path}`.replace(/\/+$/, '') || '/';
  const allowed = await permissionRepository.isAllowed(req.user.roleUid, req.method.toUpperCase(), routePath);
  if (!allowed) throw ApiError.forbidden('Your role is not permitted to access this API.');
  return next();
});

module.exports = { createAuthorize };
