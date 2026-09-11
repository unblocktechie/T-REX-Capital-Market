const { execute } = require('../database/connection');
const { createUid } = require('../utils/token');
const { sqlInteger } = require('../utils/sql');

class IdentityRegistryRegistrationRepository {
  async findContextByInterest(interestUid, executor) {
    const rows = await execute(
      `SELECT ii.\`interestUid\`, ii.\`status\` AS \`interestStatus\`, ii.\`tokenUid\`,
              ii.\`organizationUid\`, ii.\`investorUid\`, ii.\`investorUserUid\`,
              t.\`status\` AS \`tokenStatus\`, t.\`identityRegistryAddress\`, t.\`tokenAgentWalletAddress\`,
              t.\`identityManagerWalletAddress\`,
              t.\`countryRestrictionMode\`, t.\`deployedAtBlock\`,
              o.\`userUid\` AS \`issuerUserUid\`, o.\`walletAddress\` AS \`issuerWalletAddress\`,
              o.\`status\` AS \`organizationStatus\`, o.\`isActive\` AS \`organizationActive\`,
              i.\`walletAddress\` AS \`investorWalletAddress\`,
              i.\`contractAddress\` AS \`investorIdentityAddress\`,
              i.\`countryUid\`, i.\`status\` AS \`investorStatus\`, i.\`isActive\` AS \`investorActive\`,
              c.\`numericCode\` AS \`countryNumericCode\`, c.\`isActive\` AS \`countryActive\`,
              c.\`isDeleted\` AS \`countryDeleted\`,
              EXISTS(
                SELECT 1 FROM \`tokenCountryRestriction\` tr
                WHERE tr.\`tokenUid\` = ii.\`tokenUid\` AND tr.\`countryUid\` = i.\`countryUid\`
                  AND tr.\`isActive\` = 1 AND tr.\`isDeleted\` = 0
              ) AS \`countryListed\`
       FROM \`tokenInvestmentInterest\` ii
       INNER JOIN \`tokenMaster\` t ON t.\`tokenUid\` = ii.\`tokenUid\` AND t.\`isDeleted\` = 0
       INNER JOIN \`organizationMaster\` o ON o.\`organizationUid\` = ii.\`organizationUid\` AND o.\`isDeleted\` = 0
       INNER JOIN \`investorMaster\` i ON i.\`investorUid\` = ii.\`investorUid\` AND i.\`isDeleted\` = 0
       LEFT JOIN \`countryMaster\` c ON c.\`countryUid\` = i.\`countryUid\`
       WHERE ii.\`interestUid\` = ? AND ii.\`isDeleted\` = 0 LIMIT 1`,
      [interestUid], executor,
    );
    return rows[0] || null;
  }

  async getClaimCompletion(interestUid, tokenUid, executor) {
    const rows = await execute(
      `SELECT tc.\`claimTopicValue\` AS \`claimTopic\`, ct.\`claimTopicCode\`,
              EXISTS(
                SELECT 1 FROM \`investorClaimSubmission\` cs
                WHERE cs.\`interestUid\` = ? AND cs.\`claimTopic\` = tc.\`claimTopicValue\`
                  AND cs.\`status\` = 'CONFIRMED' AND cs.\`isDeleted\` = 0
              ) AS \`confirmed\`
       FROM \`tokenClaimTopic\` tc
       INNER JOIN \`claimTopicMaster\` ct
         ON ct.\`claimTopicUid\` = tc.\`claimTopicUid\` AND ct.\`isActive\` = 1 AND ct.\`isDeleted\` = 0
       WHERE tc.\`tokenUid\` = ? AND tc.\`isActive\` = 1 AND tc.\`isDeleted\` = 0
       ORDER BY tc.\`claimTopicValue\``,
      [interestUid, tokenUid], executor,
    );
    return {
      required: rows.length,
      confirmed: rows.filter((row) => Boolean(row.confirmed)).length,
      missing: rows.filter((row) => !row.confirmed).map((row) => ({
        claimTopic: Number(row.claimTopic), claimTopicCode: row.claimTopicCode,
      })),
    };
  }

