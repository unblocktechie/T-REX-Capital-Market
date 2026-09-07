const { execute } = require('../database/connection');

class OrganizationOptionRepository {
  async listAll() {
    const [entityTypes, industries, documentTypes] = await Promise.all([
      execute('SELECT `entityTypeUid`, `entityTypeCode`, `entityTypeName` FROM `entityTypeMaster` WHERE `isActive` = 1 AND `isDeleted` = 0 ORDER BY `displayOrder`, `entityTypeName`'),
      execute('SELECT `industryUid`, `industryCode`, `industryName` FROM `industryMaster` WHERE `isActive` = 1 AND `isDeleted` = 0 ORDER BY `displayOrder`, `industryName`'),
      execute('SELECT `documentTypeUid`, `documentTypeCode`, `documentTypeName`, `description`, `isRequired` FROM `documentTypeMaster` WHERE `isActive` = 1 AND `isDeleted` = 0 ORDER BY `displayOrder`, `documentTypeName`'),
    ]);
    return { entityTypes, industries, documentTypes };
  }

  async findEntityType(uid, executor) {
    const rows = await execute('SELECT * FROM `entityTypeMaster` WHERE `entityTypeUid` = ? AND `isActive` = 1 AND `isDeleted` = 0 LIMIT 1', [uid], executor);
    return rows[0] || null;
  }

  async findIndustry(uid, executor) {
    const rows = await execute('SELECT * FROM `industryMaster` WHERE `industryUid` = ? AND `isActive` = 1 AND `isDeleted` = 0 LIMIT 1', [uid], executor);
    return rows[0] || null;
  }

  async findDocumentType(uid, executor) {
    const rows = await execute('SELECT * FROM `documentTypeMaster` WHERE `documentTypeUid` = ? AND `isActive` = 1 AND `isDeleted` = 0 LIMIT 1', [uid], executor);
    return rows[0] || null;
  }

  async listRequiredDocumentTypes(executor) {
    return execute('SELECT `documentTypeUid`, `documentTypeCode`, `documentTypeName` FROM `documentTypeMaster` WHERE `isRequired` = 1 AND `isActive` = 1 AND `isDeleted` = 0 ORDER BY `displayOrder`', [], executor);
  }
}

module.exports = { OrganizationOptionRepository };
