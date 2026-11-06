const { execute } = require('../database/connection');
const { createUid } = require('../utils/token');

class IssuerApiKeyRepository {
  async lockOwner(userUid, executor) {
    const rows = await execute(
      'SELECT `userUid` FROM `userMaster` WHERE `userUid`=? AND `isDeleted`=0 LIMIT 1 FOR UPDATE',
      [userUid], executor,
    );
    return rows[0] || null;
  }

  async findByPublicId(publicId, executor) {
    const rows = await execute(
      `SELECT * FROM \`issuerApiKey\`
       WHERE \`publicId\` = ? AND \`isDeleted\` = 0 LIMIT 1`,
      [publicId], executor,
    );
    return rows[0] || null;
  }

  async findOwnedByUid(issuerApiKeyUid, userUid, executor) {
    const rows = await execute(
      `SELECT * FROM \`issuerApiKey\`
       WHERE \`issuerApiKeyUid\` = ? AND \`userUid\` = ? AND \`isDeleted\` = 0 LIMIT 1`,
      [issuerApiKeyUid, userUid], executor,
    );
    return rows[0] || null;
  }

  async listOwned(userUid, executor) {
    return execute(
      `SELECT \`issuerApiKeyUid\`,\`keyName\`,\`keyPrefix\`,\`keyLastFour\`,\`scopes\`,
              \`expiresAt\`,\`lastUsedAt\`,\`lastUsedIp\`,\`revokedAt\`,\`isActive\`,
              \`createdAt\`,\`updatedAt\`
       FROM \`issuerApiKey\`
       WHERE \`userUid\` = ? AND \`isDeleted\` = 0
       ORDER BY \`createdAt\` DESC`,
      [userUid], executor,
    );
  }

  async countActive(userUid, executor) {
    const rows = await execute(
      `SELECT COUNT(*) AS \`total\` FROM \`issuerApiKey\`
       WHERE \`userUid\` = ? AND \`isDeleted\` = 0 AND \`isActive\` = TRUE
         AND \`revokedAt\` IS NULL AND \`expiresAt\` > UTC_TIMESTAMP(3)`,
      [userUid], executor,
    );
    return Number(rows[0]?.total || 0);
  }

  async create(data, executor) {
    const issuerApiKeyUid = data.issuerApiKeyUid || createUid();
    await execute(
      `INSERT INTO \`issuerApiKey\`
        (\`issuerApiKeyUid\`,\`publicId\`,\`userUid\`,\`organizationUid\`,\`keyName\`,
         \`keyHash\`,\`keyPrefix\`,\`keyLastFour\`,\`scopes\`,\`expiresAt\`)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        issuerApiKeyUid, data.publicId, data.userUid, data.organizationUid, data.keyName,
        data.keyHash, data.keyPrefix, data.keyLastFour, JSON.stringify(data.scopes), data.expiresAt,
      ], executor,
    );
    return this.findOwnedByUid(issuerApiKeyUid, data.userUid, executor);
  }

  async markUsed(issuerApiKeyUid, ipAddress, executor) {
    await execute(
      `UPDATE \`issuerApiKey\`
       SET \`lastUsedAt\`=UTC_TIMESTAMP(3),\`lastUsedIp\`=?,\`updatedAt\`=UTC_TIMESTAMP(3)
       WHERE \`issuerApiKeyUid\`=? AND \`isDeleted\`=0`,
      [ipAddress || null, issuerApiKeyUid], executor,
    );
  }

  async revoke(issuerApiKeyUid, userUid, executor) {
    const result = await execute(
      `UPDATE \`issuerApiKey\`
       SET \`isActive\`=FALSE,\`revokedAt\`=COALESCE(\`revokedAt\`,UTC_TIMESTAMP(3)),\`updatedAt\`=UTC_TIMESTAMP(3)
       WHERE \`issuerApiKeyUid\`=? AND \`userUid\`=? AND \`isDeleted\`=0`,
      [issuerApiKeyUid, userUid], executor,
    );
    return result.affectedRows > 0;
  }

  async createAudit(data, executor) {
    await execute(
      `INSERT INTO \`issuerApiKeyAudit\`
        (\`issuerApiKeyAuditUid\`,\`issuerApiKeyUid\`,\`userUid\`,\`action\`,\`httpMethod\`,
         \`apiPath\`,\`ipAddress\`,\`userAgent\`,\`requestId\`,\`details\`)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        createUid(), data.issuerApiKeyUid, data.userUid, data.action,
        data.httpMethod || null, data.apiPath || null, data.ipAddress || null,
        data.userAgent ? String(data.userAgent).slice(0, 500) : null,
        data.requestId || null, data.details ? JSON.stringify(data.details) : null,
      ], executor,
    );
  }
}

module.exports = { IssuerApiKeyRepository };