  async findByInterest(interestUid, executor) {
    const rows = await execute(
      'SELECT * FROM `identityRegistryRegistration` WHERE `interestUid` = ? AND `isDeleted` = 0 LIMIT 1',
      [interestUid], executor,
    );
    return rows[0] || null;
  }

  async findByUid(registryRegistrationUid, executor) {
    const rows = await execute(
      'SELECT * FROM `identityRegistryRegistration` WHERE `registryRegistrationUid` = ? AND `isDeleted` = 0 LIMIT 1',
      [registryRegistrationUid], executor,
    );
    return rows[0] || null;
  }

  async findByUidForUpdate(registryRegistrationUid, executor) {
    const rows = await execute(
      'SELECT * FROM `identityRegistryRegistration` WHERE `registryRegistrationUid` = ? AND `isDeleted` = 0 LIMIT 1 FOR UPDATE',
      [registryRegistrationUid], executor,
    );
    return rows[0] || null;
  }

  async findByTxHash(txHash, executor) {
    const rows = await execute(
      'SELECT * FROM `identityRegistryRegistration` WHERE LOWER(`txHash`) = LOWER(?) AND `isDeleted` = 0 LIMIT 1',
      [txHash], executor,
    );
    return rows[0] || null;
  }

  async findCanonicalEvent(expected, executor) {
    const rows = await execute(
      `SELECT * FROM \`identityRegistryBlockchainEvent\`
       WHERE \`chainId\` = ? AND LOWER(\`identityRegistryAddress\`) = LOWER(?)
         AND LOWER(\`investorWalletAddress\`) = LOWER(?)
         AND LOWER(\`investorIdentityAddress\`) = LOWER(?)
         AND \`isCanonical\` = 1 AND \`isDeleted\` = 0
       ORDER BY \`blockNumber\` DESC, \`logIndex\` DESC LIMIT 1`,
      [expected.chainId, expected.identityRegistryAddress, expected.investorWalletAddress,
        expected.investorIdentityAddress], executor,
    );
    return rows[0] || null;
  }

  async createPending(data, executor) {
    const registryRegistrationUid = createUid();
    await execute(
      `INSERT INTO \`identityRegistryRegistration\`
        (\`registryRegistrationUid\`, \`interestUid\`, \`tokenUid\`, \`organizationUid\`, \`investorUid\`,
         \`issuerUserUid\`, \`chainId\`, \`identityRegistryAddress\`, \`issuerWalletAddress\`,
         \`investorWalletAddress\`, \`investorIdentityAddress\`, \`countryCode\`, \`preparedAtBlock\`)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [registryRegistrationUid, data.interestUid, data.tokenUid, data.organizationUid, data.investorUid,
        data.issuerUserUid, data.chainId, data.identityRegistryAddress, data.issuerWalletAddress,
        data.investorWalletAddress, data.investorIdentityAddress, data.countryCode, data.preparedAtBlock ?? null],
      executor,
    );
    return this.findByUid(registryRegistrationUid, executor);
  }

  async createConfirmed(data, verified, executor) {
    const registryRegistrationUid = createUid();
    await execute(
      `INSERT INTO \`identityRegistryRegistration\`
        (\`registryRegistrationUid\`, \`interestUid\`, \`tokenUid\`, \`organizationUid\`, \`investorUid\`,
         \`issuerUserUid\`, \`chainId\`, \`identityRegistryAddress\`, \`issuerWalletAddress\`,
         \`investorWalletAddress\`, \`investorIdentityAddress\`, \`countryCode\`, \`status\`, \`txHash\`,
         \`preparedAtBlock\`, \`lastScannedBlock\`, \`blockNumber\`, \`blockHash\`, \`transactionIndex\`,
         \`logIndex\`, \`verifiedAt\`, \`syncStatus\`, \`syncCompletedAt\`)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'CONFIRMED', ?, ?, ?, ?, ?, ?, ?,
         UTC_TIMESTAMP(3), 'IDLE', UTC_TIMESTAMP(3))`,
      [registryRegistrationUid, data.interestUid, data.tokenUid, data.organizationUid, data.investorUid,
        data.issuerUserUid, data.chainId, data.identityRegistryAddress, data.issuerWalletAddress,
        data.investorWalletAddress, data.investorIdentityAddress, data.countryCode,
        verified.txHash.toLowerCase(), data.preparedAtBlock ?? verified.blockNumber,
        verified.blockNumber, verified.blockNumber, verified.blockHash || null,
        verified.transactionIndex, verified.logIndex], executor,
    );
    return this.findByUid(registryRegistrationUid, executor);
  }

