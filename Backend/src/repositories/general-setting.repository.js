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

  async findByKey(settingKey, executor) {
    const rows = await execute(
      `SELECT \`settingUid\`, \`settingKey\`, \`settingValue\`, \`valueType\`, \`settingGroup\`, \`isActive\`, \`isDeleted\`
       FROM \`generalSettings\` WHERE \`settingKey\` = ? AND \`isDeleted\` = 0 LIMIT 1`,
      [settingKey],
      executor,
    );
    return rows[0] || null;
  }

  // Updates the value of an existing setting by key. Returns true when a row was updated.
  async setValueByKey(settingKey, settingValue, executor) {
    const result = await execute(
      `UPDATE \`generalSettings\` SET \`settingValue\` = ?, \`updatedAt\` = UTC_TIMESTAMP(3)
       WHERE \`settingKey\` = ? AND \`isDeleted\` = 0`,
      [String(settingValue), settingKey],
      executor,
    );
    return result.affectedRows > 0;
  }
}

module.exports = { GeneralSettingRepository };
