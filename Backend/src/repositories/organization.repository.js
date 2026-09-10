const { execute } = require('../database/connection');
const { createUid } = require('../utils/token');
const { identifier } = require('./base.repository');
const { sqlInteger } = require('../utils/sql');

const organizationFields = [
  'legalCompanyName', 'entityTypeUid', 'registrationNumber', 'streetAddress', 'countryUid', 'stateUid',
  'cityUid', 'postalCode', 'countryOfIncorporationUid', 'dateOfIncorporation', 'taxIdentificationNumber',
  'industryUid', 'businessActivity', 'website', 'walletAddress', 'currentStep', 'isDraft', 'status', 'submittedAt',
  'rejectionReason', 'rejectionCount', 'canResubmit', 'isUserNotified',
  'contractAddress', 'contractTxnHash', 'contractTxnMessage',
];

class OrganizationRepository {
  async findByUserUid(userUid, executor) {
    const rows = await execute(
      `SELECT o.*, et.\`entityTypeName\`, i.\`industryName\`, c.\`countryName\`, s.\`stateName\`, ci.\`cityName\`, ic.\`countryName\` AS \`countryOfIncorporationName\`
       FROM \`organizationMaster\` o
       LEFT JOIN \`entityTypeMaster\` et ON et.\`entityTypeUid\` = o.\`entityTypeUid\`
       LEFT JOIN \`industryMaster\` i ON i.\`industryUid\` = o.\`industryUid\`
       LEFT JOIN \`countryMaster\` c ON c.\`countryUid\` = o.\`countryUid\`
       LEFT JOIN \`stateMaster\` s ON s.\`stateUid\` = o.\`stateUid\`
       LEFT JOIN \`cityMaster\` ci ON ci.\`cityUid\` = o.\`cityUid\`
       LEFT JOIN \`countryMaster\` ic ON ic.\`countryUid\` = o.\`countryOfIncorporationUid\`
       WHERE o.\`userUid\` = ? AND o.\`isDeleted\` = 0 LIMIT 1`,
      [userUid],
      executor,
    );
    return rows[0] || null;
  }

  // Locate an organization by its on-chain deployer/owner wallet (case-insensitive).
  // Used by the background deployment sync to map an on-chain token owner back to an org.
  async findByWalletAddress(walletAddress, executor) {
    const rows = await execute(
      `SELECT * FROM \`organizationMaster\`
       WHERE LOWER(\`walletAddress\`) = LOWER(?) AND \`isDeleted\` = 0
       ORDER BY (\`status\` = 'approved') DESC, \`updatedAt\` DESC
       LIMIT 1`,
      [walletAddress],
      executor,
    );
    return rows[0] || null;
  }

  async createForUser(userUid, data, executor) {
    const organizationUid = createUid();
    const entries = Object.entries(data).filter(([field, value]) => organizationFields.includes(field) && value !== undefined);
    const columns = ['`organizationUid`', '`userUid`', ...entries.map(([field]) => identifier(field))];
    await execute(
      `INSERT INTO \`organizationMaster\` (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
      [organizationUid, userUid, ...entries.map(([, value]) => value)],
      executor,
    );
    return this.findByUserUid(userUid, executor);
  }

  async updateByUserUid(userUid, data, executor) {
    const entries = Object.entries(data).filter(([field, value]) => organizationFields.includes(field) && value !== undefined);
    if (!entries.length) return this.findByUserUid(userUid, executor);
    await execute(
      `UPDATE \`organizationMaster\` SET ${entries.map(([field]) => `${identifier(field)} = ?`).join(', ')}, \`updatedAt\` = UTC_TIMESTAMP(3)
       WHERE \`userUid\` = ? AND \`isDeleted\` = 0`,
      [...entries.map(([, value]) => value), userUid],
      executor,
    );
    return this.findByUserUid(userUid, executor);
  }

  async findByOrganizationUid(organizationUid, executor) {
    const rows = await execute(
      `SELECT o.*, u.\`fullName\` AS \`issuerFullName\`, u.\`email\` AS \`issuerEmail\`,
              et.\`entityTypeName\`, i.\`industryName\`, c.\`countryName\`, s.\`stateName\`, ci.\`cityName\`,
              ic.\`countryName\` AS \`countryOfIncorporationName\`
       FROM \`organizationMaster\` o
       INNER JOIN \`userMaster\` u ON u.\`userUid\` = o.\`userUid\` AND u.\`isDeleted\` = 0
       LEFT JOIN \`entityTypeMaster\` et ON et.\`entityTypeUid\` = o.\`entityTypeUid\`
       LEFT JOIN \`industryMaster\` i ON i.\`industryUid\` = o.\`industryUid\`
       LEFT JOIN \`countryMaster\` c ON c.\`countryUid\` = o.\`countryUid\`
       LEFT JOIN \`stateMaster\` s ON s.\`stateUid\` = o.\`stateUid\`
       LEFT JOIN \`cityMaster\` ci ON ci.\`cityUid\` = o.\`cityUid\`
       LEFT JOIN \`countryMaster\` ic ON ic.\`countryUid\` = o.\`countryOfIncorporationUid\`
       WHERE o.\`organizationUid\` = ? AND o.\`isDeleted\` = 0 LIMIT 1`,
      [organizationUid],
      executor,
    );
    return rows[0] || null;
  }

