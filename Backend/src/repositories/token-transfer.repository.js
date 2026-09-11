const { execute } = require('../database/connection');
const { createUid } = require('../utils/token');
const { sqlInteger } = require('../utils/sql');

class TokenTransferRepository {
  async findContext(senderUserUid, tokenUid, recipientWalletAddress, executor) {
    const rows = await execute(
      `SELECT si.interestUid AS senderInterestUid, si.status AS senderInterestStatus,
              si.organizationUid, si.investorUid AS senderInvestorUid,
              si.investorUserUid AS senderUserUid,
              sender.walletAddress AS senderWalletAddress,
              sender.contractAddress AS senderIdentityAddress,
              sender.status AS senderProfileStatus, sender.isActive AS senderProfileActive,
              recipient.investorUid AS recipientInvestorUid,
              recipient.userUid AS recipientUserUid,
              recipient.walletAddress AS recipientWalletAddress,
              recipient.contractAddress AS recipientIdentityAddress,
              recipient.status AS recipientProfileStatus,
              recipient.isActive AS recipientProfileActive,
              ri.interestUid AS recipientInterestUid,
              ri.status AS recipientInterestStatus,
              recipientUser.fullName AS recipientName,
              recipientUser.email AS recipientEmail,
              t.tokenUid, t.tokenAddress, t.identityRegistryAddress,
              t.decimals AS tokenDecimals,
              CAST(COALESCE(t.currentTokenPrice,t.initialTokenPrice) AS CHAR) AS tokenPrice,
              CAST(t.maxBalancePerInvestor AS CHAR) AS maxBalancePerInvestor,
              t.status AS tokenStatus, t.isActive AS tokenActive
       FROM tokenInvestmentInterest si
       INNER JOIN investorMaster sender
         ON sender.investorUid=si.investorUid AND sender.isDeleted=0
       INNER JOIN tokenMaster t ON t.tokenUid=si.tokenUid AND t.isDeleted=0
       LEFT JOIN investorMaster recipient
         ON LOWER(TRIM(recipient.walletAddress))=LOWER(TRIM(?)) AND recipient.isDeleted=0
       LEFT JOIN userMaster recipientUser
         ON recipientUser.userUid=recipient.userUid AND recipientUser.isDeleted=0
       LEFT JOIN tokenInvestmentInterest ri
         ON ri.tokenUid=t.tokenUid AND ri.investorUid=recipient.investorUid AND ri.isDeleted=0
       WHERE si.investorUserUid=? AND si.tokenUid=? AND si.isDeleted=0 LIMIT 1`,
      [recipientWalletAddress, senderUserUid, tokenUid], executor,
    );
    return rows[0] || null;
  }

  async findByUid(transferUid, executor) {
    const rows = await execute(
      'SELECT * FROM tokenTransfer WHERE transferUid=? AND isDeleted=0 LIMIT 1',
      [transferUid], executor,
    );
    return rows[0] || null;
  }

  async findAccessibleByUid(transferUid, userUid, executor) {
    const rows = await execute(
      `SELECT * FROM tokenTransfer WHERE transferUid=?
       AND (senderUserUid=? OR recipientUserUid=?) AND isDeleted=0 LIMIT 1`,
      [transferUid, userUid, userUid], executor,
    );
    return rows[0] || null;
  }

  async findSenderOwnedByUid(transferUid, userUid, executor) {
    const rows = await execute(
      `SELECT * FROM tokenTransfer WHERE transferUid=?
       AND senderUserUid=? AND isDeleted=0 LIMIT 1`,
      [transferUid, userUid], executor,
    );
    return rows[0] || null;
  }

  async findByIdempotency(userUid, idempotencyKey, executor) {
    const rows = await execute(
      `SELECT * FROM tokenTransfer WHERE senderUserUid=?
       AND idempotencyKey=? AND isDeleted=0 LIMIT 1`,
      [userUid, idempotencyKey], executor,
    );
    return rows[0] || null;
  }

  async findActiveBySenderToken(senderWalletAddress, tokenAddress, executor) {
    const rows = await execute(
      `SELECT * FROM tokenTransfer WHERE LOWER(senderWalletAddress)=LOWER(?)
       AND LOWER(tokenAddress)=LOWER(?) AND status='PENDING_TRANSFER'
       AND isDeleted=0 LIMIT 1`,
      [senderWalletAddress, tokenAddress], executor,
    );
    return rows[0] || null;
  }

