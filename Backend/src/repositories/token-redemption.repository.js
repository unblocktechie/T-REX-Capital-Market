const { execute } = require('../database/connection');
const { createUid } = require('../utils/token');

const TERMINAL_STATUSES = ['COMPLETED', 'ISSUER_REJECTED', 'CANCELLED', 'EXPIRED'];

class TokenRedemptionRepository {
  async findContext(userUid, tokenUid, executor) {
    const rows = await execute(
      `SELECT ii.\`interestUid\`, ii.\`status\` AS \`interestStatus\`, ii.\`organizationUid\`,
              ii.\`investorUid\`, ii.\`investorUserUid\`,
              i.\`walletAddress\` AS \`investorWalletAddress\`, i.\`status\` AS \`investorStatus\`,
              i.\`isActive\` AS \`investorActive\`, i.\`isDeleted\` AS \`investorDeleted\`,
              t.\`tokenUid\`, t.\`tokenAddress\`, t.\`treasuryWalletAddress\`, t.\`decimals\` AS \`tokenDecimals\`,
              CAST(t.\`initialTokenPrice\` AS CHAR) AS \`tokenPrice\`, t.\`status\` AS \`tokenStatus\`,
              t.\`isActive\` AS \`tokenActive\`, o.\`userUid\` AS \`issuerUserUid\`,
              o.\`status\` AS \`organizationStatus\`, o.\`isActive\` AS \`organizationActive\`,
              EXISTS(
                SELECT 1 FROM \`tokenPurchase\` p WHERE p.\`interestUid\`=ii.\`interestUid\`
                  AND p.\`status\` IN ('PENDING_PAYMENT','PAYMENT_CONFIRMED','MINT_SUBMITTED') AND p.\`isDeleted\`=0
              ) AS \`hasActivePurchase\`
       FROM \`tokenInvestmentInterest\` ii
       INNER JOIN \`investorMaster\` i ON i.\`investorUid\`=ii.\`investorUid\`
       INNER JOIN \`tokenMaster\` t ON t.\`tokenUid\`=ii.\`tokenUid\` AND t.\`isDeleted\`=0
       INNER JOIN \`organizationMaster\` o ON o.\`organizationUid\`=ii.\`organizationUid\` AND o.\`isDeleted\`=0
       WHERE ii.\`investorUserUid\`=? AND ii.\`tokenUid\`=? AND ii.\`isDeleted\`=0 LIMIT 1`,
      [userUid, tokenUid], executor,
    );
    return rows[0] || null;
  }

  async findByUid(redemptionUid, executor) {
    const rows = await execute(
      'SELECT * FROM `tokenRedemption` WHERE `redemptionUid`=? AND `isDeleted`=0 LIMIT 1',
      [redemptionUid], executor,
    );
    return rows[0] || null;
  }

  async findForUpdate(redemptionUid, executor) {
    const rows = await execute(
      'SELECT * FROM `tokenRedemption` WHERE `redemptionUid`=? AND `isDeleted`=0 LIMIT 1 FOR UPDATE',
      [redemptionUid], executor,
    );
    return rows[0] || null;
  }

  async findOwned(redemptionUid, userUid, executor) {
    const rows = await execute(
      'SELECT * FROM `tokenRedemption` WHERE `redemptionUid`=? AND `investorUserUid`=? AND `isDeleted`=0 LIMIT 1',
      [redemptionUid, userUid], executor,
    );
    return rows[0] || null;
  }

  async findIssuerOwned(redemptionUid, userUid, executor) {
    const rows = await execute(
      `SELECT r.*,
        TRIM(CONCAT(COALESCE(i.\`firstName\`,''),' ',COALESCE(i.\`lastName\`,''))) AS \`investorName\`
       FROM \`tokenRedemption\` r
       LEFT JOIN \`investorMaster\` i ON i.\`investorUid\`=r.\`investorUid\`
       WHERE r.\`redemptionUid\`=? AND r.\`issuerUserUid\`=? AND r.\`isDeleted\`=0 LIMIT 1`,
      [redemptionUid, userUid], executor,
    );
    return rows[0] || null;
  }

  async findByIdempotency(userUid, idempotencyKey, executor) {
    const rows = await execute(
      'SELECT * FROM `tokenRedemption` WHERE `investorUserUid`=? AND `idempotencyKey`=? AND `isDeleted`=0 LIMIT 1',
      [userUid, idempotencyKey], executor,
    );
    return rows[0] || null;
  }