  async assignTransaction(registryRegistrationUid, txHash, { allowReplacement = false } = {}, executor) {
    await execute(
      `UPDATE \`identityRegistryRegistration\`
       SET \`txHash\` = ?, \`errorCode\` = NULL, \`errorMessage\` = NULL,
           \`syncStatus\` = 'QUEUED', \`syncRequestedAt\` = UTC_TIMESTAMP(3), \`nextSyncAt\` = UTC_TIMESTAMP(3),
           \`updatedAt\` = UTC_TIMESTAMP(3)
       WHERE \`registryRegistrationUid\` = ? AND \`status\` = 'PENDING' AND \`isDeleted\` = 0
         AND (\`txHash\` IS NULL OR LOWER(\`txHash\`) = LOWER(?) OR ? = 1)`,
      [txHash.toLowerCase(), registryRegistrationUid, txHash, allowReplacement ? 1 : 0], executor,
    );
    return this.findByUid(registryRegistrationUid, executor);
  }

  async recordError(registryRegistrationUid, code, message, { retrySeconds = null } = {}, executor) {
    const retrySecondsSql = sqlInteger(retrySeconds == null ? 0 : retrySeconds, { name: 'retrySeconds' });
    await execute(
      `UPDATE \`identityRegistryRegistration\`
       SET \`errorCode\` = ?, \`errorMessage\` = ?,
           \`syncStatus\` = ?, \`syncCompletedAt\` = UTC_TIMESTAMP(3),
            \`nextSyncAt\` = CASE WHEN ? IS NULL THEN NULL ELSE DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ${retrySecondsSql} SECOND) END,
           \`updatedAt\` = UTC_TIMESTAMP(3)
       WHERE \`registryRegistrationUid\` = ? AND \`status\` = 'PENDING' AND \`isDeleted\` = 0`,
      [code, String(message || '').slice(0, 1000), retrySeconds === null ? 'IDLE' : 'FAILED',
        retrySeconds, registryRegistrationUid], executor,
    );
  }

  async confirm(registryRegistrationUid, data, executor) {
    const result = await execute(
      `UPDATE \`identityRegistryRegistration\`
       SET \`status\` = 'CONFIRMED', \`txHash\` = ?, \`blockNumber\` = ?, \`blockHash\` = ?,
           \`transactionIndex\` = ?, \`logIndex\` = ?, \`verifiedAt\` = UTC_TIMESTAMP(3),
           \`errorCode\` = NULL, \`errorMessage\` = NULL, \`syncStatus\` = 'IDLE',
           \`syncCompletedAt\` = UTC_TIMESTAMP(3), \`nextSyncAt\` = NULL,
           \`lastScannedBlock\` = GREATEST(COALESCE(\`lastScannedBlock\`, 0), ?),
           \`updatedAt\` = UTC_TIMESTAMP(3)
       WHERE \`registryRegistrationUid\` = ? AND \`status\` = 'PENDING' AND \`isDeleted\` = 0`,
      [data.txHash.toLowerCase(), data.blockNumber, data.blockHash || null, data.transactionIndex,
        data.logIndex, data.blockNumber, registryRegistrationUid], executor,
    );
    return result.affectedRows > 0;
  }

  async findRecoveryCandidates(limit = 100, executor) {
    const limitSql = sqlInteger(Math.max(1, Math.trunc(limit)), { min: 1, name: 'limit' });
    return execute(
      `SELECT * FROM \`identityRegistryRegistration\`
       WHERE \`status\` = 'PENDING' AND \`isDeleted\` = 0
         AND (\`txHash\` IS NULL OR \`errorCode\` IS NULL OR \`errorCode\` IN
           ('TRANSACTION_NOT_FOUND', 'INSUFFICIENT_CONFIRMATIONS', 'RPC_UNAVAILABLE', 'REGISTRY_STATE_UNAVAILABLE', 'CHAIN_REORGANIZATION'))
         AND \`syncStatus\` IN ('IDLE', 'QUEUED', 'FAILED')
         AND (\`nextSyncAt\` IS NULL OR \`nextSyncAt\` <= UTC_TIMESTAMP(3))
       ORDER BY (\`syncStatus\` = 'QUEUED') DESC, COALESCE(\`syncRequestedAt\`, \`createdAt\`) ASC LIMIT ${limitSql}`,
      [], executor,
    );
  }

