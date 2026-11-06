const { execute } = require('../database/connection');
const { createUid } = require('../utils/token');
const { sqlInteger } = require('../utils/sql');
const { ApiError } = require('../core/errors/api-error');
const { ethers } = require('ethers');

class TokenPriceUpdateRepository {
  async prepareDirect(data, executor) {
    await execute('SELECT tokenUid FROM tokenMaster WHERE tokenUid=? FOR UPDATE', [data.tokenUid], executor);
    const [active] = await execute(`SELECT * FROM tokenPriceUpdate WHERE tokenUid=? AND chainUid=?
      AND submissionMode='DIRECT' AND status IN ('PENDING','SUBMITTED') AND isDeleted=0 FOR UPDATE`,
    [data.tokenUid, data.chainUid], executor);
    if (active) {
      if (active.newPriceRaw !== data.newPriceRaw) throw ApiError.conflict('Complete the existing pending price update before preparing another price.');
      return active;
    }
    const [cancelled] = await execute(`SELECT * FROM tokenPriceUpdate WHERE tokenUid=? AND chainUid=?
      AND submissionMode='DIRECT' AND status IN ('CANCELLED','EXPIRED')
      AND directTransactionNonce=? AND newPriceRaw=? AND isDeleted=0 FOR UPDATE`,
    [data.tokenUid,data.chainUid,data.directTransactionNonce,data.newPriceRaw], executor);
    if (cancelled) {
      await execute("UPDATE tokenPriceUpdate SET status='PENDING',errorCode=NULL,errorMessage=NULL,updatedAt=UTC_TIMESTAMP(3) WHERE priceUpdateUid=?", [cancelled.priceUpdateUid], executor);
      return this.findByUid(cancelled.priceUpdateUid, executor);
    }
    const priceUpdateUid = createUid();
    await execute(`INSERT INTO tokenPriceUpdate
      (priceUpdateUid,chainUid,chainId,tokenUid,organizationUid,issuerUserUid,controllerAddress,
       tokenAddress,issuerWalletAddress,submissionMode,priceDecimals,newPriceRaw,newPriceFormatted,
       directTransactionNonce,preparedAtBlock,oldPriceRaw,oldPriceFormatted,status,isCanonical)
      VALUES (?,?,?,?,?,?,?,?,?,'DIRECT',?,?,?,?,?,?,?,'PENDING',FALSE)`,
    [priceUpdateUid,data.chainUid,data.chainId,data.tokenUid,data.organizationUid,data.issuerUserUid,
      data.controllerAddress,data.tokenAddress,data.issuerWalletAddress,data.priceDecimals,data.newPriceRaw,
      data.newPriceFormatted,data.directTransactionNonce,data.preparedAtBlock,
      data.oldPriceRaw,data.oldPriceFormatted], executor);
    return this.findByUid(priceUpdateUid, executor);
  }

  async recordDirectHash(data, executor) {
    await execute('SELECT tokenUid FROM tokenMaster WHERE tokenUid=? FOR UPDATE', [data.tokenUid], executor);
    const [record] = await execute('SELECT * FROM tokenPriceUpdate WHERE priceUpdateUid=? AND isDeleted=0 FOR UPDATE', [data.priceUpdateUid], executor);
    if (!record || record.tokenUid !== data.tokenUid) throw ApiError.notFound('Price update was not found.');
    if (record.transactionHash && record.transactionHash.toLowerCase() !== data.transactionHash.toLowerCase()) {
      throw ApiError.conflict('This price update already has a different transaction hash.');
    }
    if (record.status === 'CONFIRMED') return record;
    await execute(`UPDATE tokenPriceUpdate SET transactionHash=?,status='SUBMITTED',
      submittedAt=COALESCE(submittedAt,UTC_TIMESTAMP(3)),updatedAt=UTC_TIMESTAMP(3) WHERE priceUpdateUid=?`,
    [data.transactionHash, data.priceUpdateUid], executor);
    return this.findByUid(data.priceUpdateUid, executor);
  }

