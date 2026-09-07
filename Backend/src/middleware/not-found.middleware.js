const { ApiError } = require('../core/errors/api-error');

const notFoundHandler = (req, res, next) => next(ApiError.notFound(`Route ${req.method} ${req.originalUrl} was not found.`));

module.exports = { notFoundHandler };
