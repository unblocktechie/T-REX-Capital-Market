class ApiError extends Error {
  constructor(statusCode, message, details, code = 'API_ERROR') {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.details = details;
    this.code = code;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message, details) { return new ApiError(400, message, details, 'BAD_REQUEST'); }
  static unauthorized(message = 'Authentication is required.') { return new ApiError(401, message, undefined, 'UNAUTHORIZED'); }
  static forbidden(message = 'You do not have permission to perform this action.') { return new ApiError(403, message, undefined, 'FORBIDDEN'); }
  static notFound(message = 'Resource not found.') { return new ApiError(404, message, undefined, 'NOT_FOUND'); }
  static conflict(message) { return new ApiError(409, message, undefined, 'CONFLICT'); }
}

module.exports = { ApiError };