  async findActiveByInterest(interestUid, executor) {
    const rows = await execute(
      'SELECT * FROM `tokenRedemption` WHERE `activeInterestUid`=? AND `isDeleted`=0 LIMIT 1',
      [interestUid], executor,
    );
    return rows[0] || null;
  }

  async findByTransactionHash(txHash, executor) {
    const rows = await execute(
      `SELECT * FROM \`tokenRedemption\` WHERE \`isDeleted\`=0 AND
       (LOWER(\`lockTxHash\`)=LOWER(?) OR LOWER(\`paymentTxHash\`)=LOWER(?)
        OR LOWER(\`burnTxHash\`)=LOWER(?) OR LOWER(\`unlockTxHash\`)=LOWER(?)) LIMIT 1`,
      [txHash, txHash, txHash, txHash], executor,
    );
    return rows[0] || null;
  }

  async create(data, executor) {
    const redemptionUid = createUid();
    await execute(
      `INSERT INTO \`tokenRedemption\`
        (\`redemptionUid\`,\`interestUid\`,\`tokenUid\`,\`organizationUid\`,\`investorUid\`,\`investorUserUid\`,
         \`issuerUserUid\`,\`idempotencyKey\`,\`chainId\`,\`usdtContractAddress\`,\`tokenAddress\`,
         \`investorWalletAddress\`,\`issuerPaymentWalletAddress\`,\`platformWalletAddress\`,\`usdtDecimals\`,
         \`tokenDecimals\`,\`tokenPrice\`,\`tokenAmount\`,\`tokenAmountRaw\`,\`usdtAmount\`,\`usdtAmountRaw\`,
         \`balanceBeforeRaw\`,\`frozenBeforeRaw\`,\`totalSupplyBeforeRaw\`,\`preparedAtBlock\`,
         \`authorizationNonce\`,\`authorizationDeadline\`,\`expiresAt\`)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [redemptionUid, data.interestUid, data.tokenUid, data.organizationUid, data.investorUid,
        data.investorUserUid, data.issuerUserUid, data.idempotencyKey, data.chainId,
        data.usdtContractAddress, data.tokenAddress, data.investorWalletAddress,
        data.issuerPaymentWalletAddress, data.platformWalletAddress, data.usdtDecimals,
        data.tokenDecimals, data.tokenPrice, data.tokenAmount, data.tokenAmountRaw,
        data.usdtAmount, data.usdtAmountRaw, data.balanceBeforeRaw, data.frozenBeforeRaw,
        data.totalSupplyBeforeRaw, data.preparedAtBlock, data.authorizationNonce,
        data.authorizationDeadline, data.expiresAt], executor,
    );
    return this.findByUid(redemptionUid, executor);
  }

  async listInvestor(userUid, tokenUid, { page = 1, limit = 20, search = '', status = 'all' } = {}, executor) {
    return this.list({ investorUserUid: userUid, tokenUid, page, limit, search, status }, executor);
  }

  async listIssuer(userUid, options = {}, executor) {
    return this.list({ ...options, issuerUserUid: userUid }, executor);
  }

  async list({ investorUserUid, issuerUserUid, tokenUid, page = 1, limit = 20, search = '', status = 'all' }, executor) {
    const safePage = Math.max(1, Math.trunc(page));
    const safeLimit = Math.min(100, Math.max(1, Math.trunc(limit)));
    const conditions = ['r.`isDeleted`=0']; const params = [];
    if (investorUserUid) { conditions.push('r.`investorUserUid`=?'); params.push(investorUserUid); }
    if (issuerUserUid) { conditions.push('r.`issuerUserUid`=?'); params.push(issuerUserUid); }
    if (tokenUid) { conditions.push('r.`tokenUid`=?'); params.push(tokenUid); }
    if (status && status !== 'all') { conditions.push('r.`status`=?'); params.push(status); }
    const normalized = String(search || '').trim().toLowerCase();
    if (normalized) {
      const pattern = `%${normalized}%`;
      conditions.push(`(LOWER(r.\`redemptionUid\`) LIKE ? OR LOWER(COALESCE(r.\`paymentTxHash\`,'')) LIKE ?
        OR LOWER(COALESCE(r.\`lockTxHash\`,'')) LIKE ? OR LOWER(COALESCE(r.\`burnTxHash\`,'')) LIKE ?
        OR LOWER(r.\`investorWalletAddress\`) LIKE ? OR LOWER(r.\`tokenAddress\`) LIKE ?
        OR CAST(r.\`tokenAmount\` AS CHAR) LIKE ? OR CAST(r.\`usdtAmount\` AS CHAR) LIKE ?)`);
      params.push(pattern, pattern, pattern, pattern, pattern, pattern, pattern, pattern);
    }
    const where = conditions.join(' AND '); const offset = (safePage - 1) * safeLimit;
    const [rows, counts] = await Promise.all([
      execute(`SELECT r.*, t.\`tokenName\`, t.\`tokenSymbol\`,
        TRIM(CONCAT(COALESCE(i.\`firstName\`,''),' ',COALESCE(i.\`lastName\`,''))) AS \`investorName\`
        FROM \`tokenRedemption\` r
        LEFT JOIN \`tokenMaster\` t ON t.\`tokenUid\`=r.\`tokenUid\`
        LEFT JOIN \`investorMaster\` i ON i.\`investorUid\`=r.\`investorUid\`
        WHERE ${where} ORDER BY r.\`createdAt\` DESC, r.\`redemptionUid\` DESC LIMIT ? OFFSET ?`,
      [...params, safeLimit, offset], executor),
      execute(`SELECT COUNT(*) AS \`total\` FROM \`tokenRedemption\` r WHERE ${where}`, params, executor),
    ]);
    return { rows, total: Number(counts[0]?.total || 0), page: safePage, limit: safeLimit };
  }

  async transition(redemptionUid, fromStatuses, values, executor) {
    const entries = Object.entries(values);
    if (!entries.length) return false;
    const allowed = Array.isArray(fromStatuses) ? fromStatuses : [fromStatuses];
    const assignments = entries.map(([key]) => `\`${key}\`=?`).join(',');
    const result = await execute(
      `UPDATE \`tokenRedemption\` SET ${assignments}, \`updatedAt\`=UTC_TIMESTAMP(3)
       WHERE \`redemptionUid\`=? AND \`status\` IN (${allowed.map(() => '?').join(',')}) AND \`isDeleted\`=0`,
      [...entries.map(([, value]) => value), redemptionUid, ...allowed], executor,
    );
    return result.affectedRows > 0;
  }

  async addHistory(data, executor) {
    await execute(
      `INSERT INTO \`tokenRedemptionHistory\`
       (\`redemptionHistoryUid\`,\`redemptionUid\`,\`eventType\`,\`fromStatus\`,\`toStatus\`,
        \`actorRole\`,\`actorUserUid\`,\`message\`,\`metadata\`) VALUES (?,?,?,?,?,?,?,?,?)`,
      [createUid(), data.redemptionUid, data.eventType, data.fromStatus || null, data.toStatus,
        data.actorRole || 'system', data.actorUserUid || null, data.message || null,
        data.metadata ? JSON.stringify(data.metadata) : null], executor,
    );
  }

  async listHistory(redemptionUid, executor) {
    return execute(
      'SELECT * FROM `tokenRedemptionHistory` WHERE `redemptionUid`=? ORDER BY `createdAt`,`redemptionHistoryUid`',
      [redemptionUid], executor,
    );
  }

  async recordTransaction(redemptionUid, stage, txHash, status, data = {}, executor) {
    await execute(
      `INSERT INTO \`tokenRedemptionTransaction\`
       (\`redemptionTransactionUid\`,\`redemptionUid\`,\`stage\`,\`txHash\`,\`status\`,\`blockNumber\`,
        \`blockHash\`,\`transactionIndex\`,\`logIndex\`,\`gasUsed\`,\`effectiveGasPrice\`,
        \`errorCode\`,\`errorMessage\`,\`confirmedAt\`) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE \`status\`=VALUES(\`status\`),\`blockNumber\`=VALUES(\`blockNumber\`),
        \`blockHash\`=VALUES(\`blockHash\`),\`transactionIndex\`=VALUES(\`transactionIndex\`),
        \`logIndex\`=VALUES(\`logIndex\`),\`gasUsed\`=VALUES(\`gasUsed\`),
        \`effectiveGasPrice\`=VALUES(\`effectiveGasPrice\`),\`errorCode\`=VALUES(\`errorCode\`),
        \`errorMessage\`=VALUES(\`errorMessage\`),\`confirmedAt\`=VALUES(\`confirmedAt\`),
        \`updatedAt\`=UTC_TIMESTAMP(3)`,
      [createUid(), redemptionUid, stage, txHash.toLowerCase(), status, data.blockNumber ?? null,
        data.blockHash ?? null, data.transactionIndex ?? null, data.logIndex ?? null,
        data.gasUsed ?? null, data.effectiveGasPrice ?? null, data.errorCode ?? null,
        data.errorMessage ? String(data.errorMessage).slice(0, 2000) : null,
        status === 'CONFIRMED' ? new Date() : null], executor,
    );
  }

  async listTransactions(redemptionUid, executor) {
    return execute(
      'SELECT * FROM `tokenRedemptionTransaction` WHERE `redemptionUid`=? ORDER BY `createdAt`,`redemptionTransactionUid`',
      [redemptionUid], executor,
    );
  }

  async queue(redemptionUid, executor) {
    await execute(
      `UPDATE \`tokenRedemption\` SET \`syncStatus\`='QUEUED',\`syncRequestedAt\`=UTC_TIMESTAMP(3),
       \`nextSyncAt\`=UTC_TIMESTAMP(3),\`updatedAt\`=UTC_TIMESTAMP(3)
       WHERE \`redemptionUid\`=? AND \`status\` NOT IN ('COMPLETED','ISSUER_REJECTED','CANCELLED','EXPIRED') AND \`isDeleted\`=0`,
      [redemptionUid], executor,
    );
    return this.findByUid(redemptionUid, executor);
  }

  async markProcessing(redemptionUid, executor) {
    const result = await execute(
      `UPDATE \`tokenRedemption\` SET \`syncStatus\`='PROCESSING',\`syncStartedAt\`=UTC_TIMESTAMP(3),
       \`syncAttempts\`=\`syncAttempts\`+1,\`nextSyncAt\`=NULL,\`updatedAt\`=UTC_TIMESTAMP(3)
       WHERE \`redemptionUid\`=? AND \`status\` NOT IN ('COMPLETED','ISSUER_REJECTED','CANCELLED','EXPIRED')
       AND \`isDeleted\`=0 AND (\`syncStatus\` IN ('IDLE','QUEUED','FAILED') OR
       (\`syncStatus\`='PROCESSING' AND \`syncStartedAt\`<DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 5 MINUTE)))`,
      [redemptionUid], executor,
    );
    return result.affectedRows > 0;
  }

  async schedule(redemptionUid, seconds = 30, executor) {
    await execute(
      `UPDATE \`tokenRedemption\` SET \`syncStatus\`='QUEUED',\`syncCompletedAt\`=UTC_TIMESTAMP(3),
       \`nextSyncAt\`=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL ? SECOND),\`updatedAt\`=UTC_TIMESTAMP(3)
       WHERE \`redemptionUid\`=? AND \`status\` NOT IN ('COMPLETED','ISSUER_REJECTED','CANCELLED','EXPIRED')`,
      [Math.max(1, Math.trunc(seconds)), redemptionUid], executor,
    );
  }

  async recordError(redemptionUid, stage, code, message, retrySeconds = null, executor) {
    await execute(
      `UPDATE \`tokenRedemption\` SET \`errorStage\`=?,\`errorCode\`=?,\`errorMessage\`=?,
       \`syncStatus\`=?,\`syncCompletedAt\`=UTC_TIMESTAMP(3),
       \`nextSyncAt\`=CASE WHEN ? IS NULL THEN NULL ELSE DATE_ADD(UTC_TIMESTAMP(3),INTERVAL ? SECOND) END,
       \`updatedAt\`=UTC_TIMESTAMP(3) WHERE \`redemptionUid\`=? AND \`isDeleted\`=0`,
      [stage, code, String(message || '').slice(0, 2000), retrySeconds === null ? 'FAILED' : 'QUEUED',
        retrySeconds, retrySeconds || 0, redemptionUid], executor,
    );
  }

  async clearSync(redemptionUid, executor) {
    await execute(
      `UPDATE \`tokenRedemption\` SET \`syncStatus\`='IDLE',\`syncCompletedAt\`=UTC_TIMESTAMP(3),
       \`nextSyncAt\`=NULL,\`errorStage\`=NULL,\`errorCode\`=NULL,\`errorMessage\`=NULL,
       \`updatedAt\`=UTC_TIMESTAMP(3) WHERE \`redemptionUid\`=?`, [redemptionUid], executor,
    );
  }

  async listRecoveryCandidates(limit = 50, executor) {
    return execute(
      `SELECT * FROM \`tokenRedemption\` WHERE \`status\` NOT IN
       ('PENDING_INVESTOR_AUTHORIZATION','PENDING_ISSUER_APPROVAL','COMPLETED','ISSUER_REJECTED','CANCELLED','EXPIRED','MANUAL_REVIEW')
       AND \`isDeleted\`=0 AND (\`syncStatus\` IN ('IDLE','QUEUED','FAILED') OR
       (\`syncStatus\`='PROCESSING' AND \`syncStartedAt\`<DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 5 MINUTE)))
       AND (\`nextSyncAt\` IS NULL OR \`nextSyncAt\`<=UTC_TIMESTAMP(3))
       ORDER BY (\`syncStatus\`='QUEUED') DESC,\`createdAt\` LIMIT ?`,
      [Math.max(1, Math.trunc(limit))], executor,
    );
  }

  async expireUnsigned(limit = 50, executor) {
    const result = await execute(
      `UPDATE \`tokenRedemption\` SET \`status\`='EXPIRED',\`expiredAt\`=UTC_TIMESTAMP(3),
       \`syncStatus\`='IDLE',\`nextSyncAt\`=NULL,\`updatedAt\`=UTC_TIMESTAMP(3)
       WHERE \`status\`='PENDING_INVESTOR_AUTHORIZATION' AND \`authorizationSignature\` IS NULL
       AND \`expiresAt\`<=UTC_TIMESTAMP(3) AND \`isDeleted\`=0 ORDER BY \`expiresAt\` LIMIT ?`,
      [Math.max(1, Math.trunc(limit))], executor,
    );
    return result.affectedRows;
  }

  async storePaymentEvents(events, executor) {
    for (const event of events) {
      await execute(
        `INSERT INTO \`tokenRedemptionPaymentEvent\`
         (\`redemptionPaymentEventUid\`,\`chainId\`,\`usdtContractAddress\`,\`fromWalletAddress\`,
          \`toWalletAddress\`,\`amountRaw\`,\`txHash\`,\`blockNumber\`,\`blockHash\`,\`transactionIndex\`,\`logIndex\`)
         VALUES (?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE \`blockHash\`=VALUES(\`blockHash\`),
          \`isCanonical\`=TRUE,\`updatedAt\`=UTC_TIMESTAMP(3)`,
        [createUid(), event.chainId, event.usdtContractAddress, event.fromWalletAddress,
          event.toWalletAddress, event.amountRaw, event.txHash, event.blockNumber, event.blockHash,
          event.transactionIndex, event.logIndex], executor,
      );
    }
  }

  async listPaymentEvents(chainId, limit = 200, executor) {
    return execute(
      `SELECT * FROM \`tokenRedemptionPaymentEvent\` WHERE \`chainId\`=? AND \`isCanonical\`=1
       AND \`processingStatus\` IN ('NEW','UNMATCHED','FAILED') AND \`processingAttempts\`<20
       ORDER BY \`blockNumber\`,\`logIndex\` LIMIT ?`,
      [chainId, Math.max(1, Math.trunc(limit))], executor,
    );
  }

  async findPendingForPaymentEvent(event, executor) {
    const rows = await execute(
      `SELECT * FROM \`tokenRedemption\` WHERE \`chainId\`=? AND LOWER(\`usdtContractAddress\`)=LOWER(?)
       AND LOWER(\`issuerPaymentWalletAddress\`)=LOWER(?) AND LOWER(\`investorWalletAddress\`)=LOWER(?)
       AND \`usdtAmountRaw\`=? AND \`status\` IN ('TOKENS_LOCKED','PAYMENT_SUBMITTED')
       AND \`paymentStatus\` IN ('AWAITING_ISSUER','SUBMITTED') AND \`isDeleted\`=0
       AND (\`paymentRequestedAtBlock\` IS NULL OR \`paymentRequestedAtBlock\`<=?)
       ORDER BY \`createdAt\` LIMIT 1`,
      [event.chainId, event.usdtContractAddress, event.fromWalletAddress, event.toWalletAddress,
        event.amountRaw, event.blockNumber], executor,
    );
    return rows[0] || null;
  }

  async markPaymentEvent(uid, status, redemptionUid, message, executor) {
    await execute(
      `UPDATE \`tokenRedemptionPaymentEvent\` SET \`processingStatus\`=?,\`matchedRedemptionUid\`=?,
       \`processingAttempts\`=\`processingAttempts\`+1,\`processingMessage\`=?,\`processedAt\`=UTC_TIMESTAMP(3),
       \`updatedAt\`=UTC_TIMESTAMP(3) WHERE \`redemptionPaymentEventUid\`=?`,
      [status, redemptionUid || null, message ? String(message).slice(0, 2000) : null, uid], executor,
    );
  }

  async earliestPaymentBlock(executor) {
    const rows = await execute(
      `SELECT MIN(\`paymentRequestedAtBlock\`) AS \`blockNumber\` FROM \`tokenRedemption\`
       WHERE \`status\` IN ('TOKENS_LOCKED','PAYMENT_SUBMITTED') AND \`isDeleted\`=0`, [], executor,
    );
    return Number(rows[0]?.blockNumber || 0);
  }
}

module.exports = { TokenRedemptionRepository, TERMINAL_STATUSES };
