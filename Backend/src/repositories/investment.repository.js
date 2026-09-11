const { execute } = require('../database/connection');
const { createUid } = require('../utils/token');
const { identifier } = require('./base.repository');
const { sqlInteger } = require('../utils/sql');

// Columns an investor "submit interest" row is created from.
const interestFields = [
  'tokenUid', 'organizationUid', 'investorUid', 'investorUserUid', 'walletAddress', 'status', 'note',
];

// Columns that may be updated on an existing interest (issuer decision / resubmission sync).
const interestUpdatableFields = [
  'status', 'note', 'walletAddress',
  'rejectReasonType', 'rejectReason', 'rejectedClaim', 'rejectedCount', 'canResubmitClaim',
  'decisionAt', 'submittedAt',
];

// Columns a timeline-history event is created from.
const historyFields = [
  'interestUid', 'tokenUid', 'organizationUid', 'investorUid', 'eventType',
  'rejectReasonType', 'rejectReason', 'rejectedClaim', 'resubmitAttempt',
  'actorRole', 'actorUserUid', 'note',
];

// Token columns exposed by the investment marketplace (a read-only catalogue of tokens).
const MARKETPLACE_TOKEN_COLUMNS = `t.\`tokenUid\`, t.\`organizationUid\`, t.\`tokenName\`, t.\`tokenSymbol\`,
  t.\`decimals\`, t.\`initialTokenPrice\`, t.\`currentTokenPrice\`,
  COALESCE(t.\`currentTokenPrice\`, t.\`initialTokenPrice\`) AS \`tokenPrice\`,
  t.\`tokenDescription\`, t.\`imageStorageKey\`, t.\`imageMimeType\`,
  t.\`maxInvestors\`, t.\`maxInvestors\` AS \`maxHolder\`, t.\`maxBalancePerInvestor\`, t.\`countryRestrictionMode\`,
  t.\`tokenAddress\`, t.\`status\`, t.\`deployedAt\`, t.\`createdAt\`, t.\`updatedAt\`,
  o.\`legalCompanyName\`, o.\`walletAddress\` AS \`organizationWalletAddress\`,
  oc.\`countryName\` AS \`organizationCountryName\`, oc.\`countryCode\` AS \`organizationCountryCode\``;

// Shared FROM/JOINs for the marketplace token queries: the token, its organization, and the
// organization's country (for organizationCountryName / organizationCountryCode).
const MARKETPLACE_TOKEN_FROM = `FROM \`tokenMaster\` t
       INNER JOIN \`organizationMaster\` o
         ON o.\`organizationUid\` = t.\`organizationUid\` AND o.\`isDeleted\` = 0
       LEFT JOIN \`countryMaster\` oc ON oc.\`countryUid\` = o.\`countryUid\``;

class InvestmentRepository {
  // ---------------------------------------------------------------- marketplace

