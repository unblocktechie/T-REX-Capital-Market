const { BaseRepository } = require('./base.repository');
const { execute } = require('../database/connection');

const publicColumns = [
  'userUid', 'roleUid', 'fullName', 'email', 'emailVerified', 'emailVerifiedAt',
  'privyUserId', 'privyWalletId', 'privyWalletAddress', 'privyLinkedAt',
  'isActive', 'lastLoginAt', 'createdAt', 'updatedAt',
];

class UserRepository extends BaseRepository {
  constructor() {
    super({
      table: 'userMaster',
      uidColumn: 'userUid',
      selectColumns: publicColumns,
      searchColumns: ['fullName', 'email'],
      sortableColumns: ['fullName', 'email', 'emailVerified', 'isActive', 'createdAt', 'updatedAt'],
      filterableColumns: ['roleUid', 'emailVerified', 'isActive'],
    });
  }

  async findByEmail(email, { includePassword = false, executor } = {}) {
    const columns = includePassword ? [...publicColumns, 'passwordHash'] : publicColumns;
    const rows = await execute(
      `SELECT ${columns.map((column) => `\`${column}\``).join(', ')} FROM \`userMaster\` WHERE \`email\` = ? AND \`isDeleted\` = 0 LIMIT 1`,
      [email],
      executor,
    );
    return rows[0] || null;
  }

  async findAuthIdentityByEmail(email, executor) {
    const rows = await execute(
      `SELECT u.*, r.\`roleName\`, r.\`isActive\` AS \`roleActive\` FROM \`userMaster\` u
       INNER JOIN \`userRole\` r ON r.\`roleUid\` = u.\`roleUid\` AND r.\`isDeleted\` = 0
       WHERE u.\`email\` = ? AND u.\`isDeleted\` = 0 LIMIT 1`,
      [email],
      executor,
    );
    return rows[0] || null;
  }

  async findAuthIdentityByUid(userUid, executor) {
    const rows = await execute(
      `SELECT u.\`userUid\`, u.\`roleUid\`, u.\`fullName\`, u.\`email\`, u.\`emailVerified\`, u.\`isActive\`,
              u.\`privyUserId\`, u.\`privyWalletId\`, u.\`privyWalletAddress\`, u.\`privyLinkedAt\`,
              r.\`roleName\`, r.\`isActive\` AS \`roleActive\`
       FROM \`userMaster\` u INNER JOIN \`userRole\` r ON r.\`roleUid\` = u.\`roleUid\` AND r.\`isDeleted\` = 0
       WHERE u.\`userUid\` = ? AND u.\`isDeleted\` = 0 LIMIT 1`,
      [userUid],
      executor,
    );
    return rows[0] || null;
  }


  async findByPrivyUserId(privyUserId, executor) {
    if (!privyUserId) return null;
    const rows = await execute(
      'SELECT `userUid`, `email`, `privyUserId`, `privyWalletAddress` FROM `userMaster` WHERE `privyUserId` = ? AND `isDeleted` = 0 LIMIT 1',
      [privyUserId],
      executor,
    );
    return rows[0] || null;
  }

  async findByPrivyWalletAddress(privyWalletAddress, executor) {
    if (!privyWalletAddress) return null;
    const rows = await execute(
      'SELECT `userUid`, `email`, `privyUserId`, `privyWalletAddress` FROM `userMaster` WHERE `privyWalletAddress` = ? AND `isDeleted` = 0 LIMIT 1',
      [String(privyWalletAddress).toLowerCase()],
      executor,
    );
    return rows[0] || null;
  }

  async bindPrivyIdentity(userUid, { privyUserId, privyWalletId, privyWalletAddress }, executor) {
    await execute(
      `UPDATE \`userMaster\`
       SET \`privyUserId\` = ?, \`privyWalletId\` = ?, \`privyWalletAddress\` = ?,
           \`privyLinkedAt\` = COALESCE(\`privyLinkedAt\`, UTC_TIMESTAMP(3)),
           \`emailVerified\` = 1, \`emailVerifiedAt\` = COALESCE(\`emailVerifiedAt\`, UTC_TIMESTAMP(3)),
           \`updatedAt\` = UTC_TIMESTAMP(3)
       WHERE \`userUid\` = ? AND \`isDeleted\` = 0`,
      [privyUserId, privyWalletId || null, String(privyWalletAddress).toLowerCase(), userUid],
      executor,
    );
    return this.findAuthIdentityByUid(userUid, executor);
  }

  async markEmailVerified(userUid, executor) {
    await execute(
      'UPDATE `userMaster` SET `emailVerified` = 1, `emailVerifiedAt` = UTC_TIMESTAMP(3), `updatedAt` = UTC_TIMESTAMP(3) WHERE `userUid` = ?',
      [userUid],
      executor,
    );
    return this.findByUid(userUid, executor);
  }

  async updatePassword(userUid, passwordHash, executor) {
    await execute(
      'UPDATE `userMaster` SET `passwordHash` = ?, `updatedAt` = UTC_TIMESTAMP(3) WHERE `userUid` = ? AND `isDeleted` = 0',
      [passwordHash, userUid],
      executor,
    );
  }

  async updateLastLogin(userUid, executor) {
    await execute('UPDATE `userMaster` SET `lastLoginAt` = UTC_TIMESTAMP(3) WHERE `userUid` = ?', [userUid], executor);
  }

  async countByRole(roleUid, executor) {
    const rows = await execute('SELECT COUNT(*) AS `total` FROM `userMaster` WHERE `roleUid` = ? AND `isDeleted` = 0', [roleUid], executor);
    return Number(rows[0].total);
  }
}

module.exports = { UserRepository, publicColumns };
