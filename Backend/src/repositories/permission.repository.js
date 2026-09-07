const { BaseRepository } = require('./base.repository');
const { execute } = require('../database/connection');

class PermissionRepository extends BaseRepository {
  constructor() {
    super({
      table: 'permissionMaster', uidColumn: 'permissionUid',
      searchColumns: ['permissionName', 'permissionCode', 'apiPath'],
      sortableColumns: ['permissionName', 'permissionCode', 'httpMethod', 'apiPath', 'isAllowed', 'createdAt', 'updatedAt'],
      filterableColumns: ['roleUid', 'menuUid', 'httpMethod', 'isAllowed', 'isActive'],
    });
  }

  async isAllowed(roleUid, httpMethod, apiPath, executor) {
    const rows = await execute(
      `SELECT \`permissionUid\` FROM \`permissionMaster\`
       WHERE \`roleUid\` = ? AND \`httpMethod\` = ? AND \`apiPath\` = ?
         AND \`isAllowed\` = 1 AND \`isActive\` = 1 AND \`isDeleted\` = 0 LIMIT 1`,
      [roleUid, httpMethod, apiPath],
      executor,
    );
    return rows.length > 0;
  }

  async countByRole(roleUid, executor) {
    const rows = await execute('SELECT COUNT(*) AS `total` FROM `permissionMaster` WHERE `roleUid` = ? AND `isDeleted` = 0', [roleUid], executor);
    return Number(rows[0].total);
  }

  async countByMenu(menuUid, executor) {
    const rows = await execute('SELECT COUNT(*) AS `total` FROM `permissionMaster` WHERE `menuUid` = ? AND `isDeleted` = 0', [menuUid], executor);
    return Number(rows[0].total);
  }
}

module.exports = { PermissionRepository };