  async cancelDirect(record, executor) {
    await execute('SELECT tokenUid FROM tokenMaster WHERE tokenUid=? FOR UPDATE', [record.tokenUid], executor);
    const current = await this.findByUid(record.priceUpdateUid, executor);
    if (current && ['CANCELLED','EXPIRED','CONFIRMED'].includes(current.status)) return current;
    const result = await execute(`UPDATE tokenPriceUpdate SET status='CANCELLED',errorCode='USER_CANCELLED',
      errorMessage='Issuer cancelled the unsigned request.' WHERE priceUpdateUid=?
      AND submissionMode='DIRECT' AND status='PENDING' AND transactionHash IS NULL AND isDeleted=0`,
    [record.priceUpdateUid], executor);
    if (!result.affectedRows) throw ApiError.conflict('Only a pending request without a recorded transaction hash can be cancelled.');
    return this.findByUid(record.priceUpdateUid, executor);
  }
  async createLegacy({ token, issuerUserUid, issuerWalletAddress, oldPrice, newPrice }, executor) {
    await execute(`INSERT INTO tokenPriceUpdate
      (priceUpdateUid,chainUid,chainId,tokenUid,organizationUid,issuerUserUid,tokenAddress,issuerWalletAddress,
       submissionMode,priceDecimals,oldPriceFormatted,newPriceFormatted,status,isCanonical)
      SELECT ?,c.chainUid,c.chainId,?,?,?,?,?,'LEGACY',NULL,?,?,'APPLIED',FALSE
      FROM chainMaster c WHERE c.chainUid=? AND c.isDeleted=0`,
    [createUid(), token.tokenUid, token.organizationUid, issuerUserUid, token.tokenAddress, issuerWalletAddress,
      oldPrice, newPrice, token.chainUid], executor).then((result) => {
      if (result.affectedRows !== 1) throw new Error('Price history chain was not found.');
    });
  }

  async listHistory(tokenUid, organizationUid, chainUid, options, executor) {
    const order = require('../utils/admin-sort').orderBy(options, {
      createdAt: 'createdAt', submittedAt: 'submittedAt', confirmedAt: 'confirmedAt', status: 'status',
      oldPriceFormatted: 'oldPriceFormatted', newPriceFormatted: 'newPriceFormatted', blockNumber: 'blockNumber',
    }, 'createdAt DESC,priceUpdateUid DESC', 'priceUpdateUid');
    const conditions = ['tokenUid=?', 'organizationUid=?', 'chainUid=?', 'isDeleted=0'];
    const params = [tokenUid, organizationUid, chainUid];
    if (options.status && options.status !== 'all') { conditions.push('status=?'); params.push(options.status); }
    if (options.source === 'legacy') conditions.push("submissionMode='LEGACY'");
    if (options.source === 'blockchain') conditions.push("submissionMode<>'LEGACY'");
    if (options.source === 'manual') conditions.push("updateType='Manual'");
    if (options.source === 'automated') conditions.push("updateType='Automated (bot)'");
    if (options.search) {
      conditions.push('(transactionHash LIKE ? OR tokenAddress LIKE ? OR CAST(newPriceFormatted AS CHAR) LIKE ?)');
      params.push(...Array(3).fill(`%${options.search}%`));
    }
    const where = conditions.join(' AND ');
    const page = options.page || 1;
    const limit = options.limit || 20;
    const [count] = await execute(`SELECT COUNT(*) AS total FROM tokenPriceUpdate WHERE ${where}`, params, executor);
    const rows = await execute(`SELECT priceUpdateUid,tokenUid,chainId,tokenAddress,updateType AS submissionMode,updateType,
      CASE WHEN submissionMode='RELAYED' THEN serviceWalletAddress
        WHEN submissionMode IN ('DIRECT','LEGACY') THEN issuerWalletAddress
        ELSE NULL END AS updatedByWalletAddress,
      isLegacyUpdate,isOnchainUpdate,status,priceDecimals,oldPriceRaw,newPriceRaw,
      CAST(oldPriceFormatted AS CHAR) AS oldPriceFormatted,CAST(newPriceFormatted AS CHAR) AS newPriceFormatted,
      transactionHash,blockNumber,blockHash,logIndex,submittedAt,confirmedAt,createdAt,updatedAt,errorCode,errorMessage
      FROM tokenPriceUpdate WHERE ${where} ORDER BY ${order}
      LIMIT ${sqlInteger(limit, { min: 1 })} OFFSET ${sqlInteger((page - 1) * limit)}`, params, executor);
    return { rows, pagination: { page, limit, total: Number(count.total), totalPages: Math.ceil(Number(count.total) / limit) } };
  }

