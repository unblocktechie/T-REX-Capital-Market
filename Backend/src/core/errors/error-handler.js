const { JsonWebTokenError, TokenExpiredError } = require('jsonwebtoken');
const { ApiError } = require('./api-error');
const { logger } = require('../../services/common/log.service');
const { sendError } = require('../../utils/response');

const normalizeError = (error) => {
  if (error instanceof ApiError) return error;
  if (error instanceof TokenExpiredError) return new ApiError(401, 'Authentication token has expired.', undefined, 'JWT_EXPIRED');
  if (error instanceof JsonWebTokenError) return new ApiError(401, 'Authentication token is invalid.', undefined, 'JWT_INVALID');
  if (error.code === 'ER_DUP_ENTRY') return new ApiError(409, 'A record with the same unique value already exists.', undefined, 'DUPLICATE_RECORD');
  if (error.code === 'ER_NO_REFERENCED_ROW_2') return new ApiError(422, 'A related record does not exist.', undefined, 'DATABASE_RELATION_ERROR');
  if (String(error.code || '').startsWith('ER_')) return new ApiError(500, 'A database operation failed.', undefined, 'DATABASE_ERROR');
  if (error.type === 'entity.parse.failed') return new ApiError(400, 'Request body contains invalid JSON.', undefined, 'INVALID_JSON');
  return new ApiError(500, 'An unexpected error occurred.', undefined, 'INTERNAL_SERVER_ERROR');
};

const errorHandler = (error, req, res, next) => {
  if (res.headersSent) return next(error);
  const normalized = normalizeError(error);
  logger.error('Request failed', {
    requestId: req.id,
    method: req.method,
    path: req.originalUrl,
    error,
  });
  return sendError(req, res, {
    statusCode: normalized.statusCode,
    message: normalized.message,
    code: normalized.code,
    details: normalized.details,
  });
};

module.exports = { errorHandler, normalizeError };
