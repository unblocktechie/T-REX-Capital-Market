-- Token deployment attempts (MySQL 8+)
-- Adds a dedicated audit/state table for the two-phase T-REX deployment flow:
--   pending -> submitted -> confirming -> confirmed | failed | wallet_rejected | cancelled | expired
-- Keeps the permanent tokenMaster status separate from an individual deployment attempt.
-- Follows existing conventions: CHAR(36) UUID keys, camelCase columns, UTC DATETIME(3),
-- soft-delete flags, no foreign keys (enforced in the application layer / row locking).
-- Idempotent (safe to re-run).

USE `trexCapitalMarket`;
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS `tokenDeploymentAttempt` (
  `deploymentAttemptUid` CHAR(36) NOT NULL,
  `tokenUid` CHAR(36) NOT NULL,
  `organizationUid` CHAR(36) NOT NULL,
  `userUid` CHAR(36) NOT NULL,
  `walletAddress` VARCHAR(42) NOT NULL,
  `chainId` INT UNSIGNED NOT NULL,
  `networkName` VARCHAR(50) NULL,
  `status` ENUM(
    'pending', 'submitted', 'confirming', 'confirmed',
    'failed', 'wallet_rejected', 'cancelled', 'expired'
  ) NOT NULL DEFAULT 'pending',
  `idempotencyKey` VARCHAR(100) NOT NULL,
  `transactionHash` VARCHAR(66) NULL,
  `contractAddress` VARCHAR(42) NULL,
  `blockNumber` BIGINT UNSIGNED NULL,
  `errorCode` VARCHAR(80) NULL,
  `errorMessage` TEXT NULL,
  `metadata` JSON NULL,
  `expiresAt` DATETIME(3) NULL,
  `submittedAt` DATETIME(3) NULL,
  `confirmedAt` DATETIME(3) NULL,
  `failedAt` DATETIME(3) NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT TRUE,
  `isDeleted` BOOLEAN NOT NULL DEFAULT FALSE,
  `createdAt` DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`deploymentAttemptUid`),
  -- A broadcast transaction hash is globally unique; MySQL allows multiple NULLs so
  -- pending attempts (no hash yet) are unaffected.
  UNIQUE KEY `ukTokenDeploymentAttemptTxHash` (`transactionHash`),
  -- One idempotency key can resolve to exactly one attempt per token.
  UNIQUE KEY `ukTokenDeploymentAttemptIdempotency` (`tokenUid`, `idempotencyKey`),
  KEY `idxTokenDeploymentAttemptToken` (`tokenUid`, `status`, `isDeleted`),
  KEY `idxTokenDeploymentAttemptOrganization` (`organizationUid`),
  KEY `idxTokenDeploymentAttemptUser` (`userUid`),
  KEY `idxTokenDeploymentAttemptStatus` (`status`, `expiresAt`),
  KEY `idxTokenDeploymentAttemptExpiry` (`expiresAt`)
) ENGINE=InnoDB;

-- Add an in-progress permanent token status so a token is not left in `draft`
-- while a deployment attempt is active, and is never `deployed` before verification.
-- Re-running is safe: MODIFY simply restates the full enum set.
ALTER TABLE `tokenMaster`
  MODIFY COLUMN `status`
    ENUM('draft', 'readyToDeploy', 'deploymentPending', 'deployed', 'deploymentFailed')
    NOT NULL DEFAULT 'draft';

-- Issuer API-level permissions for the new deployment-attempt endpoints.
-- Paths intentionally match the Express route templates (see authorize.middleware).
INSERT INTO `permissionMaster`
  (`permissionUid`, `roleUid`, `menuUid`, `permissionName`, `permissionCode`, `httpMethod`, `apiPath`)
VALUES
  (UUID(), '00000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000007',
    'Create token deployment attempt', 'TOKEN_DEPLOY_ATTEMPT_CREATE', 'POST',
    '/api/v1/tokens/me/deployment-attempts'),
  (UUID(), '00000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000007',
    'View active token deployment attempt', 'TOKEN_DEPLOY_ATTEMPT_ACTIVE', 'GET',
    '/api/v1/tokens/me/deployment-attempts/active'),
  (UUID(), '00000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000007',
    'Record broadcast token deployment transaction', 'TOKEN_DEPLOY_ATTEMPT_SUBMITTED', 'PATCH',
    '/api/v1/tokens/me/deployment-attempts/:deploymentAttemptUid/submitted'),
  (UUID(), '00000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000007',
    'Close token deployment attempt on wallet failure', 'TOKEN_DEPLOY_ATTEMPT_FAIL', 'PATCH',
    '/api/v1/tokens/me/deployment-attempts/:deploymentAttemptUid/fail')
ON DUPLICATE KEY UPDATE
  `permissionName` = VALUES(`permissionName`),
  `menuUid` = VALUES(`menuUid`),
  `isAllowed` = TRUE,
  `isActive` = TRUE,
  `isDeleted` = FALSE;

-- ---------------------------------------------------------------------------
-- Rollback (manual). This project uses forward-only .sql migrations, so the
-- reverse statements are provided here as a reference and are intentionally
-- left commented out. Existing deployed-token records are never modified.
--
-- DELETE FROM `permissionMaster` WHERE `permissionCode` IN (
--   'TOKEN_DEPLOY_ATTEMPT_CREATE', 'TOKEN_DEPLOY_ATTEMPT_ACTIVE',
--   'TOKEN_DEPLOY_ATTEMPT_SUBMITTED', 'TOKEN_DEPLOY_ATTEMPT_FAIL'
-- );
-- -- Only revert the enum once no token row uses 'deploymentPending':
-- -- UPDATE `tokenMaster` SET `status` = 'draft' WHERE `status` = 'deploymentPending';
-- ALTER TABLE `tokenMaster`
--   MODIFY COLUMN `status`
--     ENUM('draft', 'readyToDeploy', 'deployed', 'deploymentFailed')
--     NOT NULL DEFAULT 'draft';
-- DROP TABLE IF EXISTS `tokenDeploymentAttempt`;
