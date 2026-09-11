const { execute } = require('../database/connection');
const { createUid } = require('../utils/token');
const { identifier } = require('./base.repository');

const tokenFields = [
  'tokenName', 'tokenSymbol', 'decimals', 'initialTokenPrice', 'currentTokenPrice',
  'treasuryWalletAddress', 'tokenDescription',
  'imageOriginalFileName', 'imageStorageKey', 'imageMimeType', 'imageFileSize', 'imageWidth', 'imageHeight',
  'imageChecksumSha256', 'imageVirusScanStatus', 'trustedClaimIssuerWalletAddress', 'maxInvestors',
  'maxBalancePerInvestor', 'countryRestrictionMode', 'tokenAgentWalletAddress', 'identityManagerWalletAddress',
  'platformAgentWallet', 'tokenAddress', 'identityRegistryAddress', 'identityRegistryStorageAddress',
  'trustedIssuersRegistryAddress', 'claimTopicsRegistryAddress', 'modularComplianceAddress',
  'deployTxHash', 'deploymentSalt', 'deployedAtBlock',
  'currentStep', 'isDraft', 'status', 'contractAddress', 'contractTxnHash', 'contractTxnMessage', 'deployedAt',
];

// Token statuses from which a finalization (verified deployment) update is allowed.
// 'deploymentPending' is included so a token that entered the two-phase attempt flow
// can be finalized; 'draft' preserves the legacy single-call submit path.
const finalizableStatuses = ['draft', 'readyToDeploy', 'deploymentPending', 'deploymentFailed'];

class TokenRepository {
  async findByUserUid(userUid, executor) {
    const rows = await execute(
      `SELECT t.*, o.\`legalCompanyName\`, o.\`walletAddress\` AS \`organizationWalletAddress\`,
              o.\`contractAddress\` AS \`organizationIdentityAddress\`
       FROM \`tokenMaster\` t
       INNER JOIN \`organizationMaster\` o
         ON o.\`organizationUid\` = t.\`organizationUid\` AND o.\`isDeleted\` = 0
       WHERE t.\`userUid\` = ? AND t.\`isDeleted\` = 0 LIMIT 1`,
      [userUid],
      executor,
    );
    return rows[0] || null;
  }

  // Full joined token row for a given organization. Used by the background deployment sync.
  async findByOrganizationUid(organizationUid, executor) {
    const rows = await execute(
      `SELECT t.*, o.\`legalCompanyName\`, o.\`walletAddress\` AS \`organizationWalletAddress\`,
              o.\`contractAddress\` AS \`organizationIdentityAddress\`
       FROM \`tokenMaster\` t
       INNER JOIN \`organizationMaster\` o
         ON o.\`organizationUid\` = t.\`organizationUid\` AND o.\`isDeleted\` = 0
       WHERE t.\`organizationUid\` = ? AND t.\`isDeleted\` = 0 LIMIT 1`,
      [organizationUid],
      executor,
    );
    return rows[0] || null;
  }

  // Row-level lock on the token for the authenticated user. Used to serialize
  // concurrent deployment-attempt creation/finalization for the same token.
  async findForUpdateByUserUid(userUid, executor) {
    const rows = await execute(
      'SELECT * FROM `tokenMaster` WHERE `userUid` = ? AND `isDeleted` = 0 LIMIT 1 FOR UPDATE',
      [userUid],
      executor,
    );
    return rows[0] || null;
  }

  async findByTokenAddressExcept(tokenAddress, exceptTokenUid, executor) {
    const rows = await execute(
      `SELECT \`tokenUid\`, \`tokenAddress\`, \`deployTxHash\`
       FROM \`tokenMaster\`
       WHERE \`tokenAddress\` = ? AND \`tokenUid\` <> ? AND \`isDeleted\` = 0 LIMIT 1`,
      [tokenAddress, exceptTokenUid],
      executor,
    );
    return rows[0] || null;
  }

  async findByDeployTxHashExcept(deployTxHash, exceptTokenUid, executor) {
    const rows = await execute(
      `SELECT \`tokenUid\`, \`tokenAddress\`, \`deployTxHash\`
       FROM \`tokenMaster\`
       WHERE \`deployTxHash\` = ? AND \`tokenUid\` <> ? AND \`isDeleted\` = 0 LIMIT 1`,
      [deployTxHash, exceptTokenUid],
      executor,
    );
    return rows[0] || null;
  }

  async createForOrganization(organization, userUid, data = {}, executor) {
    const tokenUid = createUid();
    const entries = Object.entries(data).filter(([field, value]) => tokenFields.includes(field) && value !== undefined);
    const columns = ['`tokenUid`', '`organizationUid`', '`userUid`', ...entries.map(([field]) => identifier(field))];
    await execute(
      `INSERT INTO \`tokenMaster\` (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
      [tokenUid, organization.organizationUid, userUid, ...entries.map(([, value]) => value)],
      executor,
    );
    return this.findByUserUid(userUid, executor);
  }

  async updateByUserUid(userUid, data, executor) {
    const entries = Object.entries(data).filter(([field, value]) => tokenFields.includes(field) && value !== undefined);
    if (!entries.length) return this.findByUserUid(userUid, executor);
    await execute(
      `UPDATE \`tokenMaster\`
       SET ${entries.map(([field]) => `${identifier(field)} = ?`).join(', ')}, \`updatedAt\` = UTC_TIMESTAMP(3)
       WHERE \`userUid\` = ? AND \`isDeleted\` = 0`,
      [...entries.map(([, value]) => value), userUid],
      executor,
    );
    return this.findByUserUid(userUid, executor);
  }