  async findByTxHash(txHash, executor) {
    const rows = await execute(
      'SELECT * FROM tokenTransfer WHERE LOWER(txHash)=LOWER(?) AND isDeleted=0 LIMIT 1',
      [txHash], executor,
    );
    return rows[0] || null;
  }

  async sumPendingIncomingRaw(tokenAddress, recipientWalletAddress, executor) {
    const rows = await execute(
      `SELECT COALESCE(SUM(CAST(tokenAmountRaw AS DECIMAL(65,0))),0) AS total
       FROM tokenTransfer WHERE LOWER(tokenAddress)=LOWER(?)
       AND LOWER(recipientWalletAddress)=LOWER(?) AND status='PENDING_TRANSFER'
       AND isDeleted=0`,
      [tokenAddress, recipientWalletAddress], executor,
    );
    return String(rows[0]?.total || '0');
  }

  async create(data, executor) {
    const transferUid = createUid();
    await execute(
      `INSERT INTO tokenTransfer
        (transferUid,tokenUid,organizationUid,senderInterestUid,recipientInterestUid,
         senderInvestorUid,recipientInvestorUid,senderUserUid,recipientUserUid,
         idempotencyKey,chainId,tokenAddress,identityRegistryAddress,
         senderWalletAddress,recipientWalletAddress,senderIdentityAddress,
         recipientIdentityAddress,tokenDecimals,tokenPrice,tokenAmount,tokenAmountRaw,
         senderBalanceBeforeRaw,recipientBalanceBeforeRaw,senderFrozenBeforeRaw,
         preparedAtBlock,expiresAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [transferUid, data.tokenUid, data.organizationUid, data.senderInterestUid, data.recipientInterestUid,
        data.senderInvestorUid, data.recipientInvestorUid, data.senderUserUid, data.recipientUserUid,
        data.idempotencyKey, data.chainId, data.tokenAddress, data.identityRegistryAddress,
        data.senderWalletAddress, data.recipientWalletAddress, data.senderIdentityAddress,
        data.recipientIdentityAddress, data.tokenDecimals, data.tokenPrice, data.tokenAmount, data.tokenAmountRaw,
        data.senderBalanceBeforeRaw, data.recipientBalanceBeforeRaw, data.senderFrozenBeforeRaw,
        data.preparedAtBlock, data.expiresAt], executor,
    );
    return this.findByUid(transferUid, executor);
  }

  async listAccessibleByToken(userUid, tokenUid, {
    page = 1, limit = 20, search = '', status = 'all', direction = 'all',
  } = {}, executor) {
    const safePage = Math.max(1, Math.trunc(page));
    const safeLimit = Math.min(100, Math.max(1, Math.trunc(limit)));
    const offset = (safePage - 1) * safeLimit;
    const limitSql = sqlInteger(safeLimit, { min: 1, name: 'limit' });
    const offsetSql = sqlInteger(offset, { name: 'offset' });
    const conditions = ['tokenUid=?', 'isDeleted=0'];
    const params = [tokenUid];
    if (direction === 'sent') { conditions.push('senderUserUid=?'); params.push(userUid); }
    else if (direction === 'received') { conditions.push('recipientUserUid=?'); params.push(userUid); }
    else { conditions.push('(senderUserUid=? OR recipientUserUid=?)'); params.push(userUid, userUid); }
    if (status !== 'all') { conditions.push('status=?'); params.push(status); }
    const normalizedSearch = String(search || '').trim().toLowerCase();
    if (normalizedSearch) {
      const pattern = `%${normalizedSearch}%`;
      conditions.push(`(LOWER(transferUid) LIKE ? OR LOWER(idempotencyKey) LIKE ?
        OR LOWER(COALESCE(txHash,'')) LIKE ? OR LOWER(tokenAddress) LIKE ?
        OR LOWER(senderWalletAddress) LIKE ? OR LOWER(recipientWalletAddress) LIKE ?
        OR CAST(tokenAmount AS CHAR) LIKE ?)`);
      params.push(pattern, pattern, pattern, pattern, pattern, pattern, pattern);
    }
    const where = conditions.join(' AND ');
    const [rows, countRows] = await Promise.all([
      execute(`SELECT * FROM tokenTransfer WHERE ${where}
        ORDER BY createdAt DESC,transferUid DESC LIMIT ${limitSql} OFFSET ${offsetSql}`, params, executor),
      execute(`SELECT COUNT(*) AS total FROM tokenTransfer WHERE ${where}`, params, executor),
    ]);
    return { rows, total: Number(countRows[0]?.total || 0) };
  }

  async assignHash(transferUid, txHash, allowReplacement = false, executor) {
    await execute(
      `UPDATE tokenTransfer SET txHash=?,txHashReceivedAt=UTC_TIMESTAMP(3),
       syncStatus='QUEUED',syncRequestedAt=UTC_TIMESTAMP(3),nextSyncAt=UTC_TIMESTAMP(3),
       errorCode=NULL,errorMessage=NULL,updatedAt=UTC_TIMESTAMP(3)
       WHERE transferUid=? AND status='PENDING_TRANSFER' AND isDeleted=0
       AND (txHash IS NULL OR LOWER(txHash)=LOWER(?) OR ?=1)`,
      [txHash.toLowerCase(), transferUid, txHash, allowReplacement ? 1 : 0], executor,
    );
    return this.findByUid(transferUid, executor);
  }

  async confirm(transferUid, data, executor) {
    const result = await execute(
      `UPDATE tokenTransfer SET status='COMPLETED',txHash=?,blockNumber=?,blockHash=?,
       transactionIndex=?,logIndex=?,gasUsed=?,effectiveGasPrice=?,senderBalanceAfterRaw=?,
       recipientBalanceAfterRaw=?,senderFrozenAfterRaw=?,verifiedAt=UTC_TIMESTAMP(3),
       syncStatus='IDLE',syncCompletedAt=UTC_TIMESTAMP(3),nextSyncAt=NULL,
       errorCode=NULL,errorMessage=NULL,updatedAt=UTC_TIMESTAMP(3)
       WHERE transferUid=? AND status='PENDING_TRANSFER' AND isDeleted=0`,
      [data.txHash, data.blockNumber, data.blockHash, data.transactionIndex, data.logIndex,
        data.gasUsed, data.effectiveGasPrice, data.senderBalanceAfterRaw,
        data.recipientBalanceAfterRaw, data.senderFrozenAfterRaw, transferUid], executor,
    );
    return result.affectedRows > 0;
  }

  async recordTransaction(transferUid, txHash, status, data = {}, executor) {
    await execute(
      `INSERT INTO tokenTransferTransaction
       (transferTransactionUid,transferUid,txHash,status,blockNumber,blockHash,
        transactionIndex,logIndex,gasUsed,effectiveGasPrice,errorCode,errorMessage,confirmedAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE status=VALUES(status),blockNumber=VALUES(blockNumber),
        blockHash=VALUES(blockHash),transactionIndex=VALUES(transactionIndex),
        logIndex=VALUES(logIndex),gasUsed=VALUES(gasUsed),
        effectiveGasPrice=VALUES(effectiveGasPrice),errorCode=VALUES(errorCode),
        errorMessage=VALUES(errorMessage),confirmedAt=VALUES(confirmedAt),updatedAt=UTC_TIMESTAMP(3)`,
      [createUid(), transferUid, txHash.toLowerCase(), status, data.blockNumber ?? null,
        data.blockHash ?? null, data.transactionIndex ?? null, data.logIndex ?? null,
        data.gasUsed ?? null, data.effectiveGasPrice ?? null, data.errorCode ?? null,
        data.errorMessage ? String(data.errorMessage).slice(0, 2000) : null,
        status === 'CONFIRMED' ? new Date() : null], executor,
    );
  }

  async listTransactions(transferUid, executor) {
    return execute(
      'SELECT * FROM tokenTransferTransaction WHERE transferUid=? ORDER BY createdAt,transferTransactionUid',
      [transferUid], executor,
    );
  }

  async recordError(transferUid, code, message, retrySeconds = 30, executor) {
    const retrySecondsSql = sqlInteger(retrySeconds == null ? 0 : retrySeconds, { name: 'retrySeconds' });
    await execute(
      `UPDATE tokenTransfer SET errorCode=?,errorMessage=?,syncStatus='FAILED',
       syncCompletedAt=UTC_TIMESTAMP(3),
       nextSyncAt=CASE WHEN ? IS NULL THEN NULL ELSE DATE_ADD(UTC_TIMESTAMP(3),INTERVAL ${retrySecondsSql} SECOND) END,
       updatedAt=UTC_TIMESTAMP(3) WHERE transferUid=? AND status='PENDING_TRANSFER'`,
      [code, String(message || '').slice(0, 2000), retrySeconds, transferUid], executor,
    );
  }

  async schedulePending(transferUid, retrySeconds = 30, executor) {
    const retrySecondsSql = sqlInteger(Math.max(1, Math.trunc(retrySeconds)), { min: 1, name: 'retrySeconds' });
    await execute(
      `UPDATE tokenTransfer SET syncStatus='QUEUED',syncCompletedAt=UTC_TIMESTAMP(3),
       nextSyncAt=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL ${retrySecondsSql} SECOND),
       errorCode=NULL,errorMessage=NULL,updatedAt=UTC_TIMESTAMP(3)
       WHERE transferUid=? AND status='PENDING_TRANSFER' AND isDeleted=0`,
      [transferUid], executor,
    );
    return this.findByUid(transferUid, executor);
  }

  async queue(transferUid, executor) {
    await execute(
      `UPDATE tokenTransfer SET syncStatus='QUEUED',syncRequestedAt=UTC_TIMESTAMP(3),
       nextSyncAt=UTC_TIMESTAMP(3),updatedAt=UTC_TIMESTAMP(3)
       WHERE transferUid=? AND status='PENDING_TRANSFER' AND isDeleted=0`,
      [transferUid], executor,
    );
    return this.findByUid(transferUid, executor);
  }

  async listRecoveryCandidates(limit = 50, executor) {
    const limitSql = sqlInteger(Math.max(1, Math.trunc(limit)), { min: 1, name: 'limit' });
    return execute(
      `SELECT * FROM tokenTransfer WHERE status='PENDING_TRANSFER' AND isDeleted=0
       AND (syncStatus IN ('IDLE','QUEUED','FAILED') OR
        (syncStatus='PROCESSING' AND syncStartedAt<DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 5 MINUTE)))
       AND NOT (syncStatus='FAILED' AND errorCode IS NOT NULL AND nextSyncAt IS NULL)
       AND (nextSyncAt IS NULL OR nextSyncAt<=UTC_TIMESTAMP(3))
       ORDER BY (syncStatus='QUEUED') DESC,createdAt ASC LIMIT ${limitSql}`,
      [], executor,
    );
  }

  async markProcessing(transferUid, executor) {
    const result = await execute(
      `UPDATE tokenTransfer SET syncStatus='PROCESSING',syncStartedAt=UTC_TIMESTAMP(3),
       syncAttempts=syncAttempts+1,nextSyncAt=NULL,updatedAt=UTC_TIMESTAMP(3)
       WHERE transferUid=? AND status='PENDING_TRANSFER' AND isDeleted=0
       AND NOT (syncStatus='FAILED' AND errorCode IS NOT NULL AND nextSyncAt IS NULL)
       AND (syncStatus IN ('IDLE','QUEUED','FAILED') OR
        (syncStatus='PROCESSING' AND syncStartedAt<DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 5 MINUTE)))`,
      [transferUid], executor,
    );
    return result.affectedRows > 0;
  }

  async listIndexedTokenAddresses(executor) {
    const rows = await execute(
      `SELECT DISTINCT LOWER(tokenAddress) AS tokenAddress FROM tokenMaster
       WHERE tokenAddress IS NOT NULL AND tokenAddress<>'' AND status='deployed'
       AND isActive=1 AND isDeleted=0 ORDER BY tokenAddress`, [], executor,
    );
    return rows.map((row) => row.tokenAddress);
  }

  async storeEvents(events, executor) {
    for (const event of events) {
      await execute(
        `INSERT INTO tokenTransferBlockchainEvent
         (transferEventUid,chainId,tokenAddress,fromWalletAddress,toWalletAddress,
          amountRaw,txHash,blockNumber,blockHash,transactionIndex,logIndex)
         VALUES (?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE blockHash=VALUES(blockHash),
          isCanonical=TRUE,updatedAt=UTC_TIMESTAMP(3)`,
        [createUid(), event.chainId, event.tokenAddress, event.fromWalletAddress, event.toWalletAddress,
          event.amountRaw, event.txHash, event.blockNumber, event.blockHash,
          event.transactionIndex, event.logIndex], executor,
      );
    }
  }

  async listEvents(chainId, limit = 200, executor) {
    const limitSql = sqlInteger(Math.max(1, Math.trunc(limit)), { min: 1, name: 'limit' });
    return execute(
      `SELECT * FROM tokenTransferBlockchainEvent WHERE chainId=?
       AND processingStatus IN ('NEW','UNMATCHED','FAILED') AND processingAttempts<20
       AND isCanonical=1 ORDER BY blockNumber,transactionIndex,logIndex LIMIT ${limitSql}`,
      [chainId], executor,
    );
  }

  async findPendingForEvent(event, executor) {
    const rows = await execute(
      `SELECT * FROM tokenTransfer WHERE chainId=? AND LOWER(tokenAddress)=LOWER(?)
       AND LOWER(senderWalletAddress)=LOWER(?) AND LOWER(recipientWalletAddress)=LOWER(?)
       AND tokenAmountRaw=? AND status='PENDING_TRANSFER' AND preparedAtBlock<=?
       AND isDeleted=0 ORDER BY createdAt LIMIT 1`,
      [event.chainId, event.tokenAddress, event.fromWalletAddress, event.toWalletAddress,
        event.amountRaw, event.blockNumber], executor,
    );
    return rows[0] || null;
  }

  async markEvent(transferEventUid, status, transferUid, message, executor) {
    await execute(
      `UPDATE tokenTransferBlockchainEvent SET processingStatus=?,matchedTransferUid=?,
       processingAttempts=processingAttempts+1,processingMessage=?,
       processedAt=UTC_TIMESTAMP(3),updatedAt=UTC_TIMESTAMP(3) WHERE transferEventUid=?`,
      [status, transferUid || null, message ? String(message).slice(0, 2000) : null, transferEventUid], executor,
    );
  }

  async expireAbandoned(limit = 50, graceSeconds = 180, executor) {
    const limitSql = sqlInteger(Math.max(1, Math.trunc(limit)), { min: 1, name: 'limit' });
    const graceSql = sqlInteger(Math.max(0, Math.trunc(graceSeconds)), { name: 'graceSeconds' });
    const result = await execute(
      `UPDATE tokenTransfer t SET t.status='EXPIRED',t.expiredAt=UTC_TIMESTAMP(3),
       t.expirationReason='TRANSACTION_NOT_SUBMITTED',t.syncStatus='IDLE',
       t.syncCompletedAt=UTC_TIMESTAMP(3),t.nextSyncAt=NULL,t.errorCode=NULL,
       t.errorMessage=NULL,t.updatedAt=UTC_TIMESTAMP(3)
       WHERE t.status='PENDING_TRANSFER' AND t.txHash IS NULL AND t.isDeleted=0
       AND t.expiresAt<=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL ${graceSql} SECOND)
       AND NOT EXISTS (SELECT 1 FROM tokenTransferBlockchainEvent e
        WHERE e.chainId=t.chainId AND LOWER(e.tokenAddress)=LOWER(t.tokenAddress)
        AND LOWER(e.fromWalletAddress)=LOWER(t.senderWalletAddress)
        AND LOWER(e.toWalletAddress)=LOWER(t.recipientWalletAddress)
        AND e.amountRaw=t.tokenAmountRaw AND e.blockNumber>=t.preparedAtBlock
        AND e.isCanonical=1)
       ORDER BY t.expiresAt ASC LIMIT ${limitSql}`,
      [], executor,
    );
    return result.affectedRows;
  }

  async earliestPreparedBlock(executor) {
    const rows = await execute(
      `SELECT MIN(preparedAtBlock) AS blockNumber FROM tokenTransfer
       WHERE status='PENDING_TRANSFER' AND isDeleted=0`, [], executor,
    );
    return Number(rows[0]?.blockNumber || 0);
  }
}

module.exports = { TokenTransferRepository };
