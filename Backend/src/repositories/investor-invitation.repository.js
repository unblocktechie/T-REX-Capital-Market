const { execute } = require('../database/connection');
const { createUid } = require('../utils/token');
const { sqlInteger } = require('../utils/sql');

class InvestorInvitationRepository {
  async findIssuerTokenContext(issuerUserUid, tokenUid, executor) {
    const rows = await execute(
      `SELECT t.*, o.\`legalCompanyName\`, o.\`status\` AS \`organizationStatus\`,
              o.\`isActive\` AS \`organizationActive\`, o.\`walletAddress\` AS \`organizationWalletAddress\`,
              o.\`userUid\` AS \`issuerUserUid\`, u.\`fullName\` AS \`issuerFullName\`, u.\`email\` AS \`issuerEmail\`
       FROM \`tokenMaster\` t
       INNER JOIN \`organizationMaster\` o
         ON o.\`organizationUid\` = t.\`organizationUid\` AND o.\`isDeleted\` = 0
       INNER JOIN \`userMaster\` u ON u.\`userUid\` = o.\`userUid\` AND u.\`isDeleted\` = 0
       WHERE t.\`tokenUid\` = ? AND o.\`userUid\` = ? AND t.\`isDeleted\` = 0 LIMIT 1`,
      [tokenUid, issuerUserUid], executor,
    );
    return rows[0] || null;
  }

  investorSelect() {
    return `i.\`investorUid\`, i.\`userUid\`, i.\`firstName\`, i.\`lastName\`, i.\`dateOfBirth\`,
      i.\`gender\`, i.\`streetAddress\`, i.\`countryUid\`, i.\`stateUid\`, i.\`cityUid\`,
      i.\`sourceOfWealth\`, i.\`estimatedNetWorth\`, i.\`annualInvestmentCapacity\`,
      i.\`yearsOfExperience\`, i.\`previousRwaExperience\`, i.\`rwaExperienceDescription\`,
      i.\`accreditationType\`, i.\`walletAddress\`, i.\`profileReference\`,
      i.\`onchainIdReference\`, i.\`contractAddress\` AS \`onchainIdentityAddress\`,
      i.\`status\` AS \`profileStatus\`, i.\`submittedAt\`,
      u.\`fullName\`, u.\`email\`, c.\`countryName\`, c.\`countryCode\`,
      c.\`numericCode\` AS \`countryNumericCode\`, s.\`stateName\`, ci.\`cityName\``;
  }

  investorFrom() {
    return `FROM \`investorMaster\` i
      INNER JOIN \`userMaster\` u
        ON u.\`userUid\` = i.\`userUid\` AND u.\`emailVerified\` = 1
          AND u.\`isActive\` = 1 AND u.\`isDeleted\` = 0
      INNER JOIN \`userRole\` r
        ON r.\`roleUid\` = u.\`roleUid\` AND r.\`roleName\` = 'Investor'
          AND r.\`isActive\` = 1 AND r.\`isDeleted\` = 0
      LEFT JOIN \`countryMaster\` c ON c.\`countryUid\` = i.\`countryUid\`
      LEFT JOIN \`stateMaster\` s ON s.\`stateUid\` = i.\`stateUid\`
      LEFT JOIN \`cityMaster\` ci ON ci.\`cityUid\` = i.\`cityUid\``;
  }

  async listCompletedInvestors({ organizationUid, tokenUid, search = '', invitationStatus = 'all', page = 1, limit = 20 }, executor) {
    const safePage = Math.max(1, Math.trunc(Number(page) || 1));
    const safeLimit = Math.max(1, Math.trunc(Number(limit) || 20));
    const where = ["i.`status` = 'submitted'", 'i.`isActive` = 1', 'i.`isDeleted` = 0'];
    const params = [];
    if (search) {
      where.push(`(i.\`firstName\` LIKE ? OR i.\`lastName\` LIKE ? OR u.\`fullName\` LIKE ?
        OR u.\`email\` LIKE ? OR i.\`walletAddress\` LIKE ? OR i.\`profileReference\` LIKE ?)`);
      const term = `%${search}%`;
      params.push(term, term, term, term, term, term);
    }
    if (invitationStatus !== 'all') {
      if (invitationStatus === 'notInvited') where.push('inv.`invitationUid` IS NULL');
      else if (invitationStatus === 'PENDING') where.push('inv.`status` = ?');
      else where.push('inv.`status` = ? AND inv.`emailStatus` = \'SENT\'');
      if (invitationStatus !== 'notInvited') params.push(invitationStatus);
    }
    const joins = `
      LEFT JOIN \`investorInvitation\` inv
        ON inv.\`organizationUid\` = ? AND inv.\`tokenUid\` = ? AND inv.\`investorUid\` = i.\`investorUid\`
          AND inv.\`isDeleted\` = 0
      LEFT JOIN \`tokenInvestmentInterest\` ti
        ON ti.\`tokenUid\` = ? AND ti.\`investorUid\` = i.\`investorUid\` AND ti.\`isDeleted\` = 0`;
    const joinParams = [organizationUid, tokenUid, tokenUid];
    const whereSql = where.join(' AND ');
    const offset = (safePage - 1) * safeLimit;
    const limitSql = sqlInteger(safeLimit, { min: 1, name: 'limit' });
    const offsetSql = sqlInteger(offset, { name: 'offset' });
    const rows = await execute(
      `SELECT ${this.investorSelect()}, inv.\`invitationUid\`, inv.\`status\` AS \`invitationStatus\`,
              inv.\`emailStatus\`, inv.\`sentAt\`, inv.\`viewedAt\`,
              ti.\`interestUid\`, ti.\`status\` AS \`interestStatus\`,
              EXISTS(SELECT 1 FROM \`tokenCountryRestriction\` tr
                WHERE tr.\`tokenUid\` = ? AND tr.\`countryUid\` = i.\`countryUid\`
                  AND tr.\`isActive\` = 1 AND tr.\`isDeleted\` = 0) AS \`countryListed\`
       ${this.investorFrom()} ${joins}
       WHERE ${whereSql}
       ORDER BY i.\`submittedAt\` DESC, i.\`createdAt\` DESC
       LIMIT ${limitSql} OFFSET ${offsetSql}`,
      [tokenUid, ...joinParams, ...params], executor,
    );
    const countRows = await execute(
      `SELECT COUNT(*) AS \`total\` ${this.investorFrom()} ${joins} WHERE ${whereSql}`,
      [...joinParams, ...params], executor,
    );
    return { rows, total: Number(countRows[0].total) };
  }

