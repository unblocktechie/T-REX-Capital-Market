-- Document versioning + per-application submission snapshots (MySQL 8+).
-- Reference flow:
--   * investorDocument becomes append-only versions. The "current profile" is the latest
--     version per document type (isCurrent = 1). Older versions are kept forever (isCurrent = 0,
--     isDeleted = 0) for audit/history and so past applications keep resolving their exact file.
--   * investmentSubmissionDocument snapshots the EXACT document versions attached to each
--     submission (submitted / resubmitted) of an application, linked to the timeline event.
--     An issuer only ever sees the snapshot for their own application.
-- Idempotent, no foreign keys, camelCase, UTC. Safe to re-run.

USE `trexCapitalMarket`;
SET time_zone = '+00:00';

-- 1) Version columns on investorDocument (guarded).
SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'investorDocument' AND COLUMN_NAME = 'versionNumber');
SET @sql := IF(@c = 0,
  'ALTER TABLE `investorDocument` ADD COLUMN `versionNumber` INT NOT NULL DEFAULT 1 AFTER `documentTypeUid`', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'investorDocument' AND COLUMN_NAME = 'isCurrent');
SET @sql := IF(@c = 0,
  'ALTER TABLE `investorDocument` ADD COLUMN `isCurrent` BOOLEAN NOT NULL DEFAULT TRUE AFTER `versionNumber`', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'investorDocument' AND COLUMN_NAME = 'uploadedByUserUid');
SET @sql := IF(@c = 0,
  'ALTER TABLE `investorDocument` ADD COLUMN `uploadedByUserUid` CHAR(36) NULL AFTER `isCurrent`', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @c := (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'investorDocument' AND INDEX_NAME = 'idxInvestorDocumentCurrent');
SET @sql := IF(@c = 0,
  'ALTER TABLE `investorDocument` ADD INDEX `idxInvestorDocumentCurrent` (`investorUid`, `documentTypeUid`, `isCurrent`, `isDeleted`)', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- Existing rows are the current version (defaults already set them; explicit for clarity).
UPDATE `investorDocument` SET `isCurrent` = 1 WHERE `isDeleted` = 0 AND `isCurrent` IS NULL;

-- 2) Per-submission document snapshot. Each row = one exact document version attached to one
--    submission event (tokenInvestmentInterestHistory.historyUid) of one application.
CREATE TABLE IF NOT EXISTS `investmentSubmissionDocument` (
  `submissionDocumentUid` CHAR(36) NOT NULL,
  `historyUid` CHAR(36) NOT NULL,
  `interestUid` CHAR(36) NOT NULL,
  `tokenUid` CHAR(36) NOT NULL,
  `organizationUid` CHAR(36) NOT NULL,
  `investorUid` CHAR(36) NOT NULL,
  `submissionNumber` INT NOT NULL,
  `documentUid` CHAR(36) NOT NULL,
  `documentTypeUid` CHAR(36) NULL,
  `documentTypeName` VARCHAR(150) NULL,
  `documentCategory` VARCHAR(20) NULL,
  `claimTopicCode` VARCHAR(80) NULL,
  `versionNumber` INT NULL,
  `originalFileName` VARCHAR(255) NULL,
  `storageKey` VARCHAR(500) NULL,
  `mimeType` VARCHAR(100) NULL,
  `fileSize` BIGINT UNSIGNED NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT TRUE,
  `isDeleted` BOOLEAN NOT NULL DEFAULT FALSE,
  `createdAt` DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`submissionDocumentUid`),
  KEY `idxSubmissionDocInterest` (`interestUid`, `submissionNumber`),
  KEY `idxSubmissionDocHistory` (`historyUid`),
  KEY `idxSubmissionDocDocument` (`interestUid`, `documentUid`)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- Rollback (manual; forward-only convention):
-- DROP TABLE IF EXISTS `investmentSubmissionDocument`;
-- ALTER TABLE `investorDocument`
--   DROP COLUMN `uploadedByUserUid`, DROP COLUMN `isCurrent`, DROP COLUMN `versionNumber`;
