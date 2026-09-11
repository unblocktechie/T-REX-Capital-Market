const { execute } = require('../database/connection');
const { createUid } = require('../utils/token');
const { sqlInteger } = require('../utils/sql');

class BlockchainTransactionRepository {
  async findTokenByUid(tokenUid, executor) {
    const rows = await execute(
      `SELECT t.*, o.walletAddress AS issuerWalletAddress, o.legalCompanyName
       FROM tokenMaster t
       INNER JOIN organizationMaster o ON o.organizationUid=t.organizationUid AND o.isDeleted=0
       WHERE t.tokenUid=? AND t.status='deployed' AND t.isActive=1 AND t.isDeleted=0 LIMIT 1`,
      [tokenUid], executor,
    );
    return rows[0] || null;
  }

  async findTokenByAddress(tokenAddress, executor) {
    const rows = await execute(
      `SELECT t.*, o.walletAddress AS issuerWalletAddress, o.legalCompanyName
       FROM tokenMaster t
       INNER JOIN organizationMaster o ON o.organizationUid=t.organizationUid AND o.isDeleted=0
       WHERE LOWER(t.tokenAddress)=LOWER(?) AND t.status='deployed'
         AND t.isActive=1 AND t.isDeleted=0 LIMIT 1`,
      [tokenAddress], executor,
    );
    return rows[0] || null;
  }

  async listIndexedTokens(executor) {
    return execute(
      `SELECT t.tokenUid,t.organizationUid,t.tokenAddress,t.tokenSymbol,t.decimals,t.deployedAtBlock,
              o.walletAddress AS issuerWalletAddress
       FROM tokenMaster t
       INNER JOIN organizationMaster o ON o.organizationUid=t.organizationUid AND o.isDeleted=0
       WHERE t.status='deployed' AND t.tokenAddress IS NOT NULL AND t.tokenAddress<>''
         AND t.isActive=1 AND t.isDeleted=0
       ORDER BY t.deployedAtBlock,t.tokenUid`,
      [], executor,
    );
  }

  async registerIndexedTokens(indexerName, chainId, tokens, executor) {
    for (const token of tokens) {
      const startBlock = Math.max(0, Number(token.deployedAtBlock || 0));
      const initialBlock = Math.max(0, startBlock - 1);
      await execute(
        `INSERT INTO blockchainIndexedContract
          (indexedContractUid,indexerName,chainId,tokenUid,contractAddress,startBlock,lastBackfilledBlock)
         VALUES (?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE tokenUid=VALUES(tokenUid),startBlock=LEAST(startBlock,VALUES(startBlock)),
           isActive=TRUE,isDeleted=FALSE,updatedAt=UTC_TIMESTAMP(3)`,
        [createUid(), indexerName, chainId, token.tokenUid, token.tokenAddress, startBlock, initialBlock], executor,
      );
    }
  }

  async listContractsRequiringBackfill(indexerName, chainId, throughBlock, executor) {
    return execute(
      `SELECT * FROM blockchainIndexedContract
       WHERE indexerName=? AND chainId=? AND lastBackfilledBlock<? AND isActive=1 AND isDeleted=0
       ORDER BY startBlock,tokenUid`,
      [indexerName, chainId, throughBlock], executor,
    );
  }

  async advanceContractBackfill(indexedContractUid, throughBlock, completed, executor) {
    return execute(
      `UPDATE blockchainIndexedContract SET lastBackfilledBlock=?,
         backfillCompletedAt=IF(?,UTC_TIMESTAMP(3),backfillCompletedAt),updatedAt=UTC_TIMESTAMP(3)
       WHERE indexedContractUid=? AND isDeleted=0`,
      [throughBlock, completed ? 1 : 0, indexedContractUid], executor,
    );
  }

  async findInvestorByUserUid(userUid, executor) {
    const rows = await execute(
      `SELECT i.investorUid,i.userUid,i.walletAddress,u.fullName,u.email
       FROM investorMaster i
       INNER JOIN userMaster u ON u.userUid=i.userUid AND u.isDeleted=0
       WHERE i.userUid=? AND i.status='submitted' AND i.isActive=1 AND i.isDeleted=0 LIMIT 1`,
      [userUid], executor,
    );
    return rows[0] || null;
  }

  async findUserByWallet(walletAddress, executor) {
    const rows = await execute(
      `SELECT i.investorUid,i.userUid,i.walletAddress,u.fullName,u.email
       FROM investorMaster i
       INNER JOIN userMaster u ON u.userUid=i.userUid AND u.isDeleted=0
       WHERE LOWER(i.walletAddress)=LOWER(?) AND i.status='submitted'
         AND i.isActive=1 AND i.isDeleted=0 LIMIT 1`,
      [walletAddress], executor,
    );
    return rows[0] || null;
  }

