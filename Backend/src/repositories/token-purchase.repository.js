const { execute } = require('../database/connection');
const { createUid } = require('../utils/token');
const { sqlInteger } = require('../utils/sql');

class TokenPurchaseRepository {
  async listPortfolio(userUid, { page = 1, limit = 20, search = '' } = {}, executor) {
    const safePage = Math.max(1, Math.trunc(page));
    const safeLimit = Math.min(100, Math.max(1, Math.trunc(limit)));
    const offset = (safePage - 1) * safeLimit;
    const limitSql = sqlInteger(safeLimit, { min: 1, name: 'limit' });
    const offsetSql = sqlInteger(offset, { name: 'offset' });
    const conditions = ['1=1'];
    const params = [userUid, userUid];
    const normalizedSearch = String(search || '').trim().toLowerCase();
    if (normalizedSearch) {
      const pattern = `%${normalizedSearch}%`;
      conditions.push(`(LOWER(t.\`tokenName\`) LIKE ? OR LOWER(t.\`tokenSymbol\`) LIKE ?
        OR LOWER(COALESCE(t.\`tokenAddress\`,'')) LIKE ? OR LOWER(o.\`legalCompanyName\`) LIKE ?)`);
      params.push(pattern, pattern, pattern, pattern);
    }
    const where = conditions.join(' AND ');
    const from = `FROM (
        SELECT bt.\`tokenUid\`, MAX(bt.\`organizationUid\`) AS \`purchaseOrganizationUid\`,
               MAX(bt.\`chainId\`) AS \`chainId\`, MAX(i.\`walletAddress\`) AS \`investorWalletAddress\`,
               SUM(CASE WHEN bt.\`type\` = 'INVEST'
                 AND LOWER(bt.\`fromWallet\`) = LOWER(i.\`walletAddress\`) THEN 1 ELSE 0 END) AS \`purchaseCount\`,
               SUM(CASE WHEN bt.\`type\` = 'INVEST'
                 AND LOWER(bt.\`fromWallet\`) = LOWER(i.\`walletAddress\`)
                 THEN bt.\`tokenAmountFormatted\` ELSE 0 END) AS \`totalPurchasedTokenAmount\`,
               SUM(CASE WHEN bt.\`type\` = 'INVEST'
                 AND LOWER(bt.\`fromWallet\`) = LOWER(i.\`walletAddress\`)
                 THEN CAST(bt.\`tokenAmountRaw\` AS DECIMAL(65,0)) ELSE 0 END) AS \`totalPurchasedTokenAmountRaw\`,
               SUM(CASE WHEN bt.\`type\` = 'INVEST'
                 AND LOWER(bt.\`fromWallet\`) = LOWER(i.\`walletAddress\`)
                 THEN COALESCE(bt.\`usdtAmountFormatted\`, 0) ELSE 0 END) AS \`totalInvestedUsdtAmount\`,
               SUM(CASE WHEN bt.\`type\` = 'INVEST'
                 AND LOWER(bt.\`fromWallet\`) = LOWER(i.\`walletAddress\`)
                 THEN CAST(COALESCE(bt.\`usdtAmountRaw\`, '0') AS DECIMAL(65,0)) ELSE 0 END) AS \`totalInvestedUsdtAmountRaw\`,
               SUM(CASE WHEN bt.\`type\` = 'REDEMPTION'
                 AND LOWER(bt.\`toWallet\`) = LOWER(i.\`walletAddress\`) THEN 1 ELSE 0 END) AS \`redemptionCount\`,
               SUM(CASE WHEN bt.\`type\` = 'REDEMPTION'
                 AND LOWER(bt.\`toWallet\`) = LOWER(i.\`walletAddress\`)
                 THEN bt.\`tokenAmountFormatted\` ELSE 0 END) AS \`totalRedeemedTokenAmount\`,
               SUM(CASE WHEN bt.\`type\` = 'REDEMPTION'
                 AND LOWER(bt.\`toWallet\`) = LOWER(i.\`walletAddress\`)
                 THEN CAST(bt.\`tokenAmountRaw\` AS DECIMAL(65,0)) ELSE 0 END) AS \`totalRedeemedTokenAmountRaw\`,
               SUM(CASE WHEN bt.\`type\` = 'TRANSFER'
                 AND LOWER(bt.\`fromWallet\`) = LOWER(i.\`walletAddress\`) THEN 1 ELSE 0 END) AS \`sentTransferCount\`,
               SUM(CASE WHEN bt.\`type\` = 'TRANSFER'
                 AND LOWER(bt.\`fromWallet\`) = LOWER(i.\`walletAddress\`)
                 THEN bt.\`tokenAmountFormatted\` ELSE 0 END) AS \`totalSentTokenAmount\`,
               SUM(CASE WHEN bt.\`type\` = 'TRANSFER'
                 AND LOWER(bt.\`fromWallet\`) = LOWER(i.\`walletAddress\`)
                 THEN CAST(bt.\`tokenAmountRaw\` AS DECIMAL(65,0)) ELSE 0 END) AS \`totalSentTokenAmountRaw\`,
               SUM(CASE WHEN bt.\`type\` = 'TRANSFER'
                 AND LOWER(bt.\`toWallet\`) = LOWER(i.\`walletAddress\`) THEN 1 ELSE 0 END) AS \`receivedTransferCount\`,
               SUM(CASE WHEN bt.\`type\` = 'TRANSFER'
                 AND LOWER(bt.\`toWallet\`) = LOWER(i.\`walletAddress\`)
                 THEN bt.\`tokenAmountFormatted\` ELSE 0 END) AS \`totalReceivedTokenAmount\`,
               SUM(CASE WHEN bt.\`type\` = 'TRANSFER'
                 AND LOWER(bt.\`toWallet\`) = LOWER(i.\`walletAddress\`)
                 THEN CAST(bt.\`tokenAmountRaw\` AS DECIMAL(65,0)) ELSE 0 END) AS \`totalReceivedTokenAmountRaw\`,
               MIN(CASE WHEN bt.\`type\` = 'INVEST'
                 AND LOWER(bt.\`fromWallet\`) = LOWER(i.\`walletAddress\`)
                 THEN COALESCE(bt.\`blockTimestamp\`, bt.\`confirmedAt\`) END) AS \`firstPurchaseAt\`,
               MAX(CASE WHEN bt.\`type\` = 'INVEST'
                 AND LOWER(bt.\`fromWallet\`) = LOWER(i.\`walletAddress\`)
                 THEN COALESCE(bt.\`blockTimestamp\`, bt.\`confirmedAt\`) END) AS \`latestPurchaseAt\`,
               MAX(CASE WHEN bt.\`type\` = 'REDEMPTION'
                 AND LOWER(bt.\`toWallet\`) = LOWER(i.\`walletAddress\`)
                 THEN COALESCE(bt.\`blockTimestamp\`, bt.\`confirmedAt\`) END) AS \`latestRedemptionAt\`,
               MAX(CASE WHEN bt.\`type\` = 'TRANSFER'
                 AND LOWER(bt.\`fromWallet\`) = LOWER(i.\`walletAddress\`)
                 THEN COALESCE(bt.\`blockTimestamp\`, bt.\`confirmedAt\`) END) AS \`latestSentAt\`,
               MAX(CASE WHEN bt.\`type\` = 'TRANSFER'
                 AND LOWER(bt.\`toWallet\`) = LOWER(i.\`walletAddress\`)
                 THEN COALESCE(bt.\`blockTimestamp\`, bt.\`confirmedAt\`) END) AS \`latestReceivedAt\`,
               MAX(COALESCE(bt.\`blockTimestamp\`, bt.\`confirmedAt\`)) AS \`latestActivityAt\`
        FROM \`blockchainTransaction\` bt
        INNER JOIN \`investorMaster\` i
          ON i.\`userUid\` = ? AND i.\`status\` = 'submitted'
          AND i.\`isActive\` = 1 AND i.\`isDeleted\` = 0
        WHERE bt.\`status\` = 'CONFIRMED' AND bt.\`isCanonical\` = 1
          AND bt.\`isActive\` = 1 AND bt.\`isDeleted\` = 0
          AND (
            (bt.\`type\` = 'INVEST' AND LOWER(bt.\`fromWallet\`) = LOWER(i.\`walletAddress\`))
            OR (bt.\`type\` = 'TRANSFER' AND (
              LOWER(bt.\`fromWallet\`) = LOWER(i.\`walletAddress\`)
              OR LOWER(bt.\`toWallet\`) = LOWER(i.\`walletAddress\`)
            ))
            OR (bt.\`type\` = 'REDEMPTION' AND LOWER(bt.\`toWallet\`) = LOWER(i.\`walletAddress\`))
          )
        GROUP BY bt.\`tokenUid\`
      ) portfolio
      INNER JOIN \`tokenMaster\` t ON t.\`tokenUid\` = portfolio.\`tokenUid\` AND t.\`isDeleted\` = 0
      INNER JOIN \`organizationMaster\` o
        ON o.\`organizationUid\` = t.\`organizationUid\` AND o.\`isDeleted\` = 0
      LEFT JOIN \`countryMaster\` oc ON oc.\`countryUid\` = o.\`countryUid\`
      LEFT JOIN \`tokenInvestmentInterest\` interest ON interest.\`interestUid\` = (
        SELECT ii.\`interestUid\` FROM \`tokenInvestmentInterest\` ii
        WHERE ii.\`investorUserUid\` = ? AND ii.\`tokenUid\` = portfolio.\`tokenUid\`
          AND ii.\`isDeleted\` = 0
        ORDER BY ii.\`createdAt\` DESC LIMIT 1
      )`;
    const select = `SELECT t.\`tokenUid\`, t.\`organizationUid\`, t.\`tokenName\`, t.\`tokenSymbol\`,
        t.\`decimals\`, t.\`initialTokenPrice\`, t.\`currentTokenPrice\`,
        COALESCE(t.\`currentTokenPrice\`, t.\`initialTokenPrice\`) AS \`tokenPrice\`,
        t.\`treasuryWalletAddress\`, t.\`tokenDescription\`,
        t.\`imageStorageKey\`, t.\`imageMimeType\`, t.\`maxInvestors\`, t.\`maxInvestors\` AS \`maxHolder\`,
        t.\`maxBalancePerInvestor\`, t.\`countryRestrictionMode\`, t.\`tokenAddress\`,
        t.\`trustedClaimIssuerWalletAddress\`, t.\`tokenAgentWalletAddress\`,
        t.\`identityManagerWalletAddress\`, t.\`platformAgentWallet\`, t.\`identityRegistryAddress\`,
        t.\`identityRegistryStorageAddress\`, t.\`trustedIssuersRegistryAddress\`,
        t.\`claimTopicsRegistryAddress\`, t.\`modularComplianceAddress\`, t.\`deployTxHash\`,
        t.\`status\`, t.\`deployedAtBlock\`, t.\`deployedAt\`,
        t.\`createdAt\`, t.\`updatedAt\`, o.\`legalCompanyName\`,
        o.\`walletAddress\` AS \`organizationWalletAddress\`,
        oc.\`countryName\` AS \`organizationCountryName\`, oc.\`countryCode\` AS \`organizationCountryCode\`,
        interest.\`interestUid\`, portfolio.\`chainId\`, portfolio.\`investorWalletAddress\`,
        NULL AS \`usdtContractAddress\`, NULL AS \`usdtDecimals\`, portfolio.\`purchaseCount\`,
        CAST(portfolio.\`totalPurchasedTokenAmount\` AS CHAR) AS \`totalPurchasedTokenAmount\`,
        CAST(portfolio.\`totalPurchasedTokenAmountRaw\` AS CHAR) AS \`totalPurchasedTokenAmountRaw\`,
        CAST(portfolio.\`totalInvestedUsdtAmount\` AS CHAR) AS \`totalInvestedUsdtAmount\`,
        CAST(portfolio.\`totalInvestedUsdtAmountRaw\` AS CHAR) AS \`totalInvestedUsdtAmountRaw\`,
        CAST(portfolio.\`totalRedeemedTokenAmount\` AS CHAR) AS \`totalRedeemedTokenAmount\`,
        CAST(portfolio.\`totalRedeemedTokenAmountRaw\` AS CHAR) AS \`totalRedeemedTokenAmountRaw\`,
        CAST(portfolio.\`totalSentTokenAmount\` AS CHAR) AS \`totalSentTokenAmount\`,
        CAST(portfolio.\`totalSentTokenAmountRaw\` AS CHAR) AS \`totalSentTokenAmountRaw\`,
        CAST(portfolio.\`totalReceivedTokenAmount\` AS CHAR) AS \`totalReceivedTokenAmount\`,
        CAST(portfolio.\`totalReceivedTokenAmountRaw\` AS CHAR) AS \`totalReceivedTokenAmountRaw\`,
        CAST(GREATEST(portfolio.\`totalPurchasedTokenAmount\` + portfolio.\`totalReceivedTokenAmount\`
          - portfolio.\`totalRedeemedTokenAmount\` - portfolio.\`totalSentTokenAmount\`, 0) AS CHAR) AS \`netTokenAmount\`,
        CAST(GREATEST(portfolio.\`totalPurchasedTokenAmountRaw\` + portfolio.\`totalReceivedTokenAmountRaw\`
          - portfolio.\`totalRedeemedTokenAmountRaw\` - portfolio.\`totalSentTokenAmountRaw\`, 0) AS CHAR) AS \`netTokenAmountRaw\`,
        CAST(portfolio.\`totalInvestedUsdtAmount\` / NULLIF(portfolio.\`totalPurchasedTokenAmount\`, 0) AS CHAR) AS \`averagePurchasePrice\`,
        portfolio.\`redemptionCount\`, portfolio.\`sentTransferCount\`,
        portfolio.\`receivedTransferCount\`, portfolio.\`firstPurchaseAt\`, portfolio.\`latestPurchaseAt\`,
        portfolio.\`latestRedemptionAt\`, portfolio.\`latestSentAt\`, portfolio.\`latestReceivedAt\``;
    const [rows, countRows] = await Promise.all([
      execute(`${select} ${from} WHERE ${where}
        ORDER BY portfolio.\`latestActivityAt\` DESC, t.\`tokenName\` ASC LIMIT ${limitSql} OFFSET ${offsetSql}`,
      params, executor),
      execute(`SELECT COUNT(*) AS \`total\` ${from} WHERE ${where}`, params, executor),
    ]);
    return { rows, total: Number(countRows[0]?.total || 0) };
  }

