const { execute } = require('../database/connection');
const { createUid } = require('../utils/token');
const { logger } = require('./common/log.service');
const { emailArray } = require('../schemas/admin-platform.schema');
const { verifiedAccountTeamEmail } = require('./common/email-template.service');

class VerificationTeamNotificationService {
  constructor({ settingRepository, emailService, query = execute }) {
    Object.assign(this, { settingRepository, emailService, query });
  }
  async enqueue(user, executor) {
    if (!['Issuer', 'Investor'].includes(user.roleName)) return;
    // Unique userUid prevents repeat verification links from creating duplicate notices.
    await this.query(`INSERT INTO verificationTeamNotification (notificationUid,userUid,fullName,email,roleName)
      VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE userUid=VALUES(userUid)`,
    [createUid(), user.userUid, user.fullName, user.email, user.roleName], executor);
  }
  async run() {
    const setting = await this.settingRepository.findByKey('TeamNotificationEmails');
    if (!setting || !setting.isActive) return;
    let parsed;
    try { parsed = JSON.parse(setting.settingValue); } catch { throw new Error('Invalid TeamNotificationEmails JSON'); }
    const { value: recipients, error } = emailArray.validate(parsed);
    if (error) throw new Error('Invalid TeamNotificationEmails addresses');
    // [] pauses delivery without dropping already queued notices.
    if (!recipients.length) return;
    const rows = await this.query(`SELECT notificationUid,fullName,email,roleName FROM verificationTeamNotification
      WHERE status<>'SENT' AND (nextAttemptAt IS NULL OR nextAttemptAt<=UTC_TIMESTAMP(3))
        AND (leaseUntil IS NULL OR leaseUntil<UTC_TIMESTAMP(3)) ORDER BY createdAt LIMIT 10`);
    for (const row of rows) {
      const leaseToken = createUid();
      const lease = await this.query(`UPDATE verificationTeamNotification SET status='SENDING',leaseToken=?,
        leaseUntil=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 5 MINUTE),attempts=attempts+1
        WHERE notificationUid=? AND status<>'SENT' AND (leaseUntil IS NULL OR leaseUntil<UTC_TIMESTAMP(3))
        AND (nextAttemptAt IS NULL OR nextAttemptAt<=UTC_TIMESTAMP(3))`, [leaseToken, row.notificationUid]);
      if (!lease.affectedRows) continue;
      try {
        await this.emailService.sendEmail({ to: recipients, ...verifiedAccountTeamEmail(row) });
        await this.query(`UPDATE verificationTeamNotification SET status='SENT',sentAt=UTC_TIMESTAMP(3),
          leaseUntil=NULL,leaseToken=NULL,lastError=NULL WHERE notificationUid=? AND leaseToken=?`, [row.notificationUid, leaseToken]);
      } catch (error) {
        await this.query(`UPDATE verificationTeamNotification SET status='PENDING',leaseUntil=NULL,leaseToken=NULL,
          nextAttemptAt=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 5 MINUTE),lastError=?
          WHERE notificationUid=? AND leaseToken=?`, [String(error.code || 'EMAIL_DELIVERY_FAILED').slice(0,100), row.notificationUid, leaseToken]);
        logger.warn('Team verification email will retry', { notificationUid: row.notificationUid, code: error.code });
      }
    }
  }
}
module.exports = { VerificationTeamNotificationService };
