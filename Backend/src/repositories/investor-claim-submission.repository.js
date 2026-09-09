const { execute } = require('../database/connection');
const { createUid } = require('../utils/token');
const { identifier } = require('./base.repository');

const submissionFields = [
  'interestUid', 'claimSignatureUid', 'investorUid', 'tokenUid', 'organizationUid',
  'claimTopic', 'data', 'signature', 'investorIdentityAddress', 'issuerIdentityAddress',
  'preparedAtBlock', 'lastScannedBlock', 'txHash', 'blockNumber', 'transactionIndex', 'logIndex',
  'status', 'failureReason', 'syncStatus', 'syncRequestedAt', 'syncStartedAt', 'syncCompletedAt',
  'syncAttempts', 'syncFailureReason', 'nextSyncAt', 'submittedAt', 'confirmedAt',
];
const submissionUpdatableFields = [
  'preparedAtBlock', 'lastScannedBlock', 'txHash', 'blockNumber', 'transactionIndex', 'logIndex',
  'status', 'failureReason', 'syncStatus', 'syncRequestedAt', 'syncStartedAt', 'syncCompletedAt',
  'syncAttempts', 'syncFailureReason', 'nextSyncAt', 'submittedAt', 'confirmedAt',
];

class InvestorClaimSubmissionRepository {
  async findByInterestAndSignature(interestUid, claimSignatureUid, executor) {
    const rows = await execute(
      'SELECT * FROM `investorClaimSubmission` WHERE `interestUid` = ? AND `claimSignatureUid` = ? AND `isDeleted` = 0 LIMIT 1',
      [interestUid, claimSignatureUid],
      executor,
    );
    return rows[0] || null;
  }

  async create(data, executor) {
    const submissionUid = createUid();
    const entries = Object.entries(data).filter(([field, value]) => submissionFields.includes(field) && value !== undefined);
    const columns = ['`submissionUid`', ...entries.map(([field]) => identifier(field))];
    await execute(
      `INSERT INTO \`investorClaimSubmission\` (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
      [submissionUid, ...entries.map(([, value]) => value)],
      executor,
    );
    return this.findByUid(submissionUid, executor);
  }

  async findByUid(submissionUid, executor) {
    const rows = await execute(
      'SELECT * FROM `investorClaimSubmission` WHERE `submissionUid` = ? AND `isDeleted` = 0 LIMIT 1',
      [submissionUid],
      executor,
    );
    return rows[0] || null;
  }

  async findByEvent(txHash, logIndex, executor) {
    const rows = await execute(
      `SELECT * FROM \`investorClaimSubmission\`
       WHERE LOWER(\`txHash\`) = LOWER(?) AND \`logIndex\` = ? AND \`isDeleted\` = 0 LIMIT 1`,
      [txHash, logIndex],
      executor,
    );
    return rows[0] || null;
  }

  async update(submissionUid, data, executor) {
    const entries = Object.entries(data).filter(([field, value]) => submissionUpdatableFields.includes(field) && value !== undefined);
    if (!entries.length) return this.findByUid(submissionUid, executor);
    await execute(
      `UPDATE \`investorClaimSubmission\`
       SET ${entries.map(([field]) => `${identifier(field)} = ?`).join(', ')}, \`updatedAt\` = UTC_TIMESTAMP(3)
       WHERE \`submissionUid\` = ? AND \`isDeleted\` = 0`,
      [...entries.map(([, value]) => value), submissionUid],
      executor,
    );
    return this.findByUid(submissionUid, executor);
  }

  // Creates the submission row if missing, otherwise updates it. Idempotent per
  // (interestUid, claimSignatureUid).
  async upsert(base, mutable, executor) {
    const existing = await this.findByInterestAndSignature(base.interestUid, base.claimSignatureUid, executor);
    if (existing) return this.update(existing.submissionUid, mutable, executor);
    return this.create({ ...base, ...mutable }, executor);
  }

