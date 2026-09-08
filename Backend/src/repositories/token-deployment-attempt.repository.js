const { execute } = require('../database/connection');
const { createUid } = require('../utils/token');
const { identifier } = require('./base.repository');
const { ACTIVE_DEPLOYMENT_ATTEMPT_STATUSES, DEPLOYMENT_ATTEMPT_STATUS } = require('../config/constants');

// Columns the application is allowed to write. Kept explicit so the frontend can
// never smuggle a field such as `status = confirmed` through mass assignment.
const insertableFields = [
  'tokenUid', 'organizationUid', 'userUid', 'walletAddress', 'chainId', 'networkName',
  'status', 'idempotencyKey', 'transactionHash', 'contractAddress', 'blockNumber',
  'errorCode', 'errorMessage', 'metadata', 'expiresAt', 'submittedAt', 'confirmedAt', 'failedAt',
];

const updatableFields = [
  'status', 'transactionHash', 'contractAddress', 'blockNumber', 'errorCode', 'errorMessage',
  'metadata', 'expiresAt', 'submittedAt', 'confirmedAt', 'failedAt', 'isActive', 'isDeleted', 'networkName',
];

const serializeMetadata = (value) => {
  if (value === undefined || value === null) return value;
  return typeof value === 'string' ? value : JSON.stringify(value);
};

const activePlaceholders = ACTIVE_DEPLOYMENT_ATTEMPT_STATUSES.map(() => '?').join(', ');

class TokenDeploymentAttemptRepository {
  async create(data, executor) {
    const deploymentAttemptUid = data.deploymentAttemptUid || createUid();
    const record = { deploymentAttemptUid, ...data, metadata: serializeMetadata(data.metadata) };
    const entries = Object.entries(record)
      .filter(([field, value]) => (field === 'deploymentAttemptUid' || insertableFields.includes(field)) && value !== undefined);
    const columns = entries.map(([field]) => identifier(field)).join(', ');
    const placeholders = entries.map(() => '?').join(', ');
    await execute(
      `INSERT INTO \`tokenDeploymentAttempt\` (${columns}) VALUES (${placeholders})`,
      entries.map(([, value]) => value),
      executor,
    );
    return this.findByUid(deploymentAttemptUid, executor);
  }

  async update(deploymentAttemptUid, data, executor) {
    const payload = { ...data };
    if ('metadata' in payload) payload.metadata = serializeMetadata(payload.metadata);
    const entries = Object.entries(payload).filter(([field, value]) => updatableFields.includes(field) && value !== undefined);
    if (!entries.length) return this.findByUid(deploymentAttemptUid, executor);
    await execute(
      `UPDATE \`tokenDeploymentAttempt\`
       SET ${entries.map(([field]) => `${identifier(field)} = ?`).join(', ')}, \`updatedAt\` = UTC_TIMESTAMP(3)
       WHERE \`deploymentAttemptUid\` = ? AND \`isDeleted\` = 0`,
      [...entries.map(([, value]) => value), deploymentAttemptUid],
      executor,
    );
    return this.findByUid(deploymentAttemptUid, executor);
  }

  async findByUid(deploymentAttemptUid, executor) {
    const rows = await execute(
      'SELECT * FROM `tokenDeploymentAttempt` WHERE `deploymentAttemptUid` = ? AND `isDeleted` = 0 LIMIT 1',
      [deploymentAttemptUid],
      executor,
    );
    return rows[0] || null;
  }

  async findActiveByToken(tokenUid, executor) {
    const rows = await execute(
      `SELECT * FROM \`tokenDeploymentAttempt\`
       WHERE \`tokenUid\` = ? AND \`isDeleted\` = 0 AND \`status\` IN (${activePlaceholders})
       ORDER BY \`createdAt\` DESC LIMIT 1`,
      [tokenUid, ...ACTIVE_DEPLOYMENT_ATTEMPT_STATUSES],
      executor,
    );
    return rows[0] || null;
  }

  async findByIdempotencyKey(tokenUid, idempotencyKey, executor) {
    const rows = await execute(
      `SELECT * FROM \`tokenDeploymentAttempt\`
       WHERE \`tokenUid\` = ? AND \`idempotencyKey\` = ? AND \`isDeleted\` = 0
       ORDER BY \`createdAt\` DESC LIMIT 1`,
      [tokenUid, idempotencyKey],
      executor,
    );
    return rows[0] || null;
  }

  async findByTransactionHash(transactionHash, executor) {
    const rows = await execute(
      'SELECT * FROM `tokenDeploymentAttempt` WHERE `transactionHash` = ? AND `isDeleted` = 0 LIMIT 1',
      [transactionHash],
      executor,
    );
    return rows[0] || null;
  }

  async findByTokenAndHash(tokenUid, transactionHash, executor) {
    const rows = await execute(
      `SELECT * FROM \`tokenDeploymentAttempt\`
       WHERE \`tokenUid\` = ? AND \`transactionHash\` = ? AND \`isDeleted\` = 0
       ORDER BY \`createdAt\` DESC LIMIT 1`,
      [tokenUid, transactionHash],
      executor,
    );
    return rows[0] || null;
  }

  async findLatestByToken(tokenUid, executor) {
    const rows = await execute(
      `SELECT * FROM \`tokenDeploymentAttempt\`
       WHERE \`tokenUid\` = ? AND \`isDeleted\` = 0
       ORDER BY \`createdAt\` DESC LIMIT 1`,
      [tokenUid],
      executor,
    );
    return rows[0] || null;
  }

  // Marks pending attempts whose expiry has passed. Never touches submitted/confirming
  // attempts, because a broadcast transaction may still confirm on-chain.
  async expireStalePending(tokenUid, executor) {
    const result = await execute(
      `UPDATE \`tokenDeploymentAttempt\`
       SET \`status\` = '${DEPLOYMENT_ATTEMPT_STATUS.EXPIRED}', \`updatedAt\` = UTC_TIMESTAMP(3)
       WHERE \`tokenUid\` = ? AND \`isDeleted\` = 0
         AND \`status\` = '${DEPLOYMENT_ATTEMPT_STATUS.PENDING}'
         AND \`expiresAt\` IS NOT NULL AND \`expiresAt\` < UTC_TIMESTAMP(3)`,
      [tokenUid],
      executor,
    );
    return result.affectedRows || 0;
  }
}

module.exports = { TokenDeploymentAttemptRepository, insertableFields, updatableFields };