  async findByUid(priceUpdateUid, executor) {
    const rows = await execute(
      `SELECT p.*, t.\`tokenName\`, t.\`tokenSymbol\`, c.\`chainName\`, c.\`explorerUrl\`
       FROM \`tokenPriceUpdate\` p
       INNER JOIN \`tokenMaster\` t ON t.\`tokenUid\`=p.\`tokenUid\`
       INNER JOIN \`chainMaster\` c ON c.\`chainUid\`=p.\`chainUid\`
       WHERE p.\`priceUpdateUid\`=? AND p.\`isDeleted\`=0 LIMIT 1`,
      [priceUpdateUid], executor,
    );
    return rows[0] || null;
  }

  async findBySignerNonce(chainId, serviceWalletAddress, signerNonce, executor) {
    const rows = await execute(
      `SELECT * FROM \`tokenPriceUpdate\`
       WHERE \`chainId\`=? AND LOWER(\`serviceWalletAddress\`)=LOWER(?) AND \`signerNonce\`=?
         AND \`isDeleted\`=0 LIMIT 1`,
      [chainId, serviceWalletAddress, String(signerNonce)], executor,
    );
    return rows[0] || null;
  }

  async findByTransactionHash(chainId, transactionHash, executor) {
    const rows = await execute(
      `SELECT * FROM \`tokenPriceUpdate\`
       WHERE \`chainId\`=? AND LOWER(\`transactionHash\`)=LOWER(?) AND \`isDeleted\`=0 LIMIT 1`,
      [chainId, transactionHash], executor,
    );
    return rows[0] || null;
  }

  async findPendingByRelayCall(data, executor) {
    const rows = await execute(
      `SELECT * FROM \`tokenPriceUpdate\`
       WHERE \`chainId\`=? AND LOWER(\`tokenAddress\`)=LOWER(?) AND \`newPriceRaw\`=?
         AND \`signatureDeadline\`=? AND \`signatureV\`=?
         AND LOWER(\`signatureR\`)=LOWER(?) AND LOWER(\`signatureS\`)=LOWER(?)
         AND \`status\` IN ('PENDING','SUBMITTED') AND \`isDeleted\`=0
       ORDER BY \`createdAt\` DESC LIMIT 1`,
      [
        data.chainId, data.tokenAddress, String(data.newPriceRaw), Number(data.signatureDeadline),
        Number(data.signatureV), data.signatureR, data.signatureS,
      ], executor,
    );
    return rows[0] || null;
  }

  async countRecent(chainId, serviceWalletAddress, windowSeconds, executor) {
    const windowSql = sqlInteger(Math.max(1, Math.trunc(windowSeconds)), { min: 1, name: 'windowSeconds' });
    const rows = await execute(
      `SELECT COUNT(*) AS \`total\` FROM \`tokenPriceUpdate\`
       WHERE \`chainId\`=? AND LOWER(\`serviceWalletAddress\`)=LOWER(?)
         AND \`createdAt\` >= DATE_SUB(UTC_TIMESTAMP(3), INTERVAL ${windowSql} SECOND)
         AND \`isDeleted\`=0`,
      [chainId, serviceWalletAddress], executor,
    );
    return Number(rows[0]?.total || 0);
  }

