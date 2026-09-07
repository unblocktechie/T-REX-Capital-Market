const { BaseRepository } = require('./base.repository');
const { execute } = require('../database/connection');

class AuthTokenRepository extends BaseRepository {
  constructor() {
    super({ table: 'authToken', uidColumn: 'tokenUid' });
  }

  async findValid(tokenHash, tokenType, executor) {
    const rows = await execute(
      `SELECT * FROM \`authToken\` WHERE \`tokenHash\` = ? AND \`tokenType\` = ?
       AND \`usedAt\` IS NULL AND \`revokedAt\` IS NULL AND \`expiresAt\` > UTC_TIMESTAMP(3) AND \`isDeleted\` = 0 LIMIT 1`,
      [tokenHash, tokenType],
      executor,
    );
    return rows[0] || null;
  }

  async revokeActive(userUid, tokenType, executor) {
    await execute(
      `UPDATE \`authToken\` SET \`revokedAt\` = UTC_TIMESTAMP(3), \`updatedAt\` = UTC_TIMESTAMP(3)
       WHERE \`userUid\` = ? AND \`tokenType\` = ? AND \`usedAt\` IS NULL AND \`revokedAt\` IS NULL`,
      [userUid, tokenType],
      executor,
    );
  }

  async markUsed(tokenUid, executor) {
    await execute(
      'UPDATE `authToken` SET `usedAt` = UTC_TIMESTAMP(3), `updatedAt` = UTC_TIMESTAMP(3) WHERE `tokenUid` = ? AND `usedAt` IS NULL',
      [tokenUid],
      executor,
    );
  }
}

module.exports = { AuthTokenRepository };
