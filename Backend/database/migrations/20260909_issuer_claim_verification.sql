-- Issuer claim-signature verification (MySQL 8+).
-- Backend is the source of truth for issuer claim signature verification of a subscription
-- (a token investment interest). Two tables:
--   * issuerClaimVerification  — one complete verification attempt for a subscription (overall).
--   * issuerClaimSignature     — one row per claim topic within an attempt (individual result).
-- Each retry is a NEW attempt (attemptNumber increments); previous attempts are preserved for
-- audit. The required claim topics are snapshotted per attempt for reproducibility.
-- camelCase names (no underscores), no foreign keys, UTC. Idempotent. Safe to re-run.

USE `trexCapitalMarket`;
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS `issuerClaimVerification` (
  `verificationUid` CHAR(36) NOT NULL,
  -- The subscription: our token investment interest (interestUid == API subscriptionId).
  `interestUid` CHAR(36) NOT NULL,
  `tokenUid` CHAR(36) NOT NULL,
  `organizationUid` CHAR(36) NOT NULL,
  `investorUid` CHAR(36) NOT NULL,
  `status` ENUM('PENDING', 'VERIFICATION_FAILED', 'NETWORK_ERROR', 'SIGNED') NOT NULL DEFAULT 'PENDING',
  `requiredClaimCount` INT NOT NULL,
  `verifiedClaimCount` INT NOT NULL DEFAULT 0,
  -- Snapshot of the required claim topics (comma-separated numeric topics) at attempt creation.
  `requiredClaimTopics` VARCHAR(255) NULL,
  `attemptNumber` INT NOT NULL,
  `completedAt` DATETIME(3) NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT TRUE,
  `isDeleted` BOOLEAN NOT NULL DEFAULT FALSE,
  `createdAt` DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`verificationUid`),
  UNIQUE KEY `ukIssuerClaimVerificationAttempt` (`interestUid`, `attemptNumber`),
  KEY `idxIssuerClaimVerificationInterest` (`interestUid`, `status`, `isDeleted`),
  KEY `idxIssuerClaimVerificationOrg` (`organizationUid`, `status`, `isDeleted`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `issuerClaimSignature` (
  `signatureUid` CHAR(36) NOT NULL,
  `verificationUid` CHAR(36) NOT NULL,
  `interestUid` CHAR(36) NOT NULL,
  `claimTopic` INT NOT NULL,
  `data` TEXT NULL,
  `signature` TEXT NULL,
  -- Wallet RECOVERED from the signature by the backend (never supplied by the frontend).
  `signedByWallet` VARCHAR(42) NULL,
  `status` ENUM('PENDING', 'VERIFICATION_FAILED', 'NETWORK_ERROR', 'SIGNED') NOT NULL DEFAULT 'PENDING',
  `verificationError` TEXT NULL,
  `verifiedAt` DATETIME(3) NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT TRUE,
  `isDeleted` BOOLEAN NOT NULL DEFAULT FALSE,
  `createdAt` DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`signatureUid`),
  -- Idempotency: one row per claim topic within an attempt.
  UNIQUE KEY `ukIssuerClaimSignatureTopic` (`verificationUid`, `claimTopic`),
  KEY `idxIssuerClaimSignatureVerification` (`verificationUid`)
) ENGINE=InnoDB;

-- Issuer permissions (menu 10000000-0000-4000-8000-000000000009, issuer role 003).
INSERT INTO `permissionMaster`
  (`permissionUid`, `roleUid`, `menuUid`, `permissionName`, `permissionCode`, `httpMethod`, `apiPath`)
VALUES
  (UUID(), '00000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000009', 'Submit issuer claim signatures', 'ISSUER_CLAIM_SIGN', 'POST', '/api/v1/issuer/claims/sign'),
  (UUID(), '00000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000009', 'View issuer claim verification status', 'ISSUER_CLAIM_STATUS', 'GET', '/api/v1/issuer/claims/:subscriptionId')
ON DUPLICATE KEY UPDATE
  `permissionName` = VALUES(`permissionName`),
  `menuUid` = VALUES(`menuUid`),
  `isAllowed` = TRUE,
  `isActive` = TRUE,
  `isDeleted` = FALSE;

-- ---------------------------------------------------------------------------
-- Rollback (manual; forward-only convention):
-- DELETE FROM `permissionMaster` WHERE `permissionCode` IN ('ISSUER_CLAIM_SIGN','ISSUER_CLAIM_STATUS');
-- DROP TABLE IF EXISTS `issuerClaimSignature`;
-- DROP TABLE IF EXISTS `issuerClaimVerification`;
