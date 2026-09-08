const { execute } = require('../database/connection');
const { createUid } = require('../utils/token');
const { identifier } = require('./base.repository');

const investorFields = [
  'firstName', 'lastName', 'dateOfBirth', 'gender', 'streetAddress', 'countryUid', 'stateUid', 'cityUid',
  'sourceOfWealth', 'estimatedNetWorth', 'annualInvestmentCapacity', 'yearsOfExperience', 'previousRwaExperience',
  'rwaExperienceDescription', 'accreditationType',
  'walletAddress', 'profileReference', 'onchainIdReference',
  'contractAddress', 'contractTxnHash', 'contractTxnMessage',
  'currentStep', 'isDraft', 'status', 'submittedAt',
];

class InvestorRepository {
  async findByUserUid(userUid, executor) {
    const rows = await execute(
      `SELECT i.*, c.\`countryName\`, s.\`stateName\`, ci.\`cityName\`
       FROM \`investorMaster\` i
       LEFT JOIN \`countryMaster\` c ON c.\`countryUid\` = i.\`countryUid\`
       LEFT JOIN \`stateMaster\` s ON s.\`stateUid\` = i.\`stateUid\`
       LEFT JOIN \`cityMaster\` ci ON ci.\`cityUid\` = i.\`cityUid\`
       WHERE i.\`userUid\` = ? AND i.\`isDeleted\` = 0 LIMIT 1`,
      [userUid],
      executor,
    );
    return rows[0] || null;
  }

  async createForUser(userUid, data, executor) {
    const investorUid = createUid();
    const entries = Object.entries(data).filter(([field, value]) => investorFields.includes(field) && value !== undefined);
    const columns = ['`investorUid`', '`userUid`', ...entries.map(([field]) => identifier(field))];
    await execute(
      `INSERT INTO \`investorMaster\` (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
      [investorUid, userUid, ...entries.map(([, value]) => value)],
      executor,
    );
    return this.findByUserUid(userUid, executor);
  }

  async updateByUserUid(userUid, data, executor) {
    const entries = Object.entries(data).filter(([field, value]) => investorFields.includes(field) && value !== undefined);
    if (!entries.length) return this.findByUserUid(userUid, executor);
    await execute(
      `UPDATE \`investorMaster\`
       SET ${entries.map(([field]) => `${identifier(field)} = ?`).join(', ')}, \`updatedAt\` = UTC_TIMESTAMP(3)
       WHERE \`userUid\` = ? AND \`isDeleted\` = 0`,
      [...entries.map(([, value]) => value), userUid],
      executor,
    );
    return this.findByUserUid(userUid, executor);
  }

  async listInvestmentCategories(investorUid, executor) {
    const rows = await execute(
      `SELECT \`categoryCode\` FROM \`investorInvestmentCategory\`
       WHERE \`investorUid\` = ? AND \`isActive\` = 1 AND \`isDeleted\` = 0
       ORDER BY \`createdAt\``,
      [investorUid],
      executor,
    );
    return rows.map((row) => row.categoryCode);
  }

  async replaceInvestmentCategories(investorUid, categoryCodes, executor) {
    await execute(
      'UPDATE `investorInvestmentCategory` SET `isActive` = 0, `isDeleted` = 1, `updatedAt` = UTC_TIMESTAMP(3) WHERE `investorUid` = ? AND `isDeleted` = 0',
      [investorUid],
      executor,
    );
    for (const categoryCode of categoryCodes) {
      await execute(
        `INSERT INTO \`investorInvestmentCategory\` (\`investorInvestmentCategoryUid\`, \`investorUid\`, \`categoryCode\`)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE \`isActive\` = 1, \`isDeleted\` = 0, \`updatedAt\` = UTC_TIMESTAMP(3)`,
        [createUid(), investorUid, categoryCode],
        executor,
      );
    }
    return this.listInvestmentCategories(investorUid, executor);
  }

  async createDocument(data, executor) {
    const documentUid = createUid();
    await execute(
      `INSERT INTO \`investorDocument\`
       (\`documentUid\`, \`investorUid\`, \`documentTypeUid\`, \`documentCategory\`, \`originalFileName\`, \`storedFileName\`, \`storageKey\`, \`mimeType\`, \`fileSize\`, \`checksumSha256\`)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [documentUid, data.investorUid, data.documentTypeUid, data.documentCategory, data.originalFileName,
        data.storedFileName, data.storageKey, data.mimeType, data.fileSize, data.checksumSha256],
      executor,
    );
    return this.findDocument(data.investorUid, documentUid, executor);
  }

  async listDocuments(investorUid, executor) {
    return execute(
      `SELECT d.\`documentUid\`, d.\`investorUid\`, d.\`documentTypeUid\`, d.\`documentCategory\`,
              dt.\`documentTypeCode\`, dt.\`documentTypeName\`,
              d.\`originalFileName\`, d.\`mimeType\`, d.\`fileSize\`, d.\`checksumSha256\`, d.\`createdAt\`, d.\`updatedAt\`
       FROM \`investorDocument\` d
       INNER JOIN \`investorDocumentTypeMaster\` dt ON dt.\`documentTypeUid\` = d.\`documentTypeUid\`
       WHERE d.\`investorUid\` = ? AND d.\`isDeleted\` = 0
       ORDER BY d.\`documentCategory\`, dt.\`displayOrder\`, d.\`createdAt\` DESC`,
      [investorUid],
      executor,
    );
  }

  async findDocument(investorUid, documentUid, executor) {
    const rows = await execute(
      `SELECT d.*, dt.\`documentTypeCode\`, dt.\`documentTypeName\`
       FROM \`investorDocument\` d
       INNER JOIN \`investorDocumentTypeMaster\` dt ON dt.\`documentTypeUid\` = d.\`documentTypeUid\`
       WHERE d.\`investorUid\` = ? AND d.\`documentUid\` = ? AND d.\`isDeleted\` = 0 LIMIT 1`,
      [investorUid, documentUid],
      executor,
    );
    return rows[0] || null;
  }

  async findActiveDocumentByType(investorUid, documentTypeUid, executor) {
    const rows = await execute(
      `SELECT \`documentUid\`, \`storageKey\` FROM \`investorDocument\`
       WHERE \`investorUid\` = ? AND \`documentTypeUid\` = ? AND \`isDeleted\` = 0 LIMIT 1`,
      [investorUid, documentTypeUid],
      executor,
    );
    return rows[0] || null;
  }

  async softDeleteDocument(investorUid, documentUid, executor) {
    const result = await execute(
      `UPDATE \`investorDocument\` SET \`isDeleted\` = 1, \`isActive\` = 0, \`updatedAt\` = UTC_TIMESTAMP(3)
       WHERE \`investorUid\` = ? AND \`documentUid\` = ? AND \`isDeleted\` = 0`,
      [investorUid, documentUid],
      executor,
    );
    return result.affectedRows > 0;
  }

  async countDocumentsByCategory(investorUid, documentCategory, executor) {
    const rows = await execute(
      'SELECT COUNT(*) AS `total` FROM `investorDocument` WHERE `investorUid` = ? AND `documentCategory` = ? AND `isDeleted` = 0',
      [investorUid, documentCategory],
      executor,
    );
    return Number(rows[0].total);
  }
}

module.exports = { InvestorRepository, investorFields };
