const { BaseRepository } = require('./base.repository');
const { execute } = require('../database/connection');

class MenuRepository extends BaseRepository {
  constructor() {
    super({
      table: 'menuMaster', uidColumn: 'menuUid',
      searchColumns: ['menuName', 'menuCode', 'routePath'],
      sortableColumns: ['menuName', 'menuCode', 'displayOrder', 'isVisible', 'isActive', 'createdAt', 'updatedAt'],
      filterableColumns: ['parentMenuUid', 'isVisible', 'isActive'],
    });
  }

  async countChildren(menuUid, executor) {
    const rows = await execute('SELECT COUNT(*) AS `total` FROM `menuMaster` WHERE `parentMenuUid` = ? AND `isDeleted` = 0', [menuUid], executor);
    return Number(rows[0].total);
  }
}

module.exports = { MenuRepository };