  async findCompletedInvestor(investorUid, tokenUid, executor) {
    const rows = await execute(
      `SELECT ${this.investorSelect()},
              EXISTS(SELECT 1 FROM \`tokenCountryRestriction\` tr
                WHERE tr.\`tokenUid\` = ? AND tr.\`countryUid\` = i.\`countryUid\`
                  AND tr.\`isActive\` = 1 AND tr.\`isDeleted\` = 0) AS \`countryListed\`
       ${this.investorFrom()}
       WHERE i.\`investorUid\` = ? AND i.\`status\` = 'submitted'
         AND i.\`isActive\` = 1 AND i.\`isDeleted\` = 0 LIMIT 1`,
      [tokenUid, investorUid], executor,
    );
    return rows[0] || null;
  }

  async findActiveInterest(tokenUid, investorUid, executor) {
    const rows = await execute(
      'SELECT `interestUid`, `status` FROM `tokenInvestmentInterest` WHERE `tokenUid` = ? AND `investorUid` = ? AND `isDeleted` = 0 LIMIT 1',
      [tokenUid, investorUid], executor,
    );
    return rows[0] || null;
  }

  async createOrFindForUpdate(data, executor) {
    const invitationUid = createUid();
    const result = await execute(
      `INSERT IGNORE INTO \`investorInvitation\`
        (\`invitationUid\`, \`organizationUid\`, \`tokenUid\`, \`issuerUserUid\`, \`investorUid\`, \`investorUserUid\`)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [invitationUid, data.organizationUid, data.tokenUid, data.issuerUserUid, data.investorUid, data.investorUserUid],
      executor,
    );
    const rows = await execute(
      `SELECT * FROM \`investorInvitation\`
       WHERE \`organizationUid\` = ? AND \`tokenUid\` = ? AND \`investorUid\` = ? AND \`isDeleted\` = 0
       LIMIT 1 FOR UPDATE`,
      [data.organizationUid, data.tokenUid, data.investorUid], executor,
    );
    return { row: rows[0] || null, created: result.affectedRows === 1 };
  }

  async claimEmail(invitationUid, executor) {
    await execute(
      `UPDATE \`investorInvitation\`
       SET \`emailStatus\` = 'PROCESSING', \`emailAttempts\` = \`emailAttempts\` + 1,
           \`emailClaimedAt\` = UTC_TIMESTAMP(3), \`lastEmailError\` = NULL,
           \`updatedAt\` = UTC_TIMESTAMP(3)
       WHERE \`invitationUid\` = ?`,
      [invitationUid], executor,
    );
    return this.findByUid(invitationUid, executor);
  }

  async markEmailSent(invitationUid, messageId, executor) {
    await execute(
      `UPDATE \`investorInvitation\`
       SET \`status\` = 'SENT', \`emailStatus\` = 'SENT', \`emailMessageId\` = ?,
           \`sentAt\` = COALESCE(\`sentAt\`, UTC_TIMESTAMP(3)), \`emailClaimedAt\` = NULL,
           \`lastEmailError\` = NULL, \`updatedAt\` = UTC_TIMESTAMP(3)
       WHERE \`invitationUid\` = ? AND \`emailStatus\` = 'PROCESSING'`,
      [messageId || null, invitationUid], executor,
    );
    return this.findByUid(invitationUid, executor);
  }

  async markEmailFailed(invitationUid, message, executor) {
    await execute(
      `UPDATE \`investorInvitation\`
       SET \`emailStatus\` = 'FAILED', \`emailClaimedAt\` = NULL, \`lastEmailError\` = ?,
           \`updatedAt\` = UTC_TIMESTAMP(3)
       WHERE \`invitationUid\` = ? AND \`emailStatus\` = 'PROCESSING'`,
      [String(message || 'Email delivery failed.').slice(0, 2000), invitationUid], executor,
    );
  }