  async findByHashAndType(chainId, transactionHash, type, executor) {
    const rows = await execute(
      `SELECT * FROM blockchainTransaction
       WHERE chainId=? AND LOWER(transactionHash)=LOWER(?) AND type=? AND isDeleted=0 LIMIT 1`,
      [chainId, transactionHash, type], executor,
    );
    return rows[0] || null;
  }

  async upsert(record, executor) {
    await execute(
      `INSERT INTO blockchainTransaction
        (transactionUid,chainId,tokenUid,organizationUid,tokenAddress,controllerAddress,
         transactionHash,blockNumber,blockHash,transactionIndex,logIndex,gasUsed,effectiveGasPrice,type,executionType,initiatedByUserUid,
         initiatedByWallet,fromWallet,toWallet,tokenAmountRaw,tokenAmountFormatted,
         usdtAmountRaw,usdtAmountFormatted,tokenSymbol,status,confirmationCount,blockTimestamp,
         confirmedAt,errorCode,errorMessage,isCanonical)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE
         tokenUid=VALUES(tokenUid),organizationUid=VALUES(organizationUid),tokenAddress=VALUES(tokenAddress),
         controllerAddress=VALUES(controllerAddress),blockNumber=VALUES(blockNumber),blockHash=VALUES(blockHash),
         transactionIndex=VALUES(transactionIndex),logIndex=VALUES(logIndex),gasUsed=VALUES(gasUsed),
         effectiveGasPrice=VALUES(effectiveGasPrice),executionType=VALUES(executionType),
         initiatedByUserUid=COALESCE(VALUES(initiatedByUserUid),initiatedByUserUid),
         initiatedByWallet=VALUES(initiatedByWallet),fromWallet=VALUES(fromWallet),toWallet=VALUES(toWallet),
         tokenAmountRaw=VALUES(tokenAmountRaw),tokenAmountFormatted=VALUES(tokenAmountFormatted),
         usdtAmountRaw=VALUES(usdtAmountRaw),usdtAmountFormatted=VALUES(usdtAmountFormatted),
         tokenSymbol=VALUES(tokenSymbol),status=VALUES(status),confirmationCount=VALUES(confirmationCount),
         blockTimestamp=VALUES(blockTimestamp),confirmedAt=VALUES(confirmedAt),errorCode=VALUES(errorCode),
         errorMessage=VALUES(errorMessage),isCanonical=VALUES(isCanonical),isActive=TRUE,isDeleted=FALSE,
         updatedAt=UTC_TIMESTAMP(3)`,
      [
        createUid(), record.chainId, record.tokenUid, record.organizationUid, record.tokenAddress,
        record.controllerAddress || null, record.transactionHash, record.blockNumber ?? null,
        record.blockHash || null, record.transactionIndex ?? null, record.logIndex ?? null,
        record.gasUsed || null, record.effectiveGasPrice || null, record.type, record.executionType || 'DIRECT',
        record.initiatedByUserUid || null, record.initiatedByWallet, record.fromWallet || null,
        record.toWallet || null, record.tokenAmountRaw || null, record.tokenAmountFormatted || null,
        record.usdtAmountRaw || null, record.usdtAmountFormatted || null, record.tokenSymbol || null,
        record.status, record.confirmationCount || 0, record.blockTimestamp || null,
        record.confirmedAt || null, record.errorCode || null, record.errorMessage || null,
        record.isCanonical !== false,
      ], executor,
    );
    return this.findByHashAndType(record.chainId, record.transactionHash, record.type, executor);
  }

