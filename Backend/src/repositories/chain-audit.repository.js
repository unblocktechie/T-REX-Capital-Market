const { execute } = require('../database/connection');
const { createUid } = require('../utils/token');
const { sqlInteger } = require('../utils/sql');

class ChainAuditRepository {
  async record(data, executor) {
    const auditUid = createUid();
    await execute(
      `INSERT INTO \`chainMasterAudit\`
       (\`chainAuditUid\`,\`chainUid\`,\`changedByUserUid\`,\`operation\`,\`changedFields\`,\`beforeData\`,\`afterData\`)
       VALUES (?,?,?,?,?,?,?)`,
      [auditUid, data.chainUid, data.changedByUserUid, data.operation,
        JSON.stringify(data.changedFields || []),
        data.beforeData === null ? null : JSON.stringify(data.beforeData),
        data.afterData === null ? null : JSON.stringify(data.afterData)],
      executor,
    );
    return auditUid;
  }

  async list(chainUid, options = {}, executor) {
    const page = Math.max(1, Number(options.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(options.limit) || 20));
    const offset = (page - 1) * limit;
    const [rows, count] = await Promise.all([
      execute(
        `SELECT a.*,u.\`fullName\` AS \`changedByName\`,u.\`email\` AS \`changedByEmail\`
         FROM \`chainMasterAudit\` a
         LEFT JOIN \`userMaster\` u ON u.\`userUid\`=a.\`changedByUserUid\`
         WHERE a.\`chainUid\`=? ORDER BY a.\`createdAt\` DESC
         LIMIT ${sqlInteger(limit, { min: 1, max: 100, name: 'limit' })}
         OFFSET ${sqlInteger(offset, { min: 0, name: 'offset' })}`,
        [chainUid], executor,
      ),
      execute('SELECT COUNT(*) AS `total` FROM `chainMasterAudit` WHERE `chainUid`=?', [chainUid], executor),
    ]);
    const total = Number(count[0]?.total || 0);
    return {
      rows: rows.map((row) => ({
        chainAuditUid: row.chainAuditUid,
        chainUid: row.chainUid,
        changedByUserUid: row.changedByUserUid,
        changedByName: row.changedByName || null,
        changedByEmail: row.changedByEmail || null,
        operation: row.operation,
        changedFields: typeof row.changedFields === 'string' ? JSON.parse(row.changedFields) : row.changedFields,
        beforeData: typeof row.beforeData === 'string' ? JSON.parse(row.beforeData) : row.beforeData,
        afterData: typeof row.afterData === 'string' ? JSON.parse(row.afterData) : row.afterData,
        createdAt: row.createdAt,
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }
}

module.exports = { ChainAuditRepository };