  async markSyncProcessing(registryRegistrationUid, executor) {
    const result = await execute(
      `UPDATE \`identityRegistryRegistration\`
       SET \`syncStatus\` = 'PROCESSING', \`syncStartedAt\` = UTC_TIMESTAMP(3),
           \`syncAttempts\` = \`syncAttempts\` + 1, \`nextSyncAt\` = NULL, \`updatedAt\` = UTC_TIMESTAMP(3)
       WHERE \`registryRegistrationUid\` = ? AND \`status\` = 'PENDING' AND \`isDeleted\` = 0
         AND \`syncStatus\` IN ('IDLE', 'QUEUED', 'FAILED')`,
      [registryRegistrationUid], executor,
    );
    return result.affectedRows > 0;
  }

  async finishSync(registryRegistrationUid, { lastScannedBlock, errorCode = null, errorMessage = null, retrySeconds = 60 }, executor) {
    const retrySecondsSql = sqlInteger(retrySeconds == null ? 0 : retrySeconds, { name: 'retrySeconds' });
    await execute(
      `UPDATE \`identityRegistryRegistration\`
       SET \`syncStatus\` = ?, \`lastScannedBlock\` = COALESCE(?, \`lastScannedBlock\`),
           \`syncCompletedAt\` = UTC_TIMESTAMP(3), \`errorCode\` = ?, \`errorMessage\` = ?,
            \`nextSyncAt\` = CASE WHEN ? IS NULL THEN NULL ELSE DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ${retrySecondsSql} SECOND) END,
           \`updatedAt\` = UTC_TIMESTAMP(3)
       WHERE \`registryRegistrationUid\` = ? AND \`status\` = 'PENDING' AND \`isDeleted\` = 0`,
      [errorCode ? 'FAILED' : 'IDLE', lastScannedBlock ?? null, errorCode,
        errorMessage ? String(errorMessage).slice(0, 1000) : null, retrySeconds,
        registryRegistrationUid], executor,
    );
  }

  async listRegistryAddresses(executor) {
    const rows = await execute(
      `SELECT DISTINCT LOWER(\`identityRegistryAddress\`) AS \`identityRegistryAddress\`
       FROM \`tokenMaster\` WHERE \`status\` = 'deployed' AND \`identityRegistryAddress\` IS NOT NULL
         AND \`identityRegistryAddress\` <> '' AND \`isActive\` = 1 AND \`isDeleted\` = 0`,
      [], executor,
    );
    return rows.map((row) => row.identityRegistryAddress);
  }

  async findIndexerStartBlock(executor) {
    const rows = await execute(
      `SELECT MIN(COALESCE(\`deployedAtBlock\`, 0)) AS \`startBlock\` FROM \`tokenMaster\`
       WHERE \`status\` = 'deployed' AND \`identityRegistryAddress\` IS NOT NULL AND \`isDeleted\` = 0`,
      [], executor,
    );
    return Number(rows[0]?.startBlock || 0);
  }

  async storeEvents(events, executor) {
    for (const event of events) {
      await execute(
        `INSERT INTO \`identityRegistryBlockchainEvent\`
          (\`registryEventUid\`, \`chainId\`, \`identityRegistryAddress\`, \`investorWalletAddress\`,
           \`investorIdentityAddress\`, \`eventName\`, \`txHash\`, \`blockNumber\`, \`blockHash\`,
           \`transactionIndex\`, \`logIndex\`)
         VALUES (?, ?, ?, ?, ?, 'IdentityRegistered', ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE \`blockHash\` = VALUES(\`blockHash\`), \`isCanonical\` = TRUE,
           \`isActive\` = TRUE, \`isDeleted\` = FALSE, \`updatedAt\` = UTC_TIMESTAMP(3)`,
        [createUid(), event.chainId, event.identityRegistryAddress, event.investorWalletAddress,
          event.investorIdentityAddress, event.txHash, event.blockNumber, event.blockHash || null,
          event.transactionIndex, event.logIndex], executor,
      );
    }
  }