  async findContext(userUid, tokenUid, executor) {
    const rows = await execute(
      `SELECT ii.\`interestUid\`, ii.\`status\` AS \`interestStatus\`, ii.\`organizationUid\`,
              ii.\`investorUid\`, ii.\`investorUserUid\`,
              i.\`walletAddress\` AS \`investorWalletAddress\`, i.\`status\` AS \`investorStatus\`,
              i.\`isActive\` AS \`investorActive\`, i.\`isDeleted\` AS \`investorDeleted\`,
              t.\`tokenUid\`, t.\`tokenAddress\`, t.\`treasuryWalletAddress\`, t.\`identityRegistryAddress\`,
              t.\`decimals\` AS \`tokenDecimals\`,
              CAST(COALESCE(t.\`currentTokenPrice\`, t.\`initialTokenPrice\`) AS CHAR) AS \`tokenPrice\`,
              CAST(t.\`maxBalancePerInvestor\` AS CHAR) AS \`maxBalancePerInvestor\`,
              t.\`status\` AS \`tokenStatus\`, t.\`isActive\` AS \`tokenActive\`
       FROM \`tokenInvestmentInterest\` ii
       INNER JOIN \`investorMaster\` i ON i.\`investorUid\` = ii.\`investorUid\`
       INNER JOIN \`tokenMaster\` t ON t.\`tokenUid\` = ii.\`tokenUid\`
       WHERE ii.\`investorUserUid\` = ? AND ii.\`tokenUid\` = ? AND ii.\`isDeleted\` = 0 LIMIT 1`,
      [userUid, tokenUid], executor,
    );
    return rows[0] || null;
  }

