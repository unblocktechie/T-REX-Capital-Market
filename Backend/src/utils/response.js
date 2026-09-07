const buildEnvelope = (req, success, message, additions = {}) => ({
  success,
  message,
  ...additions,
  timestamp: new Date().toISOString(),
  requestId: req.id,
});

const sendSuccess = (req, res, { statusCode = 200, message = 'Request completed successfully.', data = null, meta } = {}) => (
  res.status(statusCode).json(buildEnvelope(req, true, message, {
    data,
    ...(meta ? { meta } : {}),
  }))
);

const sendError = (req, res, { statusCode = 500, message = 'Internal server error.', code = 'INTERNAL_SERVER_ERROR', details } = {}) => (
  res.status(statusCode).json(buildEnvelope(req, false, message, {
    error: {
      code,
      ...(details ? { details } : {}),
    },
  }))
);

module.exports = { buildEnvelope, sendSuccess, sendError };