  async synchronizeLegacy(record, executor) {
    if (record.status !== 'CONFIRMED') return;
    const common = [
      record.transactionHash, record.blockNumber, record.blockHash, record.transactionIndex,
      record.logIndex, record.confirmedAt, record.tokenUid, record.initiatedByWallet,
      record.tokenAmountRaw,
    ];
    if (record.type === 'INVEST') {
      await execute(
        `UPDATE tokenPurchase SET status='COMPLETED',paymentTxHash=?,paymentBlockNumber=?,paymentBlockHash=?,
           paymentTransactionIndex=?,paymentLogIndex=?,paymentVerifiedAt=?,mintStatus='CONFIRMED',
           mintTxHash=?,mintBlockNumber=?,mintBlockHash=?,mintTransactionIndex=?,mintLogIndex=?,
           mintConfirmedAt=?,syncStatus='IDLE',syncCompletedAt=UTC_TIMESTAMP(3),nextSyncAt=NULL,
           errorStage=NULL,errorCode=NULL,errorMessage=NULL,updatedAt=UTC_TIMESTAMP(3)
         WHERE tokenUid=? AND LOWER(investorWalletAddress)=LOWER(?) AND tokenAmountRaw=?
           AND status IN ('PENDING_PAYMENT','PAYMENT_CONFIRMED','MINT_SUBMITTED') AND isDeleted=0`,
        [
          ...common.slice(0, 6), record.transactionHash, record.blockNumber, record.blockHash,
          record.transactionIndex, record.logIndex, record.confirmedAt, ...common.slice(6),
        ], executor,
      );
    } else if (record.type === 'TRANSFER') {
      await execute(
        `UPDATE tokenTransfer SET status='COMPLETED',txHash=?,blockNumber=?,blockHash=?,transactionIndex=?,
           logIndex=?,verifiedAt=?,syncStatus='IDLE',syncCompletedAt=UTC_TIMESTAMP(3),nextSyncAt=NULL,
           errorCode=NULL,errorMessage=NULL,updatedAt=UTC_TIMESTAMP(3)
         WHERE tokenUid=? AND LOWER(senderWalletAddress)=LOWER(?)
           AND LOWER(recipientWalletAddress)=LOWER(?) AND tokenAmountRaw=?
           AND status='PENDING_TRANSFER' AND isDeleted=0`,
        [
          record.transactionHash, record.blockNumber, record.blockHash, record.transactionIndex,
          record.logIndex, record.confirmedAt, record.tokenUid, record.fromWallet,
          record.toWallet, record.tokenAmountRaw,
        ], executor,
      );
    } else if (record.type === 'REDEMPTION') {
      const result = await execute(
        `UPDATE tokenRedemption SET status='COMPLETED',lockStatus='NOT_REQUIRED',paymentStatus='CONFIRMED',
           paymentTxHash=?,paymentBlockNumber=?,paymentBlockHash=?,paymentTransactionIndex=?,paymentLogIndex=?,
           paymentVerifiedAt=?,burnStatus='CONFIRMED',burnTxHash=?,burnBlockNumber=?,burnBlockHash=?,
           burnTransactionIndex=?,burnLogIndex=?,burnConfirmedAt=?,unlockStatus='NOT_REQUIRED',
           syncStatus='IDLE',syncCompletedAt=UTC_TIMESTAMP(3),nextSyncAt=NULL,errorStage=NULL,
           errorCode=NULL,errorMessage=NULL,updatedAt=UTC_TIMESTAMP(3)
         WHERE tokenUid=? AND LOWER(investorWalletAddress)=LOWER(?) AND tokenAmountRaw=?
           AND status NOT IN ('COMPLETED','ISSUER_REJECTED','CANCELLED','EXPIRED') AND isDeleted=0`,
        [
          ...common.slice(0, 6), record.transactionHash, record.blockNumber, record.blockHash,
          record.transactionIndex, record.logIndex, record.confirmedAt, ...common.slice(6),
        ], executor,
      );
      if (result.affectedRows > 0) {
        const rows = await execute(
          `SELECT redemptionUid FROM tokenRedemption WHERE tokenUid=?
           AND LOWER(investorWalletAddress)=LOWER(?) AND tokenAmountRaw=? AND status='COMPLETED'
           ORDER BY updatedAt DESC LIMIT 1`,
          [record.tokenUid, record.initiatedByWallet, record.tokenAmountRaw], executor,
        );
        if (rows[0]) {
          await execute(
            `INSERT INTO tokenRedemptionHistory
              (redemptionHistoryUid,redemptionUid,eventType,fromStatus,toStatus,actorRole,actorUserUid,message,metadata)
             VALUES (?,?,'ONCHAIN_REDEMPTION_CONFIRMED',NULL,'COMPLETED','system',NULL,
               'Frontend-executed Platform Controller redemption confirmed by the backend.',?)`,
            [createUid(), rows[0].redemptionUid, JSON.stringify({ transactionHash: record.transactionHash })], executor,
          );
        }
      }
    }
  }

  async markOrphanedFromBlock(chainId, blockNumber, executor) {
    return execute(
      `UPDATE blockchainTransaction SET status='ORPHANED',isCanonical=FALSE,confirmedAt=NULL,
         errorCode='CHAIN_REORGANIZATION',errorMessage='Previously indexed block is no longer canonical.',
         updatedAt=UTC_TIMESTAMP(3)
       WHERE chainId=? AND blockNumber>=? AND isDeleted=0`,
      [chainId, blockNumber], executor,
    );
  }

