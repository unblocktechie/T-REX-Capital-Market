const { execute } = require('../database/connection');
const { createUid } = require('../utils/token');
const { sqlInteger } = require('../utils/sql');

class ClaimIndexerRepository {
  async ensureCheckpoint(indexerName, chainId, startBlock = 0, executor) {
    await execute(
      `INSERT INTO \`blockchainIndexerCheckpoint\`
        (\`checkpointUid\`, \`indexerName\`, \`chainId\`, \`startBlock\`, \`lastIndexedBlock\`)
       VALUES (?, ?, ?, ?, 0)
       ON DUPLICATE KEY UPDATE
         \`startBlock\` = IF(\`lastIndexedBlock\` = 0 AND \`startBlock\` = 0, VALUES(\`startBlock\`), \`startBlock\`),
         \`isActive\` = TRUE, \`isDeleted\` = FALSE, \`updatedAt\` = UTC_TIMESTAMP(3)`,
      [createUid(), indexerName, chainId, Math.max(0, Math.trunc(startBlock))],
      executor,
    );
    return this.findCheckpoint(indexerName, chainId, executor);
  }

  async findCheckpoint(indexerName, chainId, executor) {
    const rows = await execute(
      `SELECT * FROM \`blockchainIndexerCheckpoint\`
       WHERE \`indexerName\` = ? AND \`chainId\` = ? AND \`isDeleted\` = 0 LIMIT 1`,
      [indexerName, chainId],
      executor,
    );
    return rows[0] || null;
  }

  async acquireLease(indexerName, chainId, leaseOwner, leaseSeconds, executor) {
    const leaseSecondsSql = sqlInteger(Math.max(10, Math.trunc(leaseSeconds)), { min: 10, name: 'leaseSeconds' });
    const result = await execute(
      `UPDATE \`blockchainIndexerCheckpoint\`
       SET \`leaseOwner\` = ?,
            \`leaseExpiresAt\` = DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ${leaseSecondsSql} SECOND),
           \`lastRunAt\` = UTC_TIMESTAMP(3),
           \`updatedAt\` = UTC_TIMESTAMP(3)
       WHERE \`indexerName\` = ? AND \`chainId\` = ? AND \`isActive\` = 1 AND \`isDeleted\` = 0
         AND (\`leaseOwner\` IS NULL OR \`leaseExpiresAt\` IS NULL OR \`leaseExpiresAt\` < UTC_TIMESTAMP(3) OR \`leaseOwner\` = ?)`,
      [leaseOwner, indexerName, chainId, leaseOwner],
      executor,
    );
    return result.affectedRows > 0;
  }

  async renewLease(indexerName, chainId, leaseOwner, leaseSeconds, executor) {
    const leaseSecondsSql = sqlInteger(Math.max(10, Math.trunc(leaseSeconds)), { min: 10, name: 'leaseSeconds' });
    const result = await execute(
      `UPDATE \`blockchainIndexerCheckpoint\`
       SET \`leaseExpiresAt\` = DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ${leaseSecondsSql} SECOND),
           \`updatedAt\` = UTC_TIMESTAMP(3)
       WHERE \`indexerName\` = ? AND \`chainId\` = ? AND \`leaseOwner\` = ? AND \`isDeleted\` = 0`,
      [indexerName, chainId, leaseOwner],
      executor,
    );
    return result.affectedRows > 0;
  }

  async advanceCheckpoint(indexerName, chainId, leaseOwner, blockNumber, blockHash, executor) {
    const result = await execute(
      `UPDATE \`blockchainIndexerCheckpoint\`
       SET \`lastIndexedBlock\` = ?, \`lastIndexedBlockHash\` = ?,
           \`lastSuccessAt\` = UTC_TIMESTAMP(3), \`lastErrorMessage\` = NULL,
           \`updatedAt\` = UTC_TIMESTAMP(3)
       WHERE \`indexerName\` = ? AND \`chainId\` = ? AND \`leaseOwner\` = ? AND \`isDeleted\` = 0`,
      [blockNumber, blockHash || null, indexerName, chainId, leaseOwner],
      executor,
    );
    return result.affectedRows > 0;
  }

