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

  async findSubmittedByWalletAddress(walletAddress, excludeInvestorUid = null, executor) {
    const params = [walletAddress];
    const exclusion = excludeInvestorUid ? 'AND i.`investorUid` <> ?' : '';
    if (excludeInvestorUid) params.push(excludeInvestorUid);
    const rows = await execute(
      `SELECT i.*
       FROM \`investorMaster\` i
       WHERE LOWER(TRIM(i.\`walletAddress\`)) = LOWER(TRIM(?))
         AND i.\`status\` = 'submitted'
         ${exclusion}
       LIMIT 1`,
      params,
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
       (\`documentUid\`, \`investorUid\`, \`documentTypeUid\`, \`versionNumber\`, \`isCurrent\`, \`uploadedByUserUid\`,
        \`documentCategory\`, \`claimTopicCode\`, \`originalFileName\`, \`storedFileName\`, \`storageKey\`, \`mimeType\`, \`fileSize\`, \`checksumSha256\`)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [documentUid, data.investorUid, data.documentTypeUid, data.versionNumber || 1,
        data.isCurrent === undefined ? 1 : (data.isCurrent ? 1 : 0), data.uploadedByUserUid || null,
        data.documentCategory, data.claimTopicCode || null,
        data.originalFileName, data.storedFileName, data.storageKey, data.mimeType, data.fileSize, data.checksumSha256],
      executor,
    );
    return this.findDocument(data.investorUid, documentUid, executor);
  }

  // Current profile documents (latest version per type). Older versions are retained for
  // history (isCurrent = 0) but excluded here.
  async listDocuments(investorUid, executor) {
    return execute(
      `SELECT d.\`documentUid\`, d.\`investorUid\`, d.\`documentTypeUid\`, d.\`versionNumber\`, d.\`claimTopicCode\`,
              d.\`documentCategory\`, dt.\`documentTypeCode\`, dt.\`documentTypeName\`,
              d.\`originalFileName\`, d.\`mimeType\`, d.\`fileSize\`, d.\`checksumSha256\`, d.\`createdAt\`, d.\`updatedAt\`
       FROM \`investorDocument\` d
       INNER JOIN \`investorDocumentTypeMaster\` dt ON dt.\`documentTypeUid\` = d.\`documentTypeUid\`
       WHERE d.\`investorUid\` = ? AND d.\`isDeleted\` = 0 AND d.\`isCurrent\` = 1
       ORDER BY d.\`documentCategory\`, dt.\`displayOrder\`, d.\`createdAt\` DESC`,
      [investorUid],
      executor,
    );
  }

  // Full source row set (incl. storageKey + version) for the current documents. Used to build
  // an application submission snapshot pointing at the exact versions submitted.
  async listCurrentDocumentsForSnapshot(investorUid, executor) {
    return execute(
      `SELECT d.\`documentUid\`, d.\`documentTypeUid\`, d.\`versionNumber\`, d.\`documentCategory\`, d.\`claimTopicCode\`,
              dt.\`documentTypeName\`, d.\`originalFileName\`, d.\`storageKey\`, d.\`mimeType\`, d.\`fileSize\`
       FROM \`investorDocument\` d
       INNER JOIN \`investorDocumentTypeMaster\` dt ON dt.\`documentTypeUid\` = d.\`documentTypeUid\`
       WHERE d.\`investorUid\` = ? AND d.\`isDeleted\` = 0 AND d.\`isCurrent\` = 1
       ORDER BY d.\`documentCategory\`, dt.\`displayOrder\``,
      [investorUid],
      executor,
    );
  }

  // Version history for a type (newest first), for a profile "document versions" view.
  async listDocumentVersions(investorUid, documentTypeUid, executor) {
    return execute(
      `SELECT \`documentUid\`, \`versionNumber\`, \`isCurrent\`, \`originalFileName\`, \`mimeType\`, \`fileSize\`,
              \`uploadedByUserUid\`, \`createdAt\`
       FROM \`investorDocument\`
       WHERE \`investorUid\` = ? AND \`documentTypeUid\` = ? AND \`isDeleted\` = 0
       ORDER BY \`versionNumber\` DESC`,
      [investorUid, documentTypeUid],
      executor,
    );
  }

  async markDocumentNotCurrent(documentUid, executor) {
    await execute(
      'UPDATE `investorDocument` SET `isCurrent` = 0, `updatedAt` = UTC_TIMESTAMP(3) WHERE `documentUid` = ?',
      [documentUid],
      executor,
    );
  }

  // Distinct claim-topic codes for which the investor holds at least one active document.
  // Drives the token investment-interest eligibility check (token required topics ⊆ these).
  async listDocumentClaimTopicCodes(investorUid, executor) {
    const rows = await execute(
      `SELECT DISTINCT \`claimTopicCode\` FROM \`investorDocument\`
       WHERE \`investorUid\` = ? AND \`claimTopicCode\` IS NOT NULL AND \`claimTopicCode\` <> ''
         AND \`isActive\` = 1 AND \`isDeleted\` = 0 AND \`isCurrent\` = 1`,
      [investorUid],
      executor,
    );
    return rows.map((row) => row.claimTopicCode);
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

  // The current version of a given type (the one a new upload supersedes).
  async findActiveDocumentByType(investorUid, documentTypeUid, executor) {
    const rows = await execute(
      `SELECT \`documentUid\`, \`storageKey\`, \`versionNumber\` FROM \`investorDocument\`
       WHERE \`investorUid\` = ? AND \`documentTypeUid\` = ? AND \`isDeleted\` = 0 AND \`isCurrent\` = 1 LIMIT 1`,
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
      'SELECT COUNT(*) AS `total` FROM `investorDocument` WHERE `investorUid` = ? AND `documentCategory` = ? AND `isDeleted` = 0 AND `isCurrent` = 1',
      [investorUid, documentCategory],
      executor,
    );
    return Number(rows[0].total);
  }
}

module.exports = { InvestorRepository, investorFields };