  scope(user, params) {
    const where = ['bt.isDeleted=0'];
    const values = [];
    if (user.roleName === 'Investor') {
      where.push(`EXISTS (SELECT 1 FROM investorMaster i WHERE i.userUid=? AND i.status='submitted'
        AND i.isDeleted=0 AND (LOWER(i.walletAddress)=LOWER(bt.initiatedByWallet)
          OR LOWER(i.walletAddress)=LOWER(bt.fromWallet) OR LOWER(i.walletAddress)=LOWER(bt.toWallet)))`);
      values.push(user.userUid);
    } else if (user.roleName === 'Issuer') {
      where.push('EXISTS (SELECT 1 FROM organizationMaster o WHERE o.organizationUid=bt.organizationUid AND o.userUid=? AND o.isDeleted=0)');
      values.push(user.userUid);
    }
    if (params.tokenUid) { where.push('bt.tokenUid=?'); values.push(params.tokenUid); }
    if (params.type && String(params.type).toUpperCase() !== 'ALL') { where.push('bt.type=?'); values.push(params.type); }
    if (params.status && String(params.status).toUpperCase() !== 'ALL') { where.push('bt.status=?'); values.push(params.status); }
    if (params.walletAddress) {
      where.push('(LOWER(bt.initiatedByWallet)=LOWER(?) OR LOWER(bt.fromWallet)=LOWER(?) OR LOWER(bt.toWallet)=LOWER(?))');
      values.push(params.walletAddress, params.walletAddress, params.walletAddress);
    }
    if (params.txHash) { where.push('LOWER(bt.transactionHash)=LOWER(?)'); values.push(params.txHash); }
    if (params.fromDate) { where.push('bt.blockTimestamp>=?'); values.push(params.fromDate); }
    if (params.toDate) { where.push('bt.blockTimestamp<=?'); values.push(params.toDate); }
    if (params.search) {
      const search = `%${String(params.search).replace(/[\\%_]/g, '\\$&')}%`;
      where.push(`(bt.transactionHash LIKE ? ESCAPE '\\\\' OR bt.tokenSymbol LIKE ? ESCAPE '\\\\'
        OR tm.tokenName LIKE ? ESCAPE '\\\\' OR om.legalCompanyName LIKE ? ESCAPE '\\\\'
        OR bt.fromWallet LIKE ? ESCAPE '\\\\' OR bt.toWallet LIKE ? ESCAPE '\\\\')`);
      values.push(search, search, search, search, search, search);
    }
    return { where: where.join(' AND '), values };
  }

  async list(user, params = {}, executor) {
    const page = Math.max(1, Number(params.page || 1));
    const limit = Math.min(100, Math.max(1, Number(params.limit || 20)));
    const offset = (page - 1) * limit;
    const limitSql = sqlInteger(limit, { min: 1, max: 100, name: 'limit' });
    const offsetSql = sqlInteger(offset, { min: 0, name: 'offset' });
    const { where, values } = this.scope(user, params);
    const [rows, totals] = await Promise.all([
      execute(`SELECT bt.*,tm.tokenName,om.legalCompanyName AS issuerName
        FROM blockchainTransaction bt
        LEFT JOIN tokenMaster tm ON tm.tokenUid=bt.tokenUid AND tm.isDeleted=0
        LEFT JOIN organizationMaster om ON om.organizationUid=bt.organizationUid AND om.isDeleted=0
        WHERE ${where}
        ORDER BY COALESCE(bt.blockTimestamp,bt.createdAt) DESC,bt.blockNumber DESC,bt.logIndex DESC
        LIMIT ${limitSql} OFFSET ${offsetSql}`, values, executor),
      execute(`SELECT COUNT(*) AS total FROM blockchainTransaction bt
        LEFT JOIN tokenMaster tm ON tm.tokenUid=bt.tokenUid AND tm.isDeleted=0
        LEFT JOIN organizationMaster om ON om.organizationUid=bt.organizationUid AND om.isDeleted=0
        WHERE ${where}`, values, executor),
    ]);
    return { rows, total: Number(totals[0]?.total || 0), page, limit };
  }

  async listForExport(user, params = {}, executor) {
    const { where, values } = this.scope(user, params);
    return execute(`SELECT bt.*,tm.tokenName,om.legalCompanyName AS issuerName
      FROM blockchainTransaction bt
      LEFT JOIN tokenMaster tm ON tm.tokenUid=bt.tokenUid AND tm.isDeleted=0
      LEFT JOIN organizationMaster om ON om.organizationUid=bt.organizationUid AND om.isDeleted=0
      WHERE ${where}
      ORDER BY COALESCE(bt.blockTimestamp,bt.createdAt) DESC,bt.blockNumber DESC,bt.logIndex DESC`, values, executor);
  }
}

module.exports = { BlockchainTransactionRepository };