  async createPending(data, executor) {
    const priceUpdateUid = createUid();
    await execute(
      `INSERT INTO \`tokenPriceUpdate\`
        (\`priceUpdateUid\`,\`chainUid\`,\`chainId\`,\`tokenUid\`,\`organizationUid\`,\`issuerUserUid\`,
         \`controllerAddress\`,\`tokenAddress\`,\`issuerWalletAddress\`,\`serviceWalletAddress\`,
         \`submissionMode\`,\`priceDecimals\`,\`oldPriceRaw\`,\`newPriceRaw\`,\`newPriceFormatted\`,
         \`signerNonce\`,\`signatureDeadline\`,\`signatureV\`,\`signatureR\`,\`signatureS\`,\`status\`)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'RELAYED', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')`,
      [
        priceUpdateUid, data.chainUid, data.chainId, data.tokenUid, data.organizationUid,
        data.issuerUserUid || null, data.controllerAddress, data.tokenAddress,
        data.issuerWalletAddress, data.serviceWalletAddress, data.priceDecimals,
        data.oldPriceRaw || null, String(data.newPriceRaw), data.newPriceFormatted,
        String(data.signerNonce), Number(data.signatureDeadline), Number(data.signatureV),
        data.signatureR, data.signatureS,
      ], executor,
    );
    return this.findByUid(priceUpdateUid, executor);
  }

  async markSubmitted(priceUpdateUid, transactionHash, executor) {
    await execute(
      `UPDATE \`tokenPriceUpdate\` SET \`status\`='SUBMITTED',\`transactionHash\`=?,
         \`submittedAt\`=UTC_TIMESTAMP(3),\`errorCode\`=NULL,\`errorMessage\`=NULL,
         \`updatedAt\`=UTC_TIMESTAMP(3)
       WHERE \`priceUpdateUid\`=? AND \`status\`='PENDING' AND \`isDeleted\`=0`,
      [transactionHash, priceUpdateUid], executor,
    );
    return this.findByUid(priceUpdateUid, executor);
  }

  async resetFailed(priceUpdateUid, executor) {
    await execute(
      `UPDATE \`tokenPriceUpdate\` SET \`status\`='PENDING',\`errorCode\`=NULL,\`errorMessage\`=NULL,
         \`updatedAt\`=UTC_TIMESTAMP(3)
       WHERE \`priceUpdateUid\`=? AND \`status\`='FAILED' AND \`transactionHash\` IS NULL AND \`isDeleted\`=0`,
      [priceUpdateUid], executor,
    );
    return this.findByUid(priceUpdateUid, executor);
  }

  async markFailed(priceUpdateUid, errorCode, errorMessage, executor) {
    await execute(
      `UPDATE \`tokenPriceUpdate\` SET \`status\`='FAILED',\`errorCode\`=?,\`errorMessage\`=?,
         \`updatedAt\`=UTC_TIMESTAMP(3)
       WHERE \`priceUpdateUid\`=? AND \`status\` IN ('PENDING','SUBMITTED') AND \`isDeleted\`=0`,
      [errorCode, String(errorMessage || '').slice(0, 2000), priceUpdateUid], executor,
    );
    return this.findByUid(priceUpdateUid, executor);
  }

