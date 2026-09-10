const { execute } = require('../database/connection');

class WalletOwnershipRepository {
  async findInvestorOwner(walletAddress, executor) {
    const rows = await execute(
      `SELECT i.\`investorUid\`, i.\`userUid\`, i.\`status\`, i.\`walletAddress\`,
              u.\`roleUid\`, r.\`roleName\`
       FROM \`investorMaster\` i
       INNER JOIN \`userMaster\` u ON u.\`userUid\` = i.\`userUid\` AND u.\`isDeleted\` = 0
       INNER JOIN \`userRole\` r ON r.\`roleUid\` = u.\`roleUid\` AND r.\`isDeleted\` = 0
       WHERE LOWER(TRIM(i.\`walletAddress\`)) = LOWER(TRIM(?))
         AND LOWER(r.\`roleName\`) = 'investor' AND i.\`isDeleted\` = 0
       ORDER BY (i.\`status\` = 'submitted') DESC, i.\`updatedAt\` DESC LIMIT 1`,
      [walletAddress], executor,
    );
    return rows[0] || null;
  }

  async findIssuerOwner(walletAddress, excludeOrganizationUid = null, executor) {
    const params = [walletAddress];
    const exclusion = excludeOrganizationUid ? 'AND o.`organizationUid` <> ?' : '';
    if (excludeOrganizationUid) params.push(excludeOrganizationUid);
    const rows = await execute(
      `SELECT o.\`organizationUid\`, o.\`userUid\`, o.\`status\`, o.\`walletAddress\`,
              u.\`roleUid\`, r.\`roleName\`
       FROM \`organizationMaster\` o
       INNER JOIN \`userMaster\` u ON u.\`userUid\` = o.\`userUid\` AND u.\`isDeleted\` = 0
       INNER JOIN \`userRole\` r ON r.\`roleUid\` = u.\`roleUid\` AND r.\`isDeleted\` = 0
       WHERE LOWER(TRIM(o.\`walletAddress\`)) = LOWER(TRIM(?))
         AND LOWER(r.\`roleName\`) = 'issuer' AND o.\`isDeleted\` = 0
         ${exclusion}
       ORDER BY (o.\`status\` = 'approved') DESC, o.\`updatedAt\` DESC LIMIT 1`,
      params, executor,
    );
    return rows[0] || null;
  }
}

module.exports = { WalletOwnershipRepository };