  // Distinct claim topics CONFIRMED for an interest (drives the required-vs-confirmed check).
  async listConfirmedTopics(interestUid, executor) {
    const rows = await execute(
      "SELECT DISTINCT `claimTopic` FROM `investorClaimSubmission` WHERE `interestUid` = ? AND `status` = 'CONFIRMED' AND `isDeleted` = 0",
      [interestUid],
      executor,
    );
    return rows.map((row) => Number(row.claimTopic));
  }

  // Recovery candidates: prepared submissions that never recorded a transaction. These are the
  // suspicious/incomplete rows the fallback runner tries to reconcile from the chain.
  async findRecoveryCandidates(limit = 100, executor) {
    return execute(
      `SELECT * FROM \`investorClaimSubmission\`
       WHERE \`status\` = 'PENDING' AND \`txHash\` IS NULL AND \`isDeleted\` = 0
         AND \`syncStatus\` IN ('IDLE', 'QUEUED', 'FAILED')
         AND (\`nextSyncAt\` IS NULL OR \`nextSyncAt\` <= UTC_TIMESTAMP(3))
       ORDER BY (\`syncStatus\` = 'QUEUED') DESC, COALESCE(\`syncRequestedAt\`, \`createdAt\`) ASC
       LIMIT ?`,
      [Math.max(1, Math.trunc(limit))],
      executor,
    );
  }

  async markSyncProcessing(submissionUid, executor) {
    const result = await execute(
      `UPDATE \`investorClaimSubmission\`
       SET \`syncStatus\` = 'PROCESSING', \`syncStartedAt\` = UTC_TIMESTAMP(3),
           \`syncAttempts\` = \`syncAttempts\` + 1, \`syncFailureReason\` = NULL,
           \`nextSyncAt\` = NULL,
           \`updatedAt\` = UTC_TIMESTAMP(3)
       WHERE \`submissionUid\` = ? AND \`status\` = 'PENDING' AND \`txHash\` IS NULL
         AND \`syncStatus\` IN ('IDLE', 'QUEUED', 'FAILED') AND \`isDeleted\` = 0`,
      [submissionUid],
      executor,
    );
    return result.affectedRows > 0;
  }

  async queueSynchronization(submissionUid, executor) {
    await execute(
      `UPDATE \`investorClaimSubmission\`
       SET \`syncStatus\` = CASE WHEN \`syncStatus\` = 'PROCESSING' THEN 'PROCESSING' ELSE 'QUEUED' END,
           \`syncRequestedAt\` = COALESCE(\`syncRequestedAt\`, UTC_TIMESTAMP(3)),
           \`syncFailureReason\` = NULL, \`nextSyncAt\` = UTC_TIMESTAMP(3),
           \`updatedAt\` = UTC_TIMESTAMP(3)
       WHERE \`submissionUid\` = ? AND \`status\` <> 'CONFIRMED' AND \`isDeleted\` = 0`,
      [submissionUid],
      executor,
    );
    return this.findByUid(submissionUid, executor);
  }

  async finishSynchronization(submissionUid, {
    syncStatus = 'IDLE', lastScannedBlock, failureReason = null, nextRetrySeconds = 60,
  } = {}, executor) {
    await execute(
      `UPDATE \`investorClaimSubmission\`
       SET \`syncStatus\` = ?, \`lastScannedBlock\` = COALESCE(?, \`lastScannedBlock\`),
           \`syncCompletedAt\` = UTC_TIMESTAMP(3), \`syncFailureReason\` = ?,
           \`nextSyncAt\` = CASE WHEN ? IS NULL THEN NULL ELSE DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ? SECOND) END,
           \`updatedAt\` = UTC_TIMESTAMP(3)
       WHERE \`submissionUid\` = ? AND \`isDeleted\` = 0`,
      [syncStatus, lastScannedBlock ?? null, failureReason ? String(failureReason).slice(0, 1000) : null,
        nextRetrySeconds, nextRetrySeconds || 0, submissionUid],
      executor,
    );
  }

