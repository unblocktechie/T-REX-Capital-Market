const { execute } = require('../database/connection');
const { createUid } = require('../utils/token');
const { identifier } = require('./base.repository');

const organizationFields = [
  'legalCompanyName', 'entityTypeUid', 'registrationNumber', 'streetAddress', 'countryUid', 'stateUid',
  'cityUid', 'postalCode', 'countryOfIncorporationUid', 'dateOfIncorporation', 'taxIdentificationNumber',
  'industryUid', 'businessActivity', 'website', 'walletAddress', 'currentStep', 'isDraft', 'status', 'submittedAt',
  'isUserNotified',
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
              d.\`originalFileName\`, d.\`mimeType\`, d.\`fileSize\`, d.\`checksumSha256\`, d.\`verificationStatus\`, d.\`createdAt\`, d.\`updatedAt\`
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
