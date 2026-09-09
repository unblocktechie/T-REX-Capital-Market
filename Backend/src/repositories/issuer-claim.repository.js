const { execute } = require('../database/connection');
const { createUid } = require('../utils/token');
const { identifier } = require('./base.repository');

const verificationFields = [
  'interestUid', 'tokenUid', 'organizationUid', 'investorUid', 'status',
  'requiredClaimCount', 'verifiedClaimCount', 'requiredClaimTopics', 'attemptNumber', 'completedAt',
];
const verificationUpdatableFields = ['status', 'verifiedClaimCount', 'completedAt'];

class IssuerClaimRepository {
  // ------------------------------------------------------------- verification

  async getMaxAttempt(interestUid, executor) {
    const rows = await execute(
      'SELECT COALESCE(MAX(`attemptNumber`), 0) AS `maxNo` FROM `issuerClaimVerification` WHERE `interestUid` = ? AND `isDeleted` = 0',
      [interestUid],
      executor,
    );
    return Number(rows[0].maxNo);
  }

  async createVerification(data, executor) {
    const verificationUid = createUid();
    const entries = Object.entries(data).filter(([field, value]) => verificationFields.includes(field) && value !== undefined);
    const columns = ['`verificationUid`', ...entries.map(([field]) => identifier(field))];
    await execute(
      `INSERT INTO \`issuerClaimVerification\` (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
      [verificationUid, ...entries.map(([, value]) => value)],
      executor,
    );
    return this.findVerificationByUid(verificationUid, executor);
  }

  async findVerificationByUid(verificationUid, executor) {
    const rows = await execute(
      'SELECT * FROM `issuerClaimVerification` WHERE `verificationUid` = ? AND `isDeleted` = 0 LIMIT 1',
      [verificationUid],
      executor,
    );
    return rows[0] || null;
  }

  async findLatestVerification(interestUid, executor) {
    const rows = await execute(
      'SELECT * FROM `issuerClaimVerification` WHERE `interestUid` = ? AND `isDeleted` = 0 ORDER BY `attemptNumber` DESC LIMIT 1',
      [interestUid],
      executor,
    );
    return rows[0] || null;
  }

  async findLatestVerificationByStatus(interestUid, status, executor) {
    const rows = await execute(
      'SELECT * FROM `issuerClaimVerification` WHERE `interestUid` = ? AND `status` = ? AND `isDeleted` = 0 ORDER BY `attemptNumber` DESC LIMIT 1',
      [interestUid, status],
      executor,
    );
    return rows[0] || null;
  }

  async updateVerification(verificationUid, data, executor) {
    const entries = Object.entries(data).filter(([field, value]) => verificationUpdatableFields.includes(field) && value !== undefined);
    if (!entries.length) return this.findVerificationByUid(verificationUid, executor);
    await execute(
      `UPDATE \`issuerClaimVerification\`
       SET ${entries.map(([field]) => `${identifier(field)} = ?`).join(', ')}, \`updatedAt\` = UTC_TIMESTAMP(3)
       WHERE \`verificationUid\` = ? AND \`isDeleted\` = 0`,
      [...entries.map(([, value]) => value), verificationUid],
      executor,
    );
    return this.findVerificationByUid(verificationUid, executor);
  }

  // --------------------------------------------------------------- signatures

  // Idempotent per (verificationUid, claimTopic): a repeated submit updates the row in place
  // rather than creating a duplicate signature record.
  async upsertSignature(data, executor) {
    await execute(
      `INSERT INTO \`issuerClaimSignature\`
        (\`signatureUid\`, \`verificationUid\`, \`interestUid\`, \`claimTopic\`, \`data\`, \`signature\`,
         \`signedByWallet\`, \`status\`, \`verificationError\`, \`verifiedAt\`)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         \`data\` = VALUES(\`data\`),
         \`signature\` = VALUES(\`signature\`),
         \`signedByWallet\` = VALUES(\`signedByWallet\`),
         \`status\` = VALUES(\`status\`),
         \`verificationError\` = VALUES(\`verificationError\`),
         \`verifiedAt\` = VALUES(\`verifiedAt\`),
         \`updatedAt\` = UTC_TIMESTAMP(3)`,
      [createUid(), data.verificationUid, data.interestUid, data.claimTopic, data.data, data.signature,
        data.signedByWallet || null, data.status, data.verificationError || null, data.verifiedAt || null],
      executor,
    );
  }

  async listSignatures(verificationUid, executor) {
    return execute(
      `SELECT \`signatureUid\`, \`verificationUid\`, \`claimTopic\`, \`data\`, \`signature\`, \`signedByWallet\`,
              \`status\`, \`verificationError\`, \`verifiedAt\`, \`createdAt\`, \`updatedAt\`
       FROM \`issuerClaimSignature\`
       WHERE \`verificationUid\` = ? AND \`isDeleted\` = 0
       ORDER BY \`claimTopic\` ASC`,
      [verificationUid],
      executor,
    );
  }
}

module.exports = { IssuerClaimRepository, verificationFields };
