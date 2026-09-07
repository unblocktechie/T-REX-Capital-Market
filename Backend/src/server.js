const http = require('node:http');
const { createApp } = require('./app');
const { env, validateEnvironment } = require('./core/config/env');
const { pingDatabase, closePool } = require('./database/connection');
const { logger, cleanupOldLogs } = require('./services/common/log.service');

const start = async () => {
  validateEnvironment();
  cleanupOldLogs();
  await pingDatabase();
  const server = http.createServer(createApp());
  server.listen(env.port, () => logger.info(`${env.appName} started`, {
    environment: env.nodeEnv, port: env.port, version: env.appVersion,
  }));

  const shutdown = (signal) => {
    logger.info('Graceful shutdown started', { signal });
    server.close(async () => {
      await closePool();
      logger.info('Graceful shutdown completed');
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
};

start().catch((error) => {
  logger.error('Application startup failed', error);
  process.exit(1);
});

process.on('unhandledRejection', (error) => logger.error('Unhandled promise rejection', error));
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', error);
  process.exit(1);
});
