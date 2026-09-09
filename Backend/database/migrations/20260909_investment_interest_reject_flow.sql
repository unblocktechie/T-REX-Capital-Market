-- Investment interest: submitIntrest status + issuer reject / resubmission flow (MySQL 8+).
-- 1) status gains 'submitIntrest' (issuer sees only these; 'pending' = docs still missing).
-- 2) reject-flow columns: rejectReasonType (DOC_REJECTED / OTHER), rejectReason (description),
--    rejectedClaim (comma-separated claim-topic codes), rejectedCount (resubmission limit),
--    canResubmitClaim (resubmissions used so far).
-- 3) Issuer reject + approve permissions.
-- Idempotent, no foreign keys, camelCase, UTC. Safe to re-run.

USE `trexCapitalMarket`;
SET time_zone = '+00:00';

-- 1) status enum: add 'submitIntrest' (MODIFY is idempotent).
ALTER TABLE `tokenInvestmentInterest`
  MODIFY COLUMN `status` ENUM('pending', 'submitIntrest', 'approved', 'rejected', 'cancelled')
    NOT NULL DEFAULT 'pending';

-- 2) reject-flow columns (guarded).
SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tokenInvestmentInterest' AND COLUMN_NAME = 'rejectReasonType');
SET @sql := IF(@c = 0,
  'ALTER TABLE `tokenInvestmentInterest` ADD COLUMN `rejectReasonType` VARCHAR(40) NULL AFTER `note`', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tokenInvestmentInterest' AND COLUMN_NAME = 'rejectReason');
SET @sql := IF(@c = 0,
  'ALTER TABLE `tokenInvestmentInterest` ADD COLUMN `rejectReason` VARCHAR(1000) NULL AFTER `rejectReasonType`', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tokenInvestmentInterest' AND COLUMN_NAME = 'rejectedClaim');
SET @sql := IF(@c = 0,
  'ALTER TABLE `tokenInvestmentInterest` ADD COLUMN `rejectedClaim` VARCHAR(500) NULL AFTER `rejectReason`', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tokenInvestmentInterest' AND COLUMN_NAME = 'rejectedCount');
SET @sql := IF(@c = 0,
  'ALTER TABLE `tokenInvestmentInterest` ADD COLUMN `rejectedCount` INT NOT NULL DEFAULT 3 AFTER `rejectedClaim`', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tokenInvestmentInterest' AND COLUMN_NAME = 'canResubmitClaim');
SET @sql := IF(@c = 0,
  'ALTER TABLE `tokenInvestmentInterest` ADD COLUMN `canResubmitClaim` INT NOT NULL DEFAULT 0 AFTER `rejectedCount`', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- 3) Issuer reject + approve permissions (menu 10000000-0000-4000-8000-000000000009, issuer role 003).
INSERT INTO `permissionMaster`
  (`permissionUid`, `roleUid`, `menuUid`, `permissionName`, `permissionCode`, `httpMethod`, `apiPath`)
VALUES
  (UUID(), '00000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000009', 'Approve investment interest (issuer)', 'ISSUER_INVESTMENT_INTEREST_APPROVE', 'POST', '/api/v1/investments/issuer/interests/:interestUid/approve'),
  (UUID(), '00000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000009', 'Reject investment interest (issuer)', 'ISSUER_INVESTMENT_INTEREST_REJECT', 'POST', '/api/v1/investments/issuer/interests/:interestUid/reject')
ON DUPLICATE KEY UPDATE
  `permissionName` = VALUES(`permissionName`),
  `menuUid` = VALUES(`menuUid`),
  `isAllowed` = TRUE,
  `isActive` = TRUE,
  `isDeleted` = FALSE;

-- ---------------------------------------------------------------------------
-- Rollback (manual; forward-only convention):
-- DELETE FROM `permissionMaster` WHERE `permissionCode` IN (
--   'ISSUER_INVESTMENT_INTEREST_APPROVE','ISSUER_INVESTMENT_INTEREST_REJECT');
-- ALTER TABLE `tokenInvestmentInterest`
--   DROP COLUMN `canResubmitClaim`, DROP COLUMN `rejectedCount`,
--   DROP COLUMN `rejectedClaim`, DROP COLUMN `rejectReason`, DROP COLUMN `rejectReasonType`;
-- ALTER TABLE `tokenInvestmentInterest`
--   MODIFY COLUMN `status` ENUM('pending','approved','rejected','cancelled') NOT NULL DEFAULT 'pending';
