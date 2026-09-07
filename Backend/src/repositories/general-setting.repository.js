const { BaseRepository } = require('./base.repository');
const { execute } = require('../database/connection');

class GeneralSettingRepository extends BaseRepository {
  constructor() {
    super({
      table: 'generalSettings', uidColumn: 'settingUid',
      searchColumns: ['settingKey', 'settingValue', 'settingGroup', 'description'],
      sortableColumns: ['settingKey', 'settingGroup', 'valueType', 'isPublic', 'isActive', 'createdAt', 'updatedAt'],
      filterableColumns: ['settingGroup', 'valueType', 'isPublic', 'isActive'],
    });
  }

  async listPublic(executor) {
    return execute(
      `SELECT \`settingUid\`, \`settingKey\`, \`settingValue\`, \`valueType\`, \`settingGroup\`, \`description\`, \`updatedAt\`
       FROM \`generalSettings\` WHERE \`isPublic\` = 1 AND \`isActive\` = 1 AND \`isDeleted\` = 0 ORDER BY \`settingGroup\`, \`settingKey\``,
      [],
      executor,
    );
  }
}

module.exports = { GeneralSettingRepository };