  async confirmEvent(data, executor) {
    // Both the HTTP verifier and indexer call this inside a transaction. Serialize by token.
    await execute('SELECT tokenUid FROM tokenMaster WHERE tokenUid=? FOR UPDATE', [data.tokenUid], executor);
    // Locking reads see a concurrently committed row even under MySQL REPEATABLE READ.
    let [existing] = await execute(data.matchedPriceUpdateUid
      ? 'SELECT * FROM tokenPriceUpdate WHERE priceUpdateUid=? AND isDeleted=0 FOR UPDATE'
      : 'SELECT * FROM tokenPriceUpdate WHERE chainId=? AND transactionHash=? AND isDeleted=0 FOR UPDATE',
    data.matchedPriceUpdateUid ? [data.matchedPriceUpdateUid] : [data.chainId, data.transactionHash], executor);
    // Correlate a missing frontend callback by the pinned wallet nonce, never by price/time alone.
    if (!existing && data.submissionMode === 'DIRECT' && data.directTransactionNonce != null) {
      const candidates = await execute(`SELECT * FROM tokenPriceUpdate WHERE tokenUid=? AND chainUid=?
        AND submissionMode='DIRECT' AND directTransactionNonce=? AND LOWER(issuerWalletAddress)=LOWER(?)
        AND LOWER(controllerAddress)=LOWER(?) AND newPriceRaw=? AND preparedAtBlock<=?
        AND (status IN ('PENDING','SUBMITTED','EXPIRED') OR (status='CANCELLED' AND errorCode='USER_CANCELLED')) AND isDeleted=0 FOR UPDATE`,
      [data.tokenUid,data.chainUid,data.directTransactionNonce,data.issuerWalletAddress,data.controllerAddress,
        String(data.newPriceRaw),data.blockNumber], executor);
      if (candidates.length > 1) throw new Error('Ambiguous direct price intent; reconciliation requires review.');
      [existing] = candidates;
    }
    if (existing) {
      if (existing.tokenUid !== data.tokenUid || existing.chainUid !== data.chainUid) {
        throw new Error('Price transaction is already associated with another token.');
      }
      await execute(
        `UPDATE \`tokenPriceUpdate\` SET \`status\`='CONFIRMED',\`transactionHash\`=?,\`oldPriceRaw\`=?,\`newPriceRaw\`=?,
           \`newPriceFormatted\`=?,\`oldPriceFormatted\`=?,\`blockNumber\`=?,\`blockHash\`=?,\`transactionIndex\`=?,\`logIndex\`=?,
           \`gasUsed\`=?,\`effectiveGasPrice\`=?,\`confirmedAt\`=?,\`isCanonical\`=TRUE,
           \`submissionMode\`=IF(\`submissionMode\`='INDEXED' AND ?='DIRECT','DIRECT',\`submissionMode\`),
           \`errorCode\`=NULL,\`errorMessage\`=NULL,\`updatedAt\`=UTC_TIMESTAMP(3)
         WHERE \`priceUpdateUid\`=?`,
        [
          data.transactionHash, String(data.oldPriceRaw), String(data.newPriceRaw), data.newPriceFormatted,
          data.priceDecimals != null ? ethers.formatUnits(data.oldPriceRaw, Number(data.priceDecimals)) : null,
          data.blockNumber, data.blockHash, data.transactionIndex, data.logIndex,
          data.gasUsed || null, data.effectiveGasPrice || null, data.confirmedAt,
          data.submissionMode || 'INDEXED', existing.priceUpdateUid,
        ], executor,
      );
      await this.applyConfirmedPrice(data, executor);
      return this.findByUid(existing.priceUpdateUid, executor);
    }
    const priceUpdateUid = createUid();
    await execute(
      `INSERT INTO \`tokenPriceUpdate\`
        (\`priceUpdateUid\`,\`chainUid\`,\`chainId\`,\`tokenUid\`,\`organizationUid\`,\`issuerUserUid\`,
         \`controllerAddress\`,\`tokenAddress\`,\`issuerWalletAddress\`,\`serviceWalletAddress\`,
         \`submissionMode\`,\`priceDecimals\`,\`oldPriceRaw\`,\`newPriceRaw\`,\`newPriceFormatted\`,
         \`status\`,\`transactionHash\`,\`blockNumber\`,\`blockHash\`,\`transactionIndex\`,\`logIndex\`,
         \`gasUsed\`,\`effectiveGasPrice\`,\`confirmedAt\`,\`isCanonical\`)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, 'CONFIRMED', ?, ?, ?, ?, ?, ?, ?, ?, TRUE)`,
      [
        priceUpdateUid, data.chainUid, data.chainId, data.tokenUid, data.organizationUid,
        data.issuerUserUid || null, data.controllerAddress, data.tokenAddress,
        data.issuerWalletAddress, ['DIRECT', 'RELAYED'].includes(data.submissionMode) ? data.submissionMode : 'INDEXED',
        data.priceDecimals, String(data.oldPriceRaw), String(data.newPriceRaw),
        data.newPriceFormatted, data.transactionHash, data.blockNumber, data.blockHash,
        data.transactionIndex, data.logIndex, data.gasUsed || null, data.effectiveGasPrice || null,
        data.confirmedAt,
      ], executor,
    );
    await this.applyConfirmedPrice(data, executor);
    return this.findByUid(priceUpdateUid, executor);
  }

