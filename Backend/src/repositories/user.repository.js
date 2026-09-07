const { BaseRepository } = require('./base.repository');
const { execute } = require('../database/connection');

const publicColumns = [
  'userUid', 'roleUid', 'fullName', 'email', 'emailVerified', 'emailVerifiedAt',
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
              r.\`roleName\`, r.\`isActive\` AS \`roleActive\`
       FROM \`userMaster\` u INNER JOIN \`userRole\` r ON r.\`roleUid\` = u.\`roleUid\` AND r.\`isDeleted\` = 0
       WHERE u.\`userUid\` = ? AND u.\`isDeleted\` = 0 LIMIT 1`,
      [userUid],
      executor,
    );
    return rows[0] || null;
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
