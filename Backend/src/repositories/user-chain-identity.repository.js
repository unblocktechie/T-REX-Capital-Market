const { execute } = require('../database/connection');
const { createUid } = require('../utils/token');

const present = (row) => row ? ({
  userChainIdentityUid: row.userChainIdentityUid,
  userUid: row.userUid,
  chainUid: row.chainUid,
  chainId: Number(row.chainId),
  roleName: row.roleName,
  walletAddress: row.walletAddress,
  identityAddress: row.identityAddress || null,
  identityFactoryAddress: row.identityFactoryAddress,
  creationTxHash: row.creationTxHash || null,
  creationBlockNumber: row.creationBlockNumber === null ? null : Number(row.creationBlockNumber),
  status: row.status,
  isUnlocked: Boolean(row.isUnlocked),
  errorCode: row.errorCode || null,
  errorMessage: row.errorMessage || null,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
}) : null;

class UserChainIdentityRepository {
  async find(userUid, chainUid, executor, { forUpdate = false } = {}) {
    const rows = await execute(
      `SELECT uci.*, c.\`chainId\`
       FROM \`userChainIdentity\` uci
       INNER JOIN \`chainMaster\` c ON c.\`chainUid\` = uci.\`chainUid\`
       WHERE uci.\`userUid\` = ? AND uci.\`chainUid\` = ? AND uci.\`isDeleted\` = 0
       LIMIT 1${forUpdate ? ' FOR UPDATE' : ''}`,
      [userUid, chainUid], executor,
    );
    return present(rows[0]);
  }

  async listByUser(userUid, executor) {
    const rows = await execute(
      `SELECT uci.*, c.\`chainId\`
       FROM \`userChainIdentity\` uci
       INNER JOIN \`chainMaster\` c ON c.\`chainUid\` = uci.\`chainUid\`
       WHERE uci.\`userUid\` = ? AND uci.\`isDeleted\` = 0`,
      [userUid], executor,
    );
    return rows.map(present);
  }

  async reserve(data, executor) {
    const existing = await this.find(data.userUid, data.chainUid, executor);
    if (existing?.status === 'CREATED' || existing?.status === 'CREATING') {
      return { record: existing, reservationAcquired: false };
    }
    if (existing?.status === 'FAILED') {
      const updated = await execute(
        `UPDATE \`userChainIdentity\`
         SET \`status\` = 'CREATING', \`isUnlocked\` = FALSE, \`roleName\` = ?, \`walletAddress\` = ?,
             \`identityFactoryAddress\` = ?, \`errorCode\` = NULL, \`errorMessage\` = NULL,
             \`updatedAt\` = UTC_TIMESTAMP(3)
         WHERE \`userUid\` = ? AND \`chainUid\` = ? AND \`status\` = 'FAILED' AND \`isDeleted\` = 0`,
        [data.roleName, data.walletAddress, data.identityFactoryAddress, data.userUid, data.chainUid], executor,
      );
      return { record: await this.find(data.userUid, data.chainUid, executor), reservationAcquired: updated.affectedRows > 0 };
    }
    try {
      await execute(
        `INSERT INTO \`userChainIdentity\`
         (\`userChainIdentityUid\`,\`userUid\`,\`chainUid\`,\`roleName\`,\`walletAddress\`,
          \`identityFactoryAddress\`,\`status\`,\`isUnlocked\`)
         VALUES (?,?,?,?,?,?, 'CREATING', FALSE)`,
        [createUid(), data.userUid, data.chainUid, data.roleName, data.walletAddress, data.identityFactoryAddress], executor,
      );
      return { record: await this.find(data.userUid, data.chainUid, executor), reservationAcquired: true };
    } catch (error) {
      if (error?.code !== 'ER_DUP_ENTRY') throw error;
      return { record: await this.find(data.userUid, data.chainUid, executor), reservationAcquired: false };
    }
  }

  async invalidateForFactoryChange(userUid, chainUid, identityFactoryAddress, executor) {
    await execute(
      `UPDATE \`userChainIdentity\`
       SET \`identityFactoryAddress\` = ?, \`identityAddress\` = NULL,
           \`creationTxHash\` = NULL, \`creationBlockNumber\` = NULL, \`creationBlockHash\` = NULL,
           \`status\` = 'FAILED', \`isUnlocked\` = FALSE, \`unlockedAt\` = NULL,
           \`errorCode\` = 'IDENTITY_FACTORY_REDEPLOYED',
           \`errorMessage\` = 'The chain Identity Factory changed. Unlock this network again to create or recover the current ONCHAINID.',
           \`updatedAt\` = UTC_TIMESTAMP(3)
       WHERE \`userUid\` = ? AND \`chainUid\` = ? AND \`isDeleted\` = 0
         AND LOWER(\`identityFactoryAddress\`) <> LOWER(?)`,
      [identityFactoryAddress, userUid, chainUid, identityFactoryAddress], executor,
    );
    return this.find(userUid, chainUid, executor);
  }

  async markCreated(userUid, chainUid, data, executor) {
    await execute(
      `UPDATE \`userChainIdentity\`
       SET \`identityAddress\` = ?, \`creationTxHash\` = COALESCE(?, \`creationTxHash\`),
           \`creationBlockNumber\` = COALESCE(?, \`creationBlockNumber\`),
           \`creationBlockHash\` = COALESCE(?, \`creationBlockHash\`),
           \`status\` = 'CREATED', \`isUnlocked\` = TRUE, \`unlockedAt\` = UTC_TIMESTAMP(3),
           \`errorCode\` = NULL, \`errorMessage\` = NULL, \`updatedAt\` = UTC_TIMESTAMP(3)
       WHERE \`userUid\` = ? AND \`chainUid\` = ? AND \`isDeleted\` = 0`,
      [data.identityAddress, data.txHash || null, data.blockNumber || null, data.blockHash || null, userUid, chainUid], executor,
    );
    return this.find(userUid, chainUid, executor);
  }

  async markFailed(userUid, chainUid, errorCode, errorMessage, txHash = null, executor) {
    await execute(
      `UPDATE \`userChainIdentity\`
       SET \`status\` = 'FAILED', \`isUnlocked\` = FALSE,
           \`creationTxHash\` = COALESCE(?, \`creationTxHash\`), \`errorCode\` = ?, \`errorMessage\` = ?,
           \`updatedAt\` = UTC_TIMESTAMP(3)
       WHERE \`userUid\` = ? AND \`chainUid\` = ? AND \`isDeleted\` = 0`,
      [txHash, errorCode, String(errorMessage || '').slice(0, 2000), userUid, chainUid], executor,
    );
    return this.find(userUid, chainUid, executor);
  }

  async backfillCreated(data, executor) {
    const reservation = await this.reserve(data, executor);
    if (!reservation.record) throw new Error('Could not reserve chain identity row.');
    return this.markCreated(data.userUid, data.chainUid, data, executor);
  }
}

module.exports = { UserChainIdentityRepository, presentUserChainIdentity: present };