  async findByUid(purchaseUid, executor) {
    const rows = await execute(
      'SELECT * FROM `tokenPurchase` WHERE `purchaseUid` = ? AND `isDeleted` = 0 LIMIT 1',
      [purchaseUid], executor,
    );
    return rows[0] || null;
  }

  async findOwnedByUid(purchaseUid, userUid, executor) {
    const rows = await execute(
      'SELECT * FROM `tokenPurchase` WHERE `purchaseUid` = ? AND `investorUserUid` = ? AND `isDeleted` = 0 LIMIT 1',
      [purchaseUid, userUid], executor,
    );
    return rows[0] || null;
  }

  async listOwnedByToken(userUid, tokenUid, {
    page = 1, limit = 20, search = '', status = 'all',
  } = {}, executor) {
    const safePage = Math.max(1, Math.trunc(page));
    const safeLimit = Math.min(100, Math.max(1, Math.trunc(limit)));
    const offset = (safePage - 1) * safeLimit;
    const limitSql = sqlInteger(safeLimit, { min: 1, name: 'limit' });
    const offsetSql = sqlInteger(offset, { name: 'offset' });
    const conditions = ['`investorUserUid`=?', '`tokenUid`=?', '`isDeleted`=0'];
    const params = [userUid, tokenUid];
    if (status && status !== 'all') {
      conditions.push('`status`=?');
      params.push(status);
    }
    const normalizedSearch = String(search || '').trim().toLowerCase();
    if (normalizedSearch) {
      const pattern = `%${normalizedSearch}%`;
      conditions.push(`(
        LOWER(\`purchaseUid\`) LIKE ? OR LOWER(\`idempotencyKey\`) LIKE ?
        OR LOWER(COALESCE(\`paymentTxHash\`,'')) LIKE ? OR LOWER(COALESCE(\`mintTxHash\`,'')) LIKE ?
        OR LOWER(\`tokenAddress\`) LIKE ? OR LOWER(\`investorWalletAddress\`) LIKE ?
        OR LOWER(\`treasuryWalletAddress\`) LIKE ? OR CAST(\`tokenAmount\` AS CHAR) LIKE ?
        OR CAST(\`usdtAmount\` AS CHAR) LIKE ?
      )`);
      params.push(pattern, pattern, pattern, pattern, pattern, pattern, pattern, pattern, pattern);
    }
    const where = conditions.join(' AND ');
    const [rows, countRows] = await Promise.all([
      execute(
        `SELECT * FROM \`tokenPurchase\` WHERE ${where}
         ORDER BY \`createdAt\` DESC, \`purchaseUid\` DESC LIMIT ${limitSql} OFFSET ${offsetSql}`,
        params, executor,
      ),
      execute(
        `SELECT COUNT(*) AS \`total\` FROM \`tokenPurchase\` WHERE ${where}`,
        params, executor,
      ),
    ]);
    return { rows, total: Number(countRows[0]?.total || 0) };
  }