  async releaseLease(indexerName, chainId, leaseOwner, errorMessage = null, executor) {
    await execute(
      `UPDATE \`blockchainIndexerCheckpoint\`
       SET \`leaseOwner\` = NULL, \`leaseExpiresAt\` = NULL,
           \`lastErrorMessage\` = ?, \`updatedAt\` = UTC_TIMESTAMP(3)
       WHERE \`indexerName\` = ? AND \`chainId\` = ? AND \`leaseOwner\` = ? AND \`isDeleted\` = 0`,
      [errorMessage ? String(errorMessage).slice(0, 2000) : null, indexerName, chainId, leaseOwner],
      executor,
    );
  }

  async listIdentityAddresses(executor) {
    const rows = await execute(
      `SELECT DISTINCT LOWER(\`contractAddress\`) AS \`identityAddress\`
       FROM \`investorMaster\`
       WHERE \`contractAddress\` IS NOT NULL AND \`contractAddress\` <> ''
         AND \`status\` = 'submitted' AND \`isActive\` = 1 AND \`isDeleted\` = 0
       ORDER BY \`identityAddress\``,
      [],
      executor,
    );
    return rows.map((row) => row.identityAddress);
  }

  async storeEvents(events, executor) {
    for (const event of events) {
      await execute(
        `INSERT INTO \`investorClaimBlockchainEvent\`
          (\`claimEventUid\`, \`chainId\`, \`identityAddress\`, \`claimId\`, \`claimTopic\`, \`scheme\`,
           \`issuerIdentityAddress\`, \`data\`, \`signature\`, \`uri\`, \`eventName\`, \`txHash\`,
           \`blockNumber\`, \`blockHash\`, \`transactionIndex\`, \`logIndex\`)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           \`blockHash\` = VALUES(\`blockHash\`), \`isCanonical\` = TRUE,
           \`isActive\` = TRUE, \`isDeleted\` = FALSE, \`updatedAt\` = UTC_TIMESTAMP(3)`,
        [
          createUid(), event.chainId, event.identityAddress, event.claimId, event.claimTopic, event.scheme,
          event.issuerIdentityAddress, event.data, event.signature, event.uri || null, event.eventName,
          event.txHash, event.blockNumber, event.blockHash || null, event.transactionIndex, event.logIndex,
        ],
        executor,
      );
    }
  }

  async listProcessableEvents(chainId, limit = 200, executor) {
    const limitSql = sqlInteger(Math.max(1, Math.trunc(limit)), { min: 1, name: 'limit' });
    return execute(
      `SELECT * FROM \`investorClaimBlockchainEvent\`
       WHERE \`chainId\` = ? AND \`processingStatus\` IN ('NEW', 'UNMATCHED', 'FAILED')
         AND \`isCanonical\` = 1 AND \`isDeleted\` = 0 AND \`processingAttempts\` < 20
       ORDER BY \`blockNumber\` ASC, \`transactionIndex\` ASC, \`logIndex\` ASC
       LIMIT ${limitSql}`,
      [chainId],
      executor,
    );
  }

  async findEventsForClaim({ chainId, identityAddress, issuerIdentityAddress, claimTopic }, limit = 20, executor) {
    const limitSql = sqlInteger(Math.max(1, Math.trunc(limit)), { min: 1, name: 'limit' });
    return execute(
      `SELECT * FROM \`investorClaimBlockchainEvent\`
       WHERE \`chainId\` = ? AND LOWER(\`identityAddress\`) = LOWER(?)
         AND LOWER(\`issuerIdentityAddress\`) = LOWER(?) AND \`claimTopic\` = ?
         AND \`isCanonical\` = 1 AND \`isDeleted\` = 0
       ORDER BY \`blockNumber\` DESC, \`transactionIndex\` DESC, \`logIndex\` DESC
       LIMIT ${limitSql}`,
      [chainId, identityAddress, issuerIdentityAddress, claimTopic],
      executor,
    );
  }

  async markEvent(claimEventUid, { status, matchedSubmissionUid, message }, executor) {
    await execute(
      `UPDATE \`investorClaimBlockchainEvent\`
       SET \`processingStatus\` = ?, \`matchedSubmissionUid\` = ?,
           \`processingAttempts\` = \`processingAttempts\` + 1,
           \`processingMessage\` = ?, \`processedAt\` = UTC_TIMESTAMP(3),
           \`updatedAt\` = UTC_TIMESTAMP(3)
       WHERE \`claimEventUid\` = ? AND \`isDeleted\` = 0`,
      [status, matchedSubmissionUid || null, message ? String(message).slice(0, 2000) : null, claimEventUid],
      executor,
    );
  }
}

module.exports = { ClaimIndexerRepository };
