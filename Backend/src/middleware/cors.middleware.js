const cors = require('cors');
const { env } = require('../core/config/env');
const { ApiError } = require('../core/errors/api-error');

const corsMiddleware = cors({
  origin(origin, callback) {
    if (!origin || env.cors.allowedOrigins.includes(origin)) return callback(null, true);
    return callback(ApiError.forbidden('This origin is not allowed by the CORS policy.'));
  },
  credentials: env.cors.credentials,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
  exposedHeaders: ['X-Request-Id'],
  maxAge: 86400,
});

module.exports = { corsMiddleware };