  // Read-only token catalogue. `status` defaults to 'deployed' (only live tokens are
  // investable); pass status = 'all' to list every non-deleted token (admin view).
  async listMarketplaceTokens({
    search,
    status = 'deployed',
    page = 1,
    limit = 20,
    investorUserUid = null,
  } = {}, executor) {
    const safePage = Math.max(1, Math.trunc(Number(page) || 1));
    const safeLimit = Math.max(1, Math.trunc(Number(limit) || 20));
    const where = ['t.`isDeleted` = 0'];
    const params = [];
    if (status && status !== 'all') {
      where.push('t.`status` = ?');
      params.push(status);
    }
    if (search) {
      where.push('(t.`tokenName` LIKE ? OR t.`tokenSymbol` LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }
    // For investor requests, exclude tokens for which the investor's active-profile country
    // is ineligible. A blocklist rejects listed countries; an allowlist rejects unlisted
    // countries. Keep this in SQL (rather than filtering returned rows) so both the result
    // page and total count describe the same eligible token set. A profile without a country
    // retains the existing catalogue behavior; onboarding validation handles that separately.
    if (investorUserUid) {
      where.push(`NOT EXISTS (
        SELECT 1
        FROM \`investorMaster\` i
        WHERE i.\`userUid\` = ? AND i.\`countryUid\` IS NOT NULL
          AND i.\`isActive\` = 1 AND i.\`isDeleted\` = 0
          AND (
            (t.\`countryRestrictionMode\` = 'blocklist' AND EXISTS (
              SELECT 1 FROM \`tokenCountryRestriction\` tr
              WHERE tr.\`tokenUid\` = t.\`tokenUid\` AND tr.\`countryUid\` = i.\`countryUid\`
                AND tr.\`isActive\` = 1 AND tr.\`isDeleted\` = 0
            ))
            OR
            (t.\`countryRestrictionMode\` = 'allowlist' AND NOT EXISTS (
              SELECT 1 FROM \`tokenCountryRestriction\` tr
              WHERE tr.\`tokenUid\` = t.\`tokenUid\` AND tr.\`countryUid\` = i.\`countryUid\`
                AND tr.\`isActive\` = 1 AND tr.\`isDeleted\` = 0
            ))
          )
      )`);
      params.push(investorUserUid);
    }
    const whereSql = where.join(' AND ');
    const offset = (safePage - 1) * safeLimit;
    const limitSql = sqlInteger(safeLimit, { min: 1, name: 'limit' });
    const offsetSql = sqlInteger(offset, { name: 'offset' });

    const [rows, countRows] = await Promise.all([
      execute(
        `SELECT ${MARKETPLACE_TOKEN_COLUMNS}
         ${MARKETPLACE_TOKEN_FROM}
         WHERE ${whereSql}
         ORDER BY t.\`deployedAt\` DESC, t.\`createdAt\` DESC
         LIMIT ${limitSql} OFFSET ${offsetSql}`,
        params,
        executor,
      ),
      execute(
        `SELECT COUNT(*) AS \`total\`
         FROM \`tokenMaster\` t
         INNER JOIN \`organizationMaster\` o
           ON o.\`organizationUid\` = t.\`organizationUid\` AND o.\`isDeleted\` = 0
         WHERE ${whereSql}`,
        params,
        executor,
      ),
    ]);
    return { rows, total: Number(countRows[0].total) };
  }

  async findMarketplaceTokenByUid(tokenUid, executor) {
    const rows = await execute(
      `SELECT ${MARKETPLACE_TOKEN_COLUMNS}, t.\`treasuryWalletAddress\`
       ${MARKETPLACE_TOKEN_FROM}
       WHERE t.\`tokenUid\` = ? AND t.\`isDeleted\` = 0 LIMIT 1`,
      [tokenUid],
      executor,
    );
    return rows[0] || null;
  }

  // Country restrictions for one or more tokens, enriched with the country code / name /
  // ISO 3166-1 numeric code. Batched (single query) so the marketplace list avoids N+1.
  async listCountryRestrictionsForTokens(tokenUids, executor) {
    if (!tokenUids.length) return [];
    return execute(
      `SELECT tr.\`tokenUid\`, tr.\`countryUid\`, tr.\`iso3166NumericCode\` AS \`numericCode\`,
              c.\`countryName\`, c.\`countryCode\`
       FROM \`tokenCountryRestriction\` tr
       INNER JOIN \`countryMaster\` c
         ON c.\`countryUid\` = tr.\`countryUid\` AND c.\`isActive\` = 1 AND c.\`isDeleted\` = 0
       WHERE tr.\`tokenUid\` IN (${tokenUids.map(() => '?').join(', ')})
         AND tr.\`isActive\` = 1 AND tr.\`isDeleted\` = 0
       ORDER BY c.\`countryName\``,
      tokenUids,
      executor,
    );
  }

  async findTokenImageByUid(tokenUid, executor) {
    const rows = await execute(
      'SELECT `tokenUid`, `tokenSymbol`, `imageStorageKey`, `imageMimeType` FROM `tokenMaster` WHERE `tokenUid` = ? AND `isDeleted` = 0 LIMIT 1',
      [tokenUid],
      executor,
    );
    return rows[0] || null;
  }

  // ------------------------------------------------------------- interest rows

  async findActiveInterest(tokenUid, investorUid, executor) {
    const rows = await execute(
      'SELECT * FROM `tokenInvestmentInterest` WHERE `tokenUid` = ? AND `investorUid` = ? AND `isDeleted` = 0 LIMIT 1',
      [tokenUid, investorUid],
      executor,
    );
    return rows[0] || null;
  }

  // All active interests for an investor (any status). Drives the document-upload gate and
  // the post-upload resubmission sync.
  async listActiveInterestsByInvestor(investorUid, executor) {
    return execute(
      'SELECT * FROM `tokenInvestmentInterest` WHERE `investorUid` = ? AND `isDeleted` = 0',
      [investorUid],
      executor,
    );
  }

  async updateInterestByUid(interestUid, data, executor) {
    const entries = Object.entries(data).filter(([field, value]) => interestUpdatableFields.includes(field) && value !== undefined);
    if (!entries.length) return this.findInterestByUid(interestUid, executor);
    await execute(
      `UPDATE \`tokenInvestmentInterest\`
       SET ${entries.map(([field]) => `${identifier(field)} = ?`).join(', ')}, \`updatedAt\` = UTC_TIMESTAMP(3)
       WHERE \`interestUid\` = ? AND \`isDeleted\` = 0`,
      [...entries.map(([, value]) => value), interestUid],
      executor,
    );
    return this.findInterestByUid(interestUid, executor);
  }

  async createInterest(data, executor) {
    const interestUid = createUid();
    const entries = Object.entries(data).filter(([field, value]) => interestFields.includes(field) && value !== undefined);
    const columns = ['`interestUid`', ...entries.map(([field]) => identifier(field))];
    await execute(
      `INSERT INTO \`tokenInvestmentInterest\` (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
      [interestUid, ...entries.map(([, value]) => value)],
      executor,
    );
    return this.findInterestByUid(interestUid, executor);
  }

  // Single interest joined with its token, organization, and investor. Used by the issuer
  // detail view and by ownership checks on the download endpoint.
  async findInterestByUid(interestUid, executor) {
    const rows = await execute(
      `SELECT ii.*,
              t.\`tokenName\`, t.\`tokenSymbol\`, t.\`decimals\`, t.\`initialTokenPrice\`,
              t.\`currentTokenPrice\`,
              COALESCE(t.\`currentTokenPrice\`, t.\`initialTokenPrice\`) AS \`tokenPrice\`,
              t.\`imageStorageKey\`, t.\`imageMimeType\`, t.\`tokenAddress\`, t.\`status\` AS \`tokenStatus\`,
              o.\`legalCompanyName\`, o.\`contractAddress\` AS \`organizationIdentityAddress\`,
              i.\`firstName\`, i.\`lastName\`, i.\`profileReference\`, i.\`status\` AS \`investorStatus\`,
              i.\`walletAddress\` AS \`investorWalletAddress\`, i.\`contractAddress\` AS \`investorIdentityAddress\`,
              i.\`onchainIdReference\` AS \`investorOnchainIdReference\`
       FROM \`tokenInvestmentInterest\` ii
       INNER JOIN \`tokenMaster\` t ON t.\`tokenUid\` = ii.\`tokenUid\`
       LEFT JOIN \`organizationMaster\` o ON o.\`organizationUid\` = ii.\`organizationUid\`
       LEFT JOIN \`investorMaster\` i ON i.\`investorUid\` = ii.\`investorUid\`
       WHERE ii.\`interestUid\` = ? AND ii.\`isDeleted\` = 0 LIMIT 1`,
      [interestUid],
      executor,
    );
    return rows[0] || null;
  }

  // ---------------------------------------------------------- interest history

  async createHistory(data, executor) {
    const historyUid = createUid();
    const entries = Object.entries(data).filter(([field, value]) => historyFields.includes(field) && value !== undefined);
    const columns = ['`historyUid`', ...entries.map(([field]) => identifier(field))];
    await execute(
      `INSERT INTO \`tokenInvestmentInterestHistory\` (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
      [historyUid, ...entries.map(([, value]) => value)],
      executor,
    );
    return historyUid;
  }

  // Chronological (oldest-first) timeline for an interest.
  async listHistoryByInterest(interestUid, executor) {
    return execute(
      `SELECT \`historyUid\`, \`interestUid\`, \`eventType\`, \`rejectReasonType\`, \`rejectReason\`,
              \`rejectedClaim\`, \`resubmitAttempt\`, \`actorRole\`, \`actorUserUid\`, \`note\`, \`createdAt\`
       FROM \`tokenInvestmentInterestHistory\`
       WHERE \`interestUid\` = ? AND \`isDeleted\` = 0
       ORDER BY \`createdAt\` ASC, \`historyUid\` ASC`,
      [interestUid],
      executor,
    );
  }

  // ------------------------------------------------- submission document snapshot

  async getMaxSubmissionNumber(interestUid, executor) {
    const rows = await execute(
      'SELECT COALESCE(MAX(`submissionNumber`), 0) AS `maxNo` FROM `investmentSubmissionDocument` WHERE `interestUid` = ? AND `isDeleted` = 0',
      [interestUid],
      executor,
    );
    return Number(rows[0].maxNo);
  }

  async createSubmissionDocument(data, executor) {
    const submissionDocumentUid = createUid();
    await execute(
      `INSERT INTO \`investmentSubmissionDocument\`
       (\`submissionDocumentUid\`, \`historyUid\`, \`interestUid\`, \`tokenUid\`, \`organizationUid\`, \`investorUid\`,
        \`submissionNumber\`, \`documentUid\`, \`documentTypeUid\`, \`documentTypeName\`, \`documentCategory\`,
        \`claimTopicCode\`, \`versionNumber\`, \`originalFileName\`, \`storageKey\`, \`mimeType\`, \`fileSize\`)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [submissionDocumentUid, data.historyUid, data.interestUid, data.tokenUid, data.organizationUid, data.investorUid,
        data.submissionNumber, data.documentUid, data.documentTypeUid || null, data.documentTypeName || null,
        data.documentCategory || null, data.claimTopicCode || null, data.versionNumber || null,
        data.originalFileName || null, data.storageKey || null, data.mimeType || null, data.fileSize || null],
      executor,
    );
    return submissionDocumentUid;
  }

  // All snapshot rows for an application, oldest submission first.
  async listSubmissionDocumentsByInterest(interestUid, executor) {
    return execute(
      `SELECT \`submissionDocumentUid\`, \`historyUid\`, \`interestUid\`, \`submissionNumber\`, \`documentUid\`,
              \`documentTypeUid\`, \`documentTypeName\`, \`documentCategory\`, \`claimTopicCode\`, \`versionNumber\`,
              \`originalFileName\`, \`mimeType\`, \`fileSize\`, \`createdAt\`
       FROM \`investmentSubmissionDocument\`
       WHERE \`interestUid\` = ? AND \`isDeleted\` = 0
       ORDER BY \`submissionNumber\` ASC, \`documentCategory\` ASC`,
      [interestUid],
      executor,
    );
  }

  // Authorization + file lookup for an issuer download: the document must belong to a submission
  // snapshot of THIS application (never the investor's other versions or other applications).
  async findSubmissionDocument(interestUid, documentUid, executor) {
    const rows = await execute(
      `SELECT \`submissionDocumentUid\`, \`documentUid\`, \`storageKey\`, \`originalFileName\`, \`mimeType\`,
              \`submissionNumber\`, \`versionNumber\`
       FROM \`investmentSubmissionDocument\`
       WHERE \`interestUid\` = ? AND \`documentUid\` = ? AND \`isDeleted\` = 0
       ORDER BY \`submissionNumber\` DESC LIMIT 1`,
      [interestUid, documentUid],
      executor,
    );
    return rows[0] || null;
  }

  // Row lock on the interest, to serialize the "all claims confirmed -> claimSubmitted"
  // transition under concurrent claim submissions.
  async findInterestForUpdate(interestUid, executor) {
    const rows = await execute(
      'SELECT * FROM `tokenInvestmentInterest` WHERE `interestUid` = ? AND `isDeleted` = 0 LIMIT 1 FOR UPDATE',
      [interestUid],
      executor,
    );
    return rows[0] || null;
  }

  // Conditional status transition (idempotent): only flips when the current status matches.
  // Returns true when it actually transitioned.
  async transitionInterestStatus(interestUid, fromStatus, toStatus, executor) {
    const result = await execute(
      `UPDATE \`tokenInvestmentInterest\`
       SET \`status\` = ?, \`updatedAt\` = UTC_TIMESTAMP(3)
       WHERE \`interestUid\` = ? AND \`status\` = ? AND \`isDeleted\` = 0`,
      [toStatus, interestUid, fromStatus],
      executor,
    );
    return result.affectedRows > 0;
  }

  async listInterestsByInvestor(investorUid, { status } = {}, executor) {
    const where = ['ii.`investorUid` = ?', 'ii.`isDeleted` = 0'];
    const params = [investorUid];
    if (status) {
      where.push('ii.`status` = ?');
      params.push(status);
    }
    return execute(
      `SELECT ii.\`interestUid\`, ii.\`tokenUid\`, ii.\`organizationUid\`, ii.\`status\`, ii.\`note\`,
              ii.\`walletAddress\`, ii.\`submittedAt\`, ii.\`decisionAt\`, ii.\`createdAt\`,
              t.\`tokenName\`, t.\`tokenSymbol\`, t.\`decimals\`, t.\`initialTokenPrice\`,
              t.\`currentTokenPrice\`,
              COALESCE(t.\`currentTokenPrice\`, t.\`initialTokenPrice\`) AS \`tokenPrice\`,
              t.\`maxInvestors\`, t.\`maxBalancePerInvestor\`,
              t.\`imageStorageKey\`, t.\`tokenAddress\`, t.\`status\` AS \`tokenStatus\`,
              o.\`legalCompanyName\`
       FROM \`tokenInvestmentInterest\` ii
       INNER JOIN \`tokenMaster\` t ON t.\`tokenUid\` = ii.\`tokenUid\`
       LEFT JOIN \`organizationMaster\` o ON o.\`organizationUid\` = ii.\`organizationUid\`
       WHERE ${where.join(' AND ')}
       ORDER BY ii.\`submittedAt\` DESC`,
      params,
      executor,
    );
  }

  // Issuer-facing list scoped to the issuer's organization. Defaults to submitted interests
  // ('submitIntrest') — the issuer never sees 'pending' rows (docs still missing).
  async listInterestsByOrganization(organizationUid, { status = 'submitIntrest' } = {}, executor) {
    const where = ['ii.`organizationUid` = ?', 'ii.`isDeleted` = 0'];
    const params = [organizationUid];
    if (status && status !== 'all') {
      where.push('ii.`status` = ?');
      params.push(status);
    }
    return execute(
      `SELECT ii.\`interestUid\`, ii.\`tokenUid\`, ii.\`investorUid\`, ii.\`status\`, ii.\`note\`,
              ii.\`walletAddress\`, ii.\`submittedAt\`, ii.\`decisionAt\`, ii.\`createdAt\`,
              t.\`tokenName\`, t.\`tokenSymbol\`, t.\`tokenAddress\`, t.\`status\` AS \`tokenStatus\`,
              i.\`firstName\`, i.\`lastName\`, i.\`profileReference\`, i.\`status\` AS \`investorStatus\`,
              i.\`walletAddress\` AS \`investorWalletAddress\`, i.\`contractAddress\` AS \`investorIdentityAddress\`
       FROM \`tokenInvestmentInterest\` ii
       INNER JOIN \`tokenMaster\` t ON t.\`tokenUid\` = ii.\`tokenUid\`
       LEFT JOIN \`investorMaster\` i ON i.\`investorUid\` = ii.\`investorUid\`
       WHERE ${where.join(' AND ')}
       ORDER BY ii.\`submittedAt\` DESC`,
      params,
      executor,
    );
  }
}

module.exports = { InvestmentRepository, interestFields, interestUpdatableFields, historyFields };