  async findForUpdate(purchaseUid, executor) {
    const rows = await execute(
      'SELECT * FROM `tokenPurchase` WHERE `purchaseUid` = ? AND `isDeleted` = 0 LIMIT 1 FOR UPDATE',
      [purchaseUid], executor,
    );
    return rows[0] || null;
  }

  async findByIdempotency(userUid, idempotencyKey, executor) {
    const rows = await execute(
      'SELECT * FROM `tokenPurchase` WHERE `investorUserUid` = ? AND `idempotencyKey` = ? AND `isDeleted` = 0 LIMIT 1',
      [userUid, idempotencyKey], executor,
    );
    return rows[0] || null;
  }

  async findActiveByInterest(interestUid, executor) {
    const rows = await execute(
      'SELECT * FROM `tokenPurchase` WHERE `activeInterestUid` = ? AND `isDeleted` = 0 LIMIT 1',
      [interestUid], executor,
    );
    return rows[0] || null;
  }

  async findActiveByInvestor(investorUid, executor) {
    const rows = await execute(
      'SELECT * FROM `tokenPurchase` WHERE `activeInvestorUid` = ? AND `isDeleted` = 0 LIMIT 1',
      [investorUid], executor,
    );
    return rows[0] || null;
  }

  async findActiveRedemptionByInterest(interestUid, executor) {
    const rows = await execute(
      'SELECT `redemptionUid`,`status` FROM `tokenRedemption` WHERE `activeInterestUid`=? AND `isDeleted`=0 LIMIT 1',
      [interestUid], executor,
    );
    return rows[0] || null;
  }