  async updateCurrentPriceByOwner(userUid, tokenUid, currentTokenPrice, executor) {
    const result = await execute(
      `UPDATE \`tokenMaster\`
       SET \`currentTokenPrice\` = ?, \`updatedAt\` = UTC_TIMESTAMP(3)
       WHERE \`tokenUid\` = ? AND \`userUid\` = ? AND \`status\` = 'deployed'
         AND \`isActive\` = 1 AND \`isDeleted\` = 0`,
      [currentTokenPrice, tokenUid, userUid],
      executor,
    );
    if (!result.affectedRows) return null;
    return this.findByUserUid(userUid, executor);
  }

  async updateDeploymentByUserUid(userUid, data, executor) {
    const entries = Object.entries(data).filter(([field, value]) => tokenFields.includes(field) && value !== undefined);
    if (!entries.length) return this.findByUserUid(userUid, executor);
    const result = await execute(
      `UPDATE \`tokenMaster\`
       SET ${entries.map(([field]) => `${identifier(field)} = ?`).join(', ')}, \`updatedAt\` = UTC_TIMESTAMP(3)
       WHERE \`userUid\` = ? AND \`isDeleted\` = 0
         AND \`status\` IN (${finalizableStatuses.map(() => '?').join(', ')})`,
      [...entries.map(([, value]) => value), userUid, ...finalizableStatuses],
      executor,
    );
    if (!result.affectedRows) return null;
    return this.findByUserUid(userUid, executor);
  }

  async listClaimTopics(tokenUid, executor) {
    return execute(
      `SELECT tc.\`tokenClaimTopicUid\`, tc.\`claimTopicUid\`, tc.\`claimTopicValue\` AS \`value\`,
              ct.\`claimTopicCode\`, ct.\`claimTopicName\`, ct.\`description\`
       FROM \`tokenClaimTopic\` tc
       INNER JOIN \`claimTopicMaster\` ct
         ON ct.\`claimTopicUid\` = tc.\`claimTopicUid\` AND ct.\`isActive\` = 1 AND ct.\`isDeleted\` = 0
       WHERE tc.\`tokenUid\` = ? AND tc.\`isActive\` = 1 AND tc.\`isDeleted\` = 0
       ORDER BY ct.\`displayOrder\`, ct.\`claimTopicName\``,
      [tokenUid],
      executor,
    );
  }

  async replaceClaimTopics(tokenUid, claimTopics, executor) {
    await execute(
      `UPDATE \`tokenClaimTopic\`
       SET \`isActive\` = 0, \`isDeleted\` = 1, \`updatedAt\` = UTC_TIMESTAMP(3)
       WHERE \`tokenUid\` = ? AND \`isDeleted\` = 0`,
      [tokenUid],
      executor,
    );
    for (const topic of claimTopics) {
      await execute(
        `INSERT INTO \`tokenClaimTopic\`
         (\`tokenClaimTopicUid\`, \`tokenUid\`, \`claimTopicUid\`, \`claimTopicValue\`)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           \`claimTopicValue\` = VALUES(\`claimTopicValue\`),
           \`isActive\` = 1,
           \`isDeleted\` = 0,
           \`updatedAt\` = UTC_TIMESTAMP(3)`,
        [createUid(), tokenUid, topic.claimTopicUid, topic.value],
        executor,
      );
    }
    return this.listClaimTopics(tokenUid, executor);
  }

  async listCountryRestrictions(tokenUid, executor) {
    return execute(
      `SELECT tr.\`tokenCountryRestrictionUid\`, tr.\`countryUid\`, tr.\`iso3166NumericCode\`,
              c.\`countryName\`
       FROM \`tokenCountryRestriction\` tr
       INNER JOIN \`countryMaster\` c
         ON c.\`countryUid\` = tr.\`countryUid\` AND c.\`isActive\` = 1 AND c.\`isDeleted\` = 0
       WHERE tr.\`tokenUid\` = ? AND tr.\`isActive\` = 1 AND tr.\`isDeleted\` = 0
       ORDER BY c.\`countryName\``,
      [tokenUid],
      executor,
    );
  }

  async replaceCountryRestrictions(tokenUid, countries, executor) {
    await execute(
      `UPDATE \`tokenCountryRestriction\`
       SET \`isActive\` = 0, \`isDeleted\` = 1, \`updatedAt\` = UTC_TIMESTAMP(3)
       WHERE \`tokenUid\` = ? AND \`isDeleted\` = 0`,
      [tokenUid],
      executor,
    );
    for (const country of countries) {
      await execute(
        `INSERT INTO \`tokenCountryRestriction\`
         (\`tokenCountryRestrictionUid\`, \`tokenUid\`, \`countryUid\`, \`iso3166NumericCode\`)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           \`iso3166NumericCode\` = VALUES(\`iso3166NumericCode\`),
           \`isActive\` = 1,
           \`isDeleted\` = 0,
           \`updatedAt\` = UTC_TIMESTAMP(3)`,
        [createUid(), tokenUid, country.countryUid, country.numericCode],
        executor,
      );
    }
    return this.listCountryRestrictions(tokenUid, executor);
  }
}

module.exports = { TokenRepository, tokenFields, finalizableStatuses };