  async findChainMatchCandidates({ identityAddress, issuerIdentityAddress, claimTopic }, executor) {
    return execute(
      `SELECT * FROM \`investorClaimSubmission\`
       WHERE LOWER(\`investorIdentityAddress\`) = LOWER(?)
         AND LOWER(\`issuerIdentityAddress\`) = LOWER(?)
         AND \`claimTopic\` = ? AND \`status\` IN ('PENDING', 'FAILED') AND \`isDeleted\` = 0
       ORDER BY \`submittedAt\` ASC, \`createdAt\` ASC`,
      [identityAddress, issuerIdentityAddress, claimTopic],
      executor,
    );
  }

  async confirmFromEvent(submissionUid, data, executor) {
    const result = await execute(
      `UPDATE \`investorClaimSubmission\`
       SET \`txHash\` = ?, \`blockNumber\` = ?, \`transactionIndex\` = ?, \`logIndex\` = ?,
           \`status\` = 'CONFIRMED', \`failureReason\` = NULL, \`confirmedAt\` = UTC_TIMESTAMP(3),
           \`syncStatus\` = 'IDLE', \`syncCompletedAt\` = UTC_TIMESTAMP(3),
           \`syncFailureReason\` = NULL, \`nextSyncAt\` = NULL,
           \`lastScannedBlock\` = GREATEST(COALESCE(\`lastScannedBlock\`, 0), ?),
           \`updatedAt\` = UTC_TIMESTAMP(3)
       WHERE \`submissionUid\` = ? AND \`status\` <> 'CONFIRMED' AND \`isDeleted\` = 0`,
      [data.txHash, data.blockNumber, data.transactionIndex, data.logIndex, data.blockNumber, submissionUid],
      executor,
    );
    return result.affectedRows > 0;
  }

  // Atomic conditional recovery. Only writes when the row is still an unrecovered candidate
  // (txHash IS NULL AND status = 'PENDING'), so it can never overwrite a value the normal
  // submit flow (or another worker) already set. Returns true when it recovered this row.
  async recoverSubmission(submissionUid, data, executor) {
    const result = await execute(
      `UPDATE \`investorClaimSubmission\`
       SET \`txHash\` = ?, \`blockNumber\` = ?, \`transactionIndex\` = ?, \`logIndex\` = ?,
           \`status\` = ?, \`confirmedAt\` = ?, \`failureReason\` = NULL,
           \`syncStatus\` = 'IDLE', \`syncCompletedAt\` = UTC_TIMESTAMP(3),
           \`syncFailureReason\` = NULL, \`nextSyncAt\` = NULL,
           \`lastScannedBlock\` = GREATEST(COALESCE(\`lastScannedBlock\`, 0), ?),
           \`updatedAt\` = UTC_TIMESTAMP(3)
       WHERE \`submissionUid\` = ? AND \`txHash\` IS NULL AND \`status\` = 'PENDING' AND \`isDeleted\` = 0`,
      [data.txHash, data.blockNumber, data.transactionIndex, data.logIndex, data.status,
        data.confirmedAt || null, data.blockNumber, submissionUid],
      executor,
    );
    return result.affectedRows > 0;
  }

  async listByInterest(interestUid, executor) {
    return execute(
      `SELECT \`submissionUid\`, \`claimSignatureUid\`, \`claimTopic\`, \`status\`, \`txHash\`, \`blockNumber\`,
              \`transactionIndex\`, \`logIndex\`, \`failureReason\`, \`syncStatus\`, \`syncFailureReason\`,
              \`preparedAtBlock\`, \`lastScannedBlock\`, \`submittedAt\`, \`confirmedAt\`
       FROM \`investorClaimSubmission\`
       WHERE \`interestUid\` = ? AND \`isDeleted\` = 0
       ORDER BY \`claimTopic\` ASC`,
      [interestUid],
      executor,
    );
  }
}

module.exports = { InvestorClaimSubmissionRepository, submissionFields };
