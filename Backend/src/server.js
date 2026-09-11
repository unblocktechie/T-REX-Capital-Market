const http = require('node:http');
const { createApp } = require('./app');
const { env, validateEnvironment } = require('./core/config/env');
const { pingDatabase, closePool } = require('./database/connection');
const { logger, cleanupOldLogs } = require('./services/common/log.service');
const { jobs } = require('./dependencies');

const start = async () => {
  validateEnvironment();
  cleanupOldLogs();
  await pingDatabase();
  const server = http.createServer(createApp());
  server.listen(env.port, () => logger.info(`${env.appName} started`, {
    environment: env.nodeEnv, port: env.port, version: env.appVersion,
  }));

  // Background fallback reconciler for missed TREX deployments (read-only).
  jobs.trexDeploymentSyncRunner.start();
  // Background fallback recovery for investor claim submissions missing tx metadata (read-only).
  jobs.claimRecoveryRunner.start();
  // Global, checkpointed ClaimAdded/ClaimChanged indexer across DB-known investor ONCHAINIDs.
  jobs.claimIndexerRunner.start();
  // IdentityRegistered global indexer + targeted recovery for PENDING registry operations.
  jobs.identityRegistryReconciliationRunner.start();
  // Read-only canonical indexer for frontend-executed buy, transfer and redeem transactions.
  jobs.blockchainTransactionIndexerRunner.start();

  const shutdown = (signal) => {
    logger.info('Graceful shutdown started', { signal });
    jobs.trexDeploymentSyncRunner.stop();
    jobs.claimRecoveryRunner.stop();
    jobs.claimIndexerRunner.stop();
    jobs.identityRegistryReconciliationRunner.stop();
    jobs.blockchainTransactionIndexerRunner.stop();
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