  async applyConfirmedPrice(data, executor) {
    // Replaying an older transaction must not overwrite a newer confirmed price.
    return execute(`UPDATE tokenMaster SET currentTokenPrice=?,updatedAt=UTC_TIMESTAMP(3)
      WHERE tokenUid=? AND NOT EXISTS (SELECT 1 FROM tokenPriceUpdate p
        WHERE p.tokenUid=? AND p.chainUid=? AND p.isDeleted=0 AND p.isCanonical=1 AND p.status='CONFIRMED'
          AND (p.blockNumber>? OR (p.blockNumber=? AND p.logIndex>?)))`,
    [data.newPriceFormatted, data.tokenUid, data.tokenUid, data.chainUid,
      data.blockNumber, data.blockNumber, data.logIndex], executor);
  }

  async markOrphanedFromBlock(chainId, blockNumber, executor) {
    return execute(
      `UPDATE \`tokenPriceUpdate\` SET \`status\`='ORPHANED',\`isCanonical\`=FALSE,\`confirmedAt\`=NULL,
         \`errorCode\`='CHAIN_REORGANIZATION',
         \`errorMessage\`='Previously indexed Platform Controller event is no longer canonical.',
         \`updatedAt\`=UTC_TIMESTAMP(3)
       WHERE \`chainId\`=? AND \`blockNumber\`>=? AND \`isDeleted\`=0`,
      [chainId, blockNumber], executor,
    );
  }

  async expireUnsignedPending(chainId, executor) {
    // Local expiry is not proof of blockchain failure. Late events can still confirm it.
    await execute(`UPDATE tokenPriceUpdate SET status='EXPIRED',errorCode='PRICE_REQUEST_EXPIRED',
      errorMessage='No transaction hash was recorded before the pending request timeout.',updatedAt=UTC_TIMESTAMP(3)
      WHERE chainId=? AND submissionMode='DIRECT' AND status='PENDING' AND transactionHash IS NULL
      AND isDeleted=0 AND updatedAt < DATE_SUB(UTC_TIMESTAMP(3), INTERVAL
        COALESCE((SELECT CASE WHEN settingValue REGEXP '^[0-9]+$' AND CAST(settingValue AS UNSIGNED) BETWEEN 60 AND 604800
          THEN CAST(settingValue AS UNSIGNED) ELSE 1800 END FROM generalSettings
          WHERE settingKey='TokenPriceManualPendingExpirySeconds' LIMIT 1),1800) SECOND)`, [chainId], executor);
    return execute(
      `UPDATE \`tokenPriceUpdate\` SET \`status\`='FAILED',\`errorCode\`='PRICE_SIGNATURE_EXPIRED',
         \`errorMessage\`='The signed request expired before a transaction hash was recorded.',
         \`updatedAt\`=UTC_TIMESTAMP(3)
       WHERE \`chainId\`=? AND \`status\`='PENDING' AND \`transactionHash\` IS NULL
         AND \`signatureDeadline\` < UNIX_TIMESTAMP(UTC_TIMESTAMP()) AND \`isDeleted\`=0`,
      [chainId], executor,
    );
  }

  async listSubmitted(chainId, limit = 100, executor) {
    const limitSql = sqlInteger(Math.max(1, Math.trunc(limit)), { min: 1, name: 'limit' });
    return execute(
      `SELECT * FROM \`tokenPriceUpdate\` WHERE \`chainId\`=? AND \`status\`='SUBMITTED'
         AND \`transactionHash\` IS NOT NULL AND \`isDeleted\`=0
       ORDER BY \`submittedAt\` ASC LIMIT ${limitSql}`,
      [chainId], executor,
    );
  }
}

module.exports = { TokenPriceUpdateRepository };