  async findByUid(invitationUid, executor) {
    const rows = await execute(
      'SELECT * FROM `investorInvitation` WHERE `invitationUid` = ? AND `isDeleted` = 0 LIMIT 1',
      [invitationUid], executor,
    );
    return rows[0] || null;
  }

  async listForInvestor(investorUid, { search = '', status = 'all', page = 1, limit = 20 }, executor) {
    const safePage = Math.max(1, Math.trunc(Number(page) || 1));
    const safeLimit = Math.max(1, Math.trunc(Number(limit) || 20));
    const offset = (safePage - 1) * safeLimit;
    const limitSql = sqlInteger(safeLimit, { min: 1, name: 'limit' });
    const offsetSql = sqlInteger(offset, { name: 'offset' });
    const where = ['inv.`investorUid` = ?', "inv.`emailStatus` = 'SENT'", 'inv.`isDeleted` = 0'];
    const params = [investorUid];
    if (status !== 'all') { where.push('inv.`status` = ?'); params.push(status); }
    if (search) {
      where.push('(t.`tokenName` LIKE ? OR t.`tokenSymbol` LIKE ? OR o.`legalCompanyName` LIKE ?)');
      const term = `%${search}%`; params.push(term, term, term);
    }
    const from = `FROM \`investorInvitation\` inv
      INNER JOIN \`tokenMaster\` t ON t.\`tokenUid\` = inv.\`tokenUid\` AND t.\`isDeleted\` = 0
      INNER JOIN \`organizationMaster\` o ON o.\`organizationUid\` = inv.\`organizationUid\` AND o.\`isDeleted\` = 0
      INNER JOIN \`userMaster\` u ON u.\`userUid\` = inv.\`issuerUserUid\` AND u.\`isDeleted\` = 0
      LEFT JOIN \`countryMaster\` c ON c.\`countryUid\` = o.\`countryUid\``;
    const whereSql = where.join(' AND ');
    const rows = await execute(
      `SELECT inv.*, o.\`legalCompanyName\`, o.\`walletAddress\` AS \`organizationWalletAddress\`,
              o.\`website\` AS \`organizationWebsite\`, c.\`countryName\` AS \`organizationCountryName\`,
              c.\`countryCode\` AS \`organizationCountryCode\`, u.\`fullName\` AS \`issuerFullName\`,
              t.\`tokenName\`, t.\`tokenSymbol\`
       ${from} WHERE ${whereSql}
       ORDER BY inv.\`sentAt\` DESC, inv.\`createdAt\` DESC LIMIT ${limitSql} OFFSET ${offsetSql}`,
      params, executor,
    );
    const countRows = await execute(`SELECT COUNT(*) AS \`total\` ${from} WHERE ${whereSql}`, params, executor);
    return { rows, total: Number(countRows[0].total) };
  }

  async findForInvestor(invitationUid, investorUid, executor) {
    const rows = await execute(
      `SELECT inv.*, o.\`legalCompanyName\`, o.\`walletAddress\` AS \`organizationWalletAddress\`,
              o.\`website\` AS \`organizationWebsite\`, c.\`countryName\` AS \`organizationCountryName\`,
              c.\`countryCode\` AS \`organizationCountryCode\`, u.\`fullName\` AS \`issuerFullName\`,
              t.\`tokenName\`, t.\`tokenSymbol\`
       FROM \`investorInvitation\` inv
       INNER JOIN \`tokenMaster\` t ON t.\`tokenUid\` = inv.\`tokenUid\` AND t.\`isDeleted\` = 0
       INNER JOIN \`organizationMaster\` o ON o.\`organizationUid\` = inv.\`organizationUid\` AND o.\`isDeleted\` = 0
       INNER JOIN \`userMaster\` u ON u.\`userUid\` = inv.\`issuerUserUid\` AND u.\`isDeleted\` = 0
       LEFT JOIN \`countryMaster\` c ON c.\`countryUid\` = o.\`countryUid\`
       WHERE inv.\`invitationUid\` = ? AND inv.\`investorUid\` = ?
         AND inv.\`emailStatus\` = 'SENT' AND inv.\`isDeleted\` = 0 LIMIT 1`,
      [invitationUid, investorUid], executor,
    );
    return rows[0] || null;
  }

  async markViewed(invitationUid, investorUid, executor) {
    await execute(
      `UPDATE \`investorInvitation\` SET \`status\` = 'VIEWED',
          \`viewedAt\` = COALESCE(\`viewedAt\`, UTC_TIMESTAMP(3)), \`updatedAt\` = UTC_TIMESTAMP(3)
       WHERE \`invitationUid\` = ? AND \`investorUid\` = ? AND \`emailStatus\` = 'SENT'
         AND \`status\` IN ('SENT','VIEWED') AND \`isDeleted\` = 0`,
      [invitationUid, investorUid], executor,
    );
    return this.findForInvestor(invitationUid, investorUid, executor);
  }
}

module.exports = { InvestorInvitationRepository };