  async listProcessableEvents(chainId, limit = 200, executor) {
    const limitSql = sqlInteger(Math.max(1, Math.trunc(limit)), { min: 1, name: 'limit' });
    return execute(
      `SELECT * FROM \`identityRegistryBlockchainEvent\`
       WHERE \`chainId\` = ? AND \`processingStatus\` IN ('NEW', 'UNMATCHED', 'FAILED')
         AND \`processingAttempts\` < 20 AND \`isCanonical\` = 1 AND \`isDeleted\` = 0
       ORDER BY \`blockNumber\`, \`transactionIndex\`, \`logIndex\` LIMIT ${limitSql}`,
      [chainId], executor,
    );
  }

  async findPendingForEvent(event, executor) {
    const rows = await execute(
      `SELECT * FROM \`identityRegistryRegistration\`
       WHERE \`chainId\` = ? AND LOWER(\`identityRegistryAddress\`) = LOWER(?)
         AND LOWER(\`investorWalletAddress\`) = LOWER(?) AND LOWER(\`investorIdentityAddress\`) = LOWER(?)
         AND \`status\` = 'PENDING' AND \`isDeleted\` = 0 ORDER BY \`createdAt\` ASC LIMIT 1`,
      [event.chainId, event.identityRegistryAddress, event.investorWalletAddress, event.investorIdentityAddress], executor,
    );
    return rows[0] || null;
  }

  async markEvent(registryEventUid, status, matchedRegistrationUid, message, options = {}, executor) {
    const terminal = options.terminal === true;
    await execute(
      `UPDATE \`identityRegistryBlockchainEvent\` SET \`processingStatus\` = ?,
         \`matchedRegistrationUid\` = ?,
         \`processingAttempts\` = CASE WHEN ? = 1 THEN 20 ELSE \`processingAttempts\` + 1 END,
         \`processingMessage\` = ?, \`processedAt\` = UTC_TIMESTAMP(3), \`updatedAt\` = UTC_TIMESTAMP(3)
       WHERE \`registryEventUid\` = ? AND \`isDeleted\` = 0`,
      [status, matchedRegistrationUid || null, terminal ? 1 : 0,
        message ? String(message).slice(0, 2000) : null, registryEventUid], executor,
    );
  }

  // Reorg rewind: orphan raw events and move any affected confirmations back to PENDING so the
  // canonical-chain scan can independently verify them again. The txHash is retained as a hint,
  // never as proof.
  async rewindAfterBlock(chainId, blockNumber, executor) {
    await execute(
      `UPDATE \`identityRegistryBlockchainEvent\`
       SET \`isCanonical\` = 0, \`processingStatus\` = 'NEW', \`matchedRegistrationUid\` = NULL,
           \`processingMessage\` = 'Event orphaned by checkpoint rewind.', \`processedAt\` = NULL,
           \`updatedAt\` = UTC_TIMESTAMP(3)
       WHERE \`chainId\` = ? AND \`blockNumber\` > ? AND \`isDeleted\` = 0`,
      [chainId, blockNumber], executor,
    );
    await execute(
      `UPDATE \`identityRegistryRegistration\`
       SET \`status\` = 'PENDING', \`blockNumber\` = NULL, \`blockHash\` = NULL,
           \`transactionIndex\` = NULL, \`logIndex\` = NULL, \`verifiedAt\` = NULL,
           \`errorCode\` = 'CHAIN_REORGANIZATION',
           \`errorMessage\` = 'Previously verified block is no longer canonical; verification was queued again.',
           \`syncStatus\` = 'QUEUED', \`syncRequestedAt\` = UTC_TIMESTAMP(3), \`nextSyncAt\` = UTC_TIMESTAMP(3),
           \`updatedAt\` = UTC_TIMESTAMP(3)
       WHERE \`chainId\` = ? AND \`status\` = 'CONFIRMED' AND \`blockNumber\` > ? AND \`isDeleted\` = 0`,
      [chainId, blockNumber], executor,
    );
  }
}

module.exports = { IdentityRegistryRegistrationRepository };
