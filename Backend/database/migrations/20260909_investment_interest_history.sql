-- Investment interest timeline history (MySQL 8+).
-- Records every submitted / rejected / resubmitted / approved event for an interest so both
-- the issuer and the investor can see the full rejection + resubmission timeline: when each
-- rejection happened, its reason type + description, which claim topics were rejected, and how
-- many times the investor has resubmitted (attempt number) against the rejectedCount limit.
-- Idempotent, no foreign keys, camelCase, UTC. Safe to re-run.

USE `trexCapitalMarket`;
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS `tokenInvestmentInterestHistory` (
  `historyUid` CHAR(36) NOT NULL,
  `interestUid` CHAR(36) NOT NULL,
  `tokenUid` CHAR(36) NOT NULL,
  `organizationUid` CHAR(36) NOT NULL,
  `investorUid` CHAR(36) NOT NULL,
  `eventType` ENUM('submitted', 'rejected', 'resubmitted', 'approved') NOT NULL,
  `rejectReasonType` VARCHAR(40) NULL,
  `rejectReason` VARCHAR(1000) NULL,
  `rejectedClaim` VARCHAR(500) NULL,
  `resubmitAttempt` INT NULL,
  `actorRole` ENUM('investor', 'issuer', 'system') NOT NULL DEFAULT 'system',
  `actorUserUid` CHAR(36) NULL,
  `note` VARCHAR(1000) NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT TRUE,
  `isDeleted` BOOLEAN NOT NULL DEFAULT FALSE,
  `createdAt` DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`historyUid`),
  KEY `idxInterestHistoryInterest` (`interestUid`, `createdAt`),
  KEY `idxInterestHistoryOrg` (`organizationUid`, `eventType`, `isDeleted`),
  KEY `idxInterestHistoryInvestor` (`investorUid`, `isDeleted`)
) ENGINE=InnoDB;

-- Timeline read permissions: investor (own) + issuer (own organization).
INSERT INTO `permissionMaster`
  (`permissionUid`, `roleUid`, `menuUid`, `permissionName`, `permissionCode`, `httpMethod`, `apiPath`)
VALUES
  (UUID(), '00000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000009', 'View my investment interest history', 'INVESTMENT_MY_INTEREST_HISTORY', 'GET', '/api/v1/investments/me/interests/:interestUid/history'),
  (UUID(), '00000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000009', 'View investment interest history (issuer)', 'ISSUER_INVESTMENT_INTEREST_HISTORY', 'GET', '/api/v1/investments/issuer/interests/:interestUid/history')
ON DUPLICATE KEY UPDATE
  `permissionName` = VALUES(`permissionName`),
  `menuUid` = VALUES(`menuUid`),
  `isAllowed` = TRUE,
  `isActive` = TRUE,
  `isDeleted` = FALSE;

-- ---------------------------------------------------------------------------
-- Rollback (manual; forward-only convention):
-- DELETE FROM `permissionMaster` WHERE `permissionCode` IN (
--   'INVESTMENT_MY_INTEREST_HISTORY','ISSUER_INVESTMENT_INTEREST_HISTORY');
-- DROP TABLE IF EXISTS `tokenInvestmentInterestHistory`;
