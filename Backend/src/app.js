const path = require('node:path');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const { env } = require('./core/config/env');
const { requestContext } = require('./middleware/request-context.middleware');
const { requestLogger } = require('./middleware/request-logger.middleware');
const { corsMiddleware } = require('./middleware/cors.middleware');
const { apiRateLimiter } = require('./middleware/rate-limit.middleware');
const { notFoundHandler } = require('./middleware/not-found.middleware');
const { errorHandler } = require('./core/errors/error-handler');
const { createApiRouter } = require('./api');

const createApp = () => {
  const app = express();
  app.disable('x-powered-by');
  if (env.trustProxy) app.set('trust proxy', 1);

  app.use(requestContext);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(corsMiddleware);
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));
  app.use(requestLogger);
  app.use('/api', apiRateLimiter, createApiRouter());

  const openApiPath = path.resolve(process.cwd(), 'docs', 'openapi.yaml');
  const openApiDocument = YAML.load(openApiPath);
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openApiDocument, { explorer: true }));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
};

module.exports = { createApp };