  async findForReview(organizationUid, executor) {
    const rows = await execute(
      'SELECT * FROM `organizationMaster` WHERE `organizationUid` = ? AND `isDeleted` = 0 LIMIT 1 FOR UPDATE',
      [organizationUid],
      executor,
    );
    return rows[0] || null;
  }

  async listSubmittedApplications(options = {}, executor) {
    const page = Math.max(1, Math.trunc(Number(options.page) || 1));
    const limit = Math.max(1, Math.trunc(Number(options.limit) || 20));
    const offset = (page - 1) * limit;
    const limitSql = sqlInteger(limit, { min: 1, name: 'limit' });
    const offsetSql = sqlInteger(offset, { name: 'offset' });
    const conditions = [
      'o.`isDeleted` = 0',
      'o.`submittedAt` IS NOT NULL',
      "o.`status` IN ('submitted', 'resubmitted', 'underReview', 'approved', 'rejected')",
    ];
    const params = [];
    if (options.status) {
      conditions.push('o.`status` = ?');
      params.push(options.status);
    }
    if (options.search) {
      conditions.push('(o.`legalCompanyName` LIKE ? OR o.`registrationNumber` LIKE ? OR o.`walletAddress` LIKE ? OR u.`fullName` LIKE ? OR u.`email` LIKE ?)');
      for (let index = 0; index < 5; index += 1) params.push(`%${options.search}%`);
    }
    const sortColumns = {
      legalCompanyName: 'o.`legalCompanyName`',
      status: 'o.`status`',
      submittedAt: 'o.`submittedAt`',
      updatedAt: 'o.`updatedAt`',
    };
    const sortBy = sortColumns[options.sortBy] || sortColumns.submittedAt;
    const sortOrder = String(options.sortOrder || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    const where = conditions.join(' AND ');
    const countRows = await execute(
      `SELECT COUNT(*) AS \`total\`
       FROM \`organizationMaster\` o
       INNER JOIN \`userMaster\` u ON u.\`userUid\` = o.\`userUid\` AND u.\`isDeleted\` = 0
       WHERE ${where}`,
      params,
      executor,
    );
    const rows = await execute(
      `SELECT o.\`organizationUid\`, o.\`userUid\`, o.\`legalCompanyName\`, o.\`registrationNumber\`,
              o.\`walletAddress\`, o.\`contractAddress\`, o.\`contractTxnHash\`, o.\`contractTxnMessage\`,
              o.\`status\`, o.\`submittedAt\`, o.\`rejectionReason\`,
              o.\`rejectionCount\`, o.\`canResubmit\`, o.\`isUserNotified\`, o.\`updatedAt\`,
              u.\`fullName\` AS \`issuerFullName\`, u.\`email\` AS \`issuerEmail\`,
              et.\`entityTypeName\`, i.\`industryName\`, c.\`countryName\`
       FROM \`organizationMaster\` o
       INNER JOIN \`userMaster\` u ON u.\`userUid\` = o.\`userUid\` AND u.\`isDeleted\` = 0
       LEFT JOIN \`entityTypeMaster\` et ON et.\`entityTypeUid\` = o.\`entityTypeUid\`
       LEFT JOIN \`industryMaster\` i ON i.\`industryUid\` = o.\`industryUid\`
       LEFT JOIN \`countryMaster\` c ON c.\`countryUid\` = o.\`countryUid\`
       WHERE ${where}
       ORDER BY ${sortBy} ${sortOrder}
       LIMIT ${limitSql} OFFSET ${offsetSql}`,
      params,
      executor,
    );
    const total = Number(countRows[0].total);
    return { rows, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async updateByOrganizationUid(organizationUid, data, executor) {
    const entries = Object.entries(data).filter(([field, value]) => organizationFields.includes(field) && value !== undefined);
    if (!entries.length) return this.findByOrganizationUid(organizationUid, executor);
    await execute(
      `UPDATE \`organizationMaster\`
       SET ${entries.map(([field]) => `${identifier(field)} = ?`).join(', ')}, \`updatedAt\` = UTC_TIMESTAMP(3)
       WHERE \`organizationUid\` = ? AND \`isDeleted\` = 0`,
      [...entries.map(([, value]) => value), organizationUid],
      executor,
    );
    return this.findByOrganizationUid(organizationUid, executor);
  }

  async listBeneficialOwners(organizationUid, executor) {
    return execute(
      `SELECT bo.*, c.\`countryName\` AS \`nationalityCountryName\`, c.\`countryCode\` AS \`nationalityCountryCode\`
       FROM \`organizationBeneficialOwner\` bo
       LEFT JOIN \`countryMaster\` c ON c.\`countryUid\` = bo.\`nationalityCountryUid\`
       WHERE bo.\`organizationUid\` = ? AND bo.\`isDeleted\` = 0 ORDER BY bo.\`isPrimary\` DESC, bo.\`createdAt\``,
      [organizationUid],
      executor,
    );
  }

  async replaceBeneficialOwners(organizationUid, owners, executor) {
    await execute(
      'UPDATE `organizationBeneficialOwner` SET `isDeleted` = 1, `isActive` = 0, `updatedAt` = UTC_TIMESTAMP(3) WHERE `organizationUid` = ? AND `isDeleted` = 0',
      [organizationUid],
      executor,
    );
    for (const owner of owners) {
      await execute(
        `INSERT INTO \`organizationBeneficialOwner\`
         (\`beneficialOwnerUid\`, \`organizationUid\`, \`fullName\`, \`dateOfBirth\`, \`nationalityCountryUid\`, \`ownershipPercentage\`, \`isPrimary\`)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [createUid(), organizationUid, owner.fullName ?? null, owner.dateOfBirth ?? null, owner.nationalityCountryUid ?? null, owner.ownershipPercentage ?? null, owner.isPrimary || false],
        executor,
      );
    }
    return this.listBeneficialOwners(organizationUid, executor);
  }

  async createDocument(data, executor) {
    const documentUid = createUid();
    await execute(
      `INSERT INTO \`organizationDocument\`
       (\`documentUid\`, \`organizationUid\`, \`documentTypeUid\`, \`originalFileName\`, \`storedFileName\`, \`storageKey\`, \`mimeType\`, \`fileSize\`, \`checksumSha256\`)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [documentUid, data.organizationUid, data.documentTypeUid, data.originalFileName, data.storedFileName, data.storageKey, data.mimeType, data.fileSize, data.checksumSha256],
      executor,
    );
    return this.findDocument(data.organizationUid, documentUid, executor);
  }

  async listDocuments(organizationUid, executor) {
    return execute(
      `SELECT d.\`documentUid\`, d.\`organizationUid\`, d.\`documentTypeUid\`, dt.\`documentTypeCode\`, dt.\`documentTypeName\`, dt.\`isRequired\`,
              d.\`originalFileName\`, d.\`mimeType\`, d.\`fileSize\`, d.\`checksumSha256\`, d.\`createdAt\`, d.\`updatedAt\`
       FROM \`organizationDocument\` d INNER JOIN \`documentTypeMaster\` dt ON dt.\`documentTypeUid\` = d.\`documentTypeUid\`
       WHERE d.\`organizationUid\` = ? AND d.\`isDeleted\` = 0 ORDER BY dt.\`displayOrder\`, d.\`createdAt\` DESC`,
      [organizationUid],
      executor,
    );
  }

  async findDocument(organizationUid, documentUid, executor) {
    const rows = await execute(
      `SELECT d.*, dt.\`documentTypeCode\`, dt.\`documentTypeName\`, dt.\`isRequired\`
       FROM \`organizationDocument\` d INNER JOIN \`documentTypeMaster\` dt ON dt.\`documentTypeUid\` = d.\`documentTypeUid\`
       WHERE d.\`organizationUid\` = ? AND d.\`documentUid\` = ? AND d.\`isDeleted\` = 0 LIMIT 1`,
      [organizationUid, documentUid],
      executor,
    );
    return rows[0] || null;
  }

  async softDeleteDocument(organizationUid, documentUid, executor) {
    const result = await execute(
      `UPDATE \`organizationDocument\` SET \`isDeleted\` = 1, \`isActive\` = 0, \`updatedAt\` = UTC_TIMESTAMP(3)
       WHERE \`organizationUid\` = ? AND \`documentUid\` = ? AND \`isDeleted\` = 0`,
      [organizationUid, documentUid],
      executor,
    );
    return result.affectedRows > 0;
  }
}

module.exports = { OrganizationRepository, organizationFields };
