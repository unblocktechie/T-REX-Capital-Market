const { BaseRepository } = require('./base.repository');
const { execute } = require('../database/connection');

class RoleRepository extends BaseRepository {
  constructor() {
    super({
      table: 'userRole', uidColumn: 'roleUid',
      searchColumns: ['roleName', 'description'],
      sortableColumns: ['roleName', 'isActive', 'createdAt', 'updatedAt'],
      filterableColumns: ['isSystem', 'isActive'],
    });
  }

  async findByName(roleName, executor) {
    const rows = await execute('SELECT * FROM `userRole` WHERE LOWER(`roleName`) = LOWER(?) AND `isDeleted` = 0 LIMIT 1', [roleName], executor);
    return rows[0] || null;
  }
}

module.exports = { RoleRepository };