  async findByPaymentTxHash(txHash, executor) {
    const rows = await execute(
      'SELECT * FROM `tokenPurchase` WHERE LOWER(`paymentTxHash`) = LOWER(?) AND `isDeleted` = 0 LIMIT 1',
      [txHash], executor,
    );
    return rows[0] || null;
  }

  async create(data, executor) {
    const purchaseUid = createUid();
    await execute(
      `INSERT INTO \`tokenPurchase\`
        (\`purchaseUid\`, \`interestUid\`, \`tokenUid\`, \`organizationUid\`, \`investorUid\`, \`investorUserUid\`,
         \`idempotencyKey\`, \`chainId\`, \`usdtContractAddress\`, \`tokenAddress\`, \`investorWalletAddress\`,
         \`treasuryWalletAddress\`, \`platformWalletAddress\`, \`usdtDecimals\`, \`tokenDecimals\`, \`tokenPrice\`,
         \`tokenAmount\`, \`tokenAmountRaw\`, \`usdtAmount\`, \`usdtAmountRaw\`, \`preparedAtBlock\`, \`balanceBeforeRaw\`,
         \`expiresAt\`)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [purchaseUid, data.interestUid, data.tokenUid, data.organizationUid, data.investorUid, data.investorUserUid,
        data.idempotencyKey, data.chainId, data.usdtContractAddress, data.tokenAddress, data.investorWalletAddress,
        data.treasuryWalletAddress, data.platformWalletAddress, data.usdtDecimals, data.tokenDecimals, data.tokenPrice,
        data.tokenAmount, data.tokenAmountRaw, data.usdtAmount, data.usdtAmountRaw, data.preparedAtBlock,
         data.balanceBeforeRaw, data.expiresAt], executor,
    );
    return this.findByUid(purchaseUid, executor);
  }

  async sumOpenTokenAmountRaw(interestUid, executor) {
    const rows = await execute(
      `SELECT COALESCE(SUM(CAST(\`tokenAmountRaw\` AS DECIMAL(65,0))), 0) AS \`total\`
       FROM \`tokenPurchase\` WHERE \`interestUid\` = ?
         AND \`status\` IN ('PENDING_PAYMENT','PAYMENT_CONFIRMED','MINT_SUBMITTED') AND \`isDeleted\` = 0`,
      [interestUid], executor,
    );
    return String(rows[0]?.total || '0');
  }

  async assignPaymentHash(purchaseUid, txHash, allowReplacement = false, executor) {
    await execute(
      `UPDATE \`tokenPurchase\` SET \`paymentTxHash\` = ?, \`paymentTxReceivedAt\` = UTC_TIMESTAMP(3),
         \`syncStatus\` = 'QUEUED', \`syncRequestedAt\` = UTC_TIMESTAMP(3), \`nextSyncAt\` = UTC_TIMESTAMP(3),
         \`errorStage\` = NULL, \`errorCode\` = NULL, \`errorMessage\` = NULL, \`updatedAt\` = UTC_TIMESTAMP(3)
       WHERE \`purchaseUid\` = ? AND \`status\` = 'PENDING_PAYMENT' AND \`isDeleted\` = 0
         AND (\`paymentTxHash\` IS NULL OR LOWER(\`paymentTxHash\`) = LOWER(?) OR ? = 1)`,
      [txHash.toLowerCase(), purchaseUid, txHash, allowReplacement ? 1 : 0], executor,
    );
    return this.findByUid(purchaseUid, executor);
  }

  async recordTransaction(purchaseUid, stage, txHash, status, data = {}, executor) {
    await execute(
      `INSERT INTO \`tokenPurchaseTransaction\`
        (\`purchaseTransactionUid\`,\`purchaseUid\`,\`stage\`,\`txHash\`,\`status\`,\`blockNumber\`,\`blockHash\`,
         \`transactionIndex\`,\`logIndex\`,\`gasUsed\`,\`effectiveGasPrice\`,\`errorCode\`,\`errorMessage\`,\`confirmedAt\`)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE \`status\`=VALUES(\`status\`), \`blockNumber\`=VALUES(\`blockNumber\`),
         \`blockHash\`=VALUES(\`blockHash\`), \`transactionIndex\`=VALUES(\`transactionIndex\`),
         \`logIndex\`=VALUES(\`logIndex\`), \`gasUsed\`=VALUES(\`gasUsed\`),
         \`effectiveGasPrice\`=VALUES(\`effectiveGasPrice\`), \`errorCode\`=VALUES(\`errorCode\`),
         \`errorMessage\`=VALUES(\`errorMessage\`), \`confirmedAt\`=VALUES(\`confirmedAt\`),
         \`updatedAt\`=UTC_TIMESTAMP(3)`,
      [createUid(), purchaseUid, stage, txHash.toLowerCase(), status, data.blockNumber ?? null,
        data.blockHash ?? null, data.transactionIndex ?? null, data.logIndex ?? null, data.gasUsed ?? null,
        data.effectiveGasPrice ?? null, data.errorCode ?? null,
        data.errorMessage ? String(data.errorMessage).slice(0, 2000) : null,
        status === 'CONFIRMED' ? new Date() : null], executor,
    );
  }

  async listTransactions(purchaseUid, executor) {
    return execute(
      'SELECT * FROM `tokenPurchaseTransaction` WHERE `purchaseUid`=? ORDER BY `createdAt`,`purchaseTransactionUid`',
      [purchaseUid], executor,
    );
  }

  async markMintPreparing(purchaseUid, preparedAtBlock, allowPreparedRetry = false, executor) {
    const result = await execute(
      `UPDATE \`tokenPurchase\` SET \`mintStatus\`='PROCESSING',
       \`mintPreparedAtBlock\`=COALESCE(\`mintPreparedAtBlock\`,?), \`updatedAt\`=UTC_TIMESTAMP(3)
       WHERE \`purchaseUid\`=? AND \`status\`='PAYMENT_CONFIRMED' AND \`mintTxHash\` IS NULL
         AND (\`mintStatus\` IN ('QUEUED','FAILED') OR (? = 1 AND \`mintStatus\`='PROCESSING'))`,
      [preparedAtBlock, purchaseUid, allowPreparedRetry ? 1 : 0], executor,
    );
    return result.affectedRows > 0;
  }

  async confirmPayment(purchaseUid, data, executor) {
    const result = await execute(
      `UPDATE \`tokenPurchase\` SET \`status\` = 'PAYMENT_CONFIRMED', \`paymentTxHash\` = ?,
         \`paymentBlockNumber\` = ?, \`paymentBlockHash\` = ?, \`paymentTransactionIndex\` = ?,
         \`paymentLogIndex\` = ?, \`paymentGasUsed\` = ?, \`paymentEffectiveGasPrice\` = ?,
         \`paymentVerifiedAt\` = UTC_TIMESTAMP(3), \`mintStatus\` = 'QUEUED',
         \`syncStatus\` = 'QUEUED', \`syncRequestedAt\` = UTC_TIMESTAMP(3), \`nextSyncAt\` = UTC_TIMESTAMP(3),
         \`errorStage\` = NULL, \`errorCode\` = NULL, \`errorMessage\` = NULL, \`updatedAt\` = UTC_TIMESTAMP(3)
       WHERE \`purchaseUid\` = ? AND \`status\` = 'PENDING_PAYMENT' AND \`isDeleted\` = 0`,
      [data.txHash, data.blockNumber, data.blockHash, data.transactionIndex, data.logIndex,
        data.gasUsed, data.effectiveGasPrice, purchaseUid], executor,
    );
    return result.affectedRows > 0;
  }

  async markMintSubmitted(purchaseUid, data, executor) {
    await execute(
      `UPDATE \`tokenPurchase\` SET \`status\` = 'MINT_SUBMITTED', \`mintStatus\` = 'SUBMITTED',
         \`mintTxHash\` = ?, \`mintSubmittedAt\` = UTC_TIMESTAMP(3), \`mintPreparedAtBlock\` = ?,
         \`syncStatus\` = 'QUEUED', \`nextSyncAt\` = DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 15 SECOND),
         \`errorStage\` = NULL, \`errorCode\` = NULL, \`errorMessage\` = NULL,
         \`updatedAt\` = UTC_TIMESTAMP(3) WHERE \`purchaseUid\` = ? AND \`status\` = 'PAYMENT_CONFIRMED'`,
      [data.txHash, data.preparedAtBlock, purchaseUid], executor,
    );
  }

  async completeMint(purchaseUid, data, executor) {
    const result = await execute(
      `UPDATE \`tokenPurchase\` SET \`status\` = 'COMPLETED', \`mintStatus\` = 'CONFIRMED', \`mintTxHash\` = ?,
         \`mintBlockNumber\` = ?, \`mintBlockHash\` = ?, \`mintTransactionIndex\` = ?, \`mintLogIndex\` = ?,
         \`mintGasUsed\` = ?, \`mintEffectiveGasPrice\` = ?, \`mintConfirmedAt\` = UTC_TIMESTAMP(3),
         \`syncStatus\` = 'IDLE', \`syncCompletedAt\` = UTC_TIMESTAMP(3), \`nextSyncAt\` = NULL,
         \`errorStage\` = NULL, \`errorCode\` = NULL, \`errorMessage\` = NULL, \`updatedAt\` = UTC_TIMESTAMP(3)
       WHERE \`purchaseUid\` = ? AND \`status\` IN ('PAYMENT_CONFIRMED','MINT_SUBMITTED') AND \`isDeleted\` = 0`,
      [data.txHash, data.blockNumber, data.blockHash, data.transactionIndex, data.logIndex,
        data.gasUsed, data.effectiveGasPrice, purchaseUid], executor,
    );
    return result.affectedRows > 0;
  }

  async resetFailedMint(purchaseUid, executor) {
    await execute(
      `UPDATE \`tokenPurchase\` SET \`status\`='PAYMENT_CONFIRMED', \`mintStatus\`='QUEUED',
       \`mintTxHash\`=NULL, \`mintSubmittedAt\`=NULL, \`mintPreparedAtBlock\`=NULL,
       \`syncStatus\`='QUEUED', \`nextSyncAt\`=UTC_TIMESTAMP(3), \`updatedAt\`=UTC_TIMESTAMP(3)
       WHERE \`purchaseUid\`=? AND \`status\`='MINT_SUBMITTED'`,
      [purchaseUid], executor,
    );
  }

  async recordError(purchaseUid, stage, code, message, retrySeconds = 30, executor) {
    const retrySecondsSql = sqlInteger(retrySeconds == null ? 0 : retrySeconds, { name: 'retrySeconds' });
    await execute(
      `UPDATE \`tokenPurchase\` SET \`errorStage\` = ?, \`errorCode\` = ?, \`errorMessage\` = ?,
         \`mintStatus\` = CASE WHEN ? = 'MINT' AND ? IS NULL THEN 'FAILED' ELSE \`mintStatus\` END,
         \`syncStatus\` = 'FAILED', \`syncCompletedAt\` = UTC_TIMESTAMP(3),
         \`nextSyncAt\` = CASE WHEN ? IS NULL THEN NULL ELSE DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ${retrySecondsSql} SECOND) END,
          \`updatedAt\` = UTC_TIMESTAMP(3) WHERE \`purchaseUid\` = ?
            AND \`status\` IN ('PENDING_PAYMENT','PAYMENT_CONFIRMED','MINT_SUBMITTED')`,
      [stage, code, String(message || '').slice(0, 2000), stage, retrySeconds,
        retrySeconds, purchaseUid], executor,
    );
  }

  async schedulePending(purchaseUid, retrySeconds = 30, executor) {
    const retrySecondsSql = sqlInteger(Math.max(1, Math.trunc(retrySeconds)), { min: 1, name: 'retrySeconds' });
    await execute(
      `UPDATE \`tokenPurchase\` SET \`syncStatus\` = 'QUEUED',
         \`syncCompletedAt\` = UTC_TIMESTAMP(3),
         \`nextSyncAt\` = DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ${retrySecondsSql} SECOND),
         \`errorStage\` = NULL, \`errorCode\` = NULL, \`errorMessage\` = NULL,
         \`updatedAt\` = UTC_TIMESTAMP(3)
        WHERE \`purchaseUid\` = ? AND \`status\` IN ('PENDING_PAYMENT','PAYMENT_CONFIRMED','MINT_SUBMITTED')
          AND \`isDeleted\` = 0`,
      [purchaseUid], executor,
    );
    return this.findByUid(purchaseUid, executor);
  }

  async queue(purchaseUid, executor) {
    await execute(
      `UPDATE \`tokenPurchase\` SET \`syncStatus\` = 'QUEUED', \`syncRequestedAt\` = UTC_TIMESTAMP(3),
         \`nextSyncAt\` = UTC_TIMESTAMP(3), \`updatedAt\` = UTC_TIMESTAMP(3)
        WHERE \`purchaseUid\` = ? AND \`status\` IN ('PENDING_PAYMENT','PAYMENT_CONFIRMED','MINT_SUBMITTED')
          AND \`isDeleted\` = 0`,
      [purchaseUid], executor,
    );
    return this.findByUid(purchaseUid, executor);
  }

  async listRecoveryCandidates(limit = 50, executor) {
    const limitSql = sqlInteger(Math.max(1, Math.trunc(limit)), { min: 1, name: 'limit' });
    return execute(
      `SELECT * FROM \`tokenPurchase\` WHERE \`status\` IN ('PENDING_PAYMENT','PAYMENT_CONFIRMED','MINT_SUBMITTED')
         AND \`isDeleted\` = 0
         AND (\`syncStatus\` IN ('IDLE','QUEUED','FAILED')
           OR (\`syncStatus\` = 'PROCESSING' AND \`syncStartedAt\` < DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 5 MINUTE)))
         AND (\`nextSyncAt\` IS NULL OR \`nextSyncAt\` <= UTC_TIMESTAMP(3))
       ORDER BY (\`syncStatus\` = 'QUEUED') DESC, \`createdAt\` ASC LIMIT ${limitSql}`,
      [], executor,
    );
  }

  async markProcessing(purchaseUid, executor) {
    const result = await execute(
      `UPDATE \`tokenPurchase\` SET \`syncStatus\` = 'PROCESSING', \`syncStartedAt\` = UTC_TIMESTAMP(3),
         \`syncAttempts\` = \`syncAttempts\` + 1, \`nextSyncAt\` = NULL, \`updatedAt\` = UTC_TIMESTAMP(3)
        WHERE \`purchaseUid\` = ? AND \`status\` IN ('PENDING_PAYMENT','PAYMENT_CONFIRMED','MINT_SUBMITTED')
          AND \`isDeleted\` = 0
         AND (\`syncStatus\` IN ('IDLE','QUEUED','FAILED')
           OR (\`syncStatus\` = 'PROCESSING' AND \`syncStartedAt\` < DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 5 MINUTE)))`,
      [purchaseUid], executor,
    );
    return result.affectedRows > 0;
  }

  async storePaymentEvents(events, executor) {
    for (const event of events) {
      await execute(
        `INSERT INTO \`tokenPurchasePaymentEvent\`
          (\`paymentEventUid\`,\`chainId\`,\`usdtContractAddress\`,\`fromWalletAddress\`,\`toWalletAddress\`,
           \`amountRaw\`,\`txHash\`,\`blockNumber\`,\`blockHash\`,\`transactionIndex\`,\`logIndex\`)
         VALUES (?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE \`blockHash\`=VALUES(\`blockHash\`),
           \`isCanonical\`=TRUE, \`updatedAt\`=UTC_TIMESTAMP(3)`,
        [createUid(), event.chainId, event.usdtContractAddress, event.fromWalletAddress, event.toWalletAddress,
          event.amountRaw, event.txHash, event.blockNumber, event.blockHash, event.transactionIndex, event.logIndex], executor,
      );
    }
  }

  async listPaymentEvents(chainId, limit = 200, executor) {
    const limitSql = sqlInteger(Math.max(1, Math.trunc(limit)), { min: 1, name: 'limit' });
    return execute(
      `SELECT * FROM \`tokenPurchasePaymentEvent\` WHERE \`chainId\` = ? AND \`processingStatus\` IN ('NEW','UNMATCHED','FAILED')
       AND \`processingAttempts\` < 20 AND \`isCanonical\` = 1 ORDER BY \`blockNumber\`,\`logIndex\` LIMIT ${limitSql}`,
      [chainId], executor,
    );
  }

  async findPendingForPaymentEvent(event, executor) {
    const rows = await execute(
      `SELECT * FROM \`tokenPurchase\` WHERE \`chainId\`=? AND LOWER(\`usdtContractAddress\`)=LOWER(?)
       AND LOWER(\`investorWalletAddress\`)=LOWER(?) AND LOWER(\`treasuryWalletAddress\`)=LOWER(?)
       AND \`usdtAmountRaw\`=? AND \`status\`='PENDING_PAYMENT' AND \`isDeleted\`=0
       ORDER BY \`createdAt\` LIMIT 1`,
      [event.chainId, event.usdtContractAddress, event.fromWalletAddress, event.toWalletAddress, event.amountRaw], executor,
    );
    return rows[0] || null;
  }

  async expireAbandonedPaymentIntents(limit = 50, graceSeconds = 180, executor) {
    const limitSql = sqlInteger(Math.max(1, Math.trunc(limit)), { min: 1, name: 'limit' });
    const graceSecondsSql = sqlInteger(Math.max(0, Math.trunc(graceSeconds)), { name: 'graceSeconds' });
    const result = await execute(
      `UPDATE \`tokenPurchase\` p SET p.\`status\`='EXPIRED', p.\`expiredAt\`=UTC_TIMESTAMP(3),
         \`expirationReason\`='PAYMENT_NOT_SUBMITTED', \`syncStatus\`='IDLE',
         \`syncCompletedAt\`=UTC_TIMESTAMP(3), \`nextSyncAt\`=NULL,
         \`errorStage\`=NULL, \`errorCode\`=NULL, \`errorMessage\`=NULL,
         \`updatedAt\`=UTC_TIMESTAMP(3)
       WHERE p.\`status\`='PENDING_PAYMENT' AND p.\`paymentTxHash\` IS NULL AND p.\`isDeleted\`=0
          AND p.\`expiresAt\` <= DATE_SUB(UTC_TIMESTAMP(3), INTERVAL ${graceSecondsSql} SECOND)
         AND NOT EXISTS (
           SELECT 1 FROM \`tokenPurchasePaymentEvent\` e
           WHERE e.\`chainId\`=p.\`chainId\` AND LOWER(e.\`usdtContractAddress\`)=LOWER(p.\`usdtContractAddress\`)
             AND LOWER(e.\`fromWalletAddress\`)=LOWER(p.\`investorWalletAddress\`)
             AND LOWER(e.\`toWalletAddress\`)=LOWER(p.\`treasuryWalletAddress\`)
             AND e.\`amountRaw\`=p.\`usdtAmountRaw\` AND e.\`blockNumber\` >= p.\`preparedAtBlock\`
             AND e.\`isCanonical\`=1
         )
       ORDER BY p.\`expiresAt\` ASC LIMIT ${limitSql}`,
      [], executor,
    );
    return result.affectedRows;
  }

  async markPaymentEvent(paymentEventUid, status, purchaseUid, message, executor) {
    await execute(
      `UPDATE \`tokenPurchasePaymentEvent\` SET \`processingStatus\`=?, \`matchedPurchaseUid\`=?,
       \`processingAttempts\`=\`processingAttempts\`+1, \`processingMessage\`=?, \`processedAt\`=UTC_TIMESTAMP(3),
       \`updatedAt\`=UTC_TIMESTAMP(3) WHERE \`paymentEventUid\`=?`,
      [status, purchaseUid || null, message ? String(message).slice(0, 2000) : null, paymentEventUid], executor,
    );
  }

  async earliestPreparedBlock(executor) {
    const rows = await execute(
      `SELECT MIN(\`preparedAtBlock\`) AS \`blockNumber\` FROM \`tokenPurchase\`
       WHERE \`status\` IN ('PENDING_PAYMENT','PAYMENT_CONFIRMED','MINT_SUBMITTED') AND \`isDeleted\`=0`,
      [], executor,
    );
    return Number(rows[0]?.blockNumber || 0);
  }
}

module.exports = { TokenPurchaseRepository };
