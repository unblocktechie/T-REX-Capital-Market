-- Manual issuer-funded USDT redemption with platform-agent token custody and burn.
-- MySQL 8+ / MariaDB 10.4+, camelCase, UTC, soft relationships (no foreign keys).

USE `trexCapitalMarket`;
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS `tokenRedemption` (
  `redemptionUid` CHAR(36) NOT NULL,
  `interestUid` CHAR(36) NOT NULL,
  `tokenUid` CHAR(36) NOT NULL,
  `organizationUid` CHAR(36) NOT NULL,
  `investorUid` CHAR(36) NOT NULL,
  `investorUserUid` CHAR(36) NOT NULL,
  `issuerUserUid` CHAR(36) NOT NULL,
  `idempotencyKey` VARCHAR(100) NOT NULL,
  `chainId` BIGINT UNSIGNED NOT NULL,
  `usdtContractAddress` VARCHAR(42) NOT NULL,
  `tokenAddress` VARCHAR(42) NOT NULL,
  `investorWalletAddress` VARCHAR(42) NOT NULL,
  `issuerPaymentWalletAddress` VARCHAR(42) NOT NULL,
  `platformWalletAddress` VARCHAR(42) NOT NULL,
  `usdtDecimals` TINYINT UNSIGNED NOT NULL,
  `tokenDecimals` TINYINT UNSIGNED NOT NULL,
  `tokenPrice` DECIMAL(65,18) NOT NULL,
  `tokenAmount` DECIMAL(65,18) NOT NULL,
  `tokenAmountRaw` VARCHAR(78) NOT NULL,
  `usdtAmount` DECIMAL(65,18) NOT NULL,
  `usdtAmountRaw` VARCHAR(78) NOT NULL,
  `balanceBeforeRaw` VARCHAR(78) NOT NULL,
  `frozenBeforeRaw` VARCHAR(78) NOT NULL,
  `totalSupplyBeforeRaw` VARCHAR(78) NOT NULL,
  `preparedAtBlock` BIGINT UNSIGNED NOT NULL,

  `status` ENUM(
    'PENDING_INVESTOR_AUTHORIZATION','PENDING_ISSUER_APPROVAL','ISSUER_APPROVED',
    'TOKEN_LOCK_SUBMITTED','TOKENS_LOCKED','PAYMENT_SUBMITTED','PAYMENT_CONFIRMED',
    'BURN_SUBMITTED','BURN_CONFIRMED','UNLOCK_SUBMITTED','CANCELLATION_PENDING',
    'COMPLETED','ISSUER_REJECTED','CANCELLED','EXPIRED','MANUAL_REVIEW'
  ) NOT NULL DEFAULT 'PENDING_INVESTOR_AUTHORIZATION',
  `activeInterestUid` CHAR(36) GENERATED ALWAYS AS (
    CASE WHEN `status` NOT IN ('COMPLETED','ISSUER_REJECTED','CANCELLED','EXPIRED') THEN `interestUid` ELSE NULL END
  ) STORED,

  `authorizationNonce` CHAR(36) NOT NULL,
  `authorizationDeadline` DATETIME(3) NOT NULL,
  `authorizationSignature` VARCHAR(132) NULL,
  `authorizedAt` DATETIME(3) NULL,
  `issuerDecisionAt` DATETIME(3) NULL,
  `issuerDecisionNote` VARCHAR(1000) NULL,
  `rejectionReason` VARCHAR(1000) NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  `expiredAt` DATETIME(3) NULL,

  `lockStatus` ENUM('NOT_STARTED','QUEUED','PROCESSING','SUBMITTED','CONFIRMED','FAILED','NOT_REQUIRED') NOT NULL DEFAULT 'NOT_STARTED',
  `lockPreparedAtBlock` BIGINT UNSIGNED NULL,
  `lockTxHash` VARCHAR(66) NULL,
  `lockSubmittedAt` DATETIME(3) NULL,
  `lockBlockNumber` BIGINT UNSIGNED NULL,
  `lockBlockHash` VARCHAR(66) NULL,
  `lockTransactionIndex` INT UNSIGNED NULL,
  `lockLogIndex` INT UNSIGNED NULL,
  `lockGasUsed` VARCHAR(78) NULL,
  `lockEffectiveGasPrice` VARCHAR(78) NULL,
  `lockConfirmedAt` DATETIME(3) NULL,

  `paymentStatus` ENUM('NOT_STARTED','AWAITING_ISSUER','SUBMITTED','CONFIRMED','FAILED','NOT_REQUIRED') NOT NULL DEFAULT 'NOT_STARTED',
  `paymentRequestedAtBlock` BIGINT UNSIGNED NULL,
  `paymentTxHash` VARCHAR(66) NULL,
  `paymentTxReceivedAt` DATETIME(3) NULL,
  `paymentBlockNumber` BIGINT UNSIGNED NULL,
  `paymentBlockHash` VARCHAR(66) NULL,
  `paymentTransactionIndex` INT UNSIGNED NULL,
  `paymentLogIndex` INT UNSIGNED NULL,
  `paymentGasUsed` VARCHAR(78) NULL,
  `paymentEffectiveGasPrice` VARCHAR(78) NULL,
  `paymentVerifiedAt` DATETIME(3) NULL,

  `burnStatus` ENUM('NOT_STARTED','QUEUED','PROCESSING','SUBMITTED','CONFIRMED','FAILED','NOT_REQUIRED') NOT NULL DEFAULT 'NOT_STARTED',
  `burnPreparedAtBlock` BIGINT UNSIGNED NULL,
  `burnTxHash` VARCHAR(66) NULL,
  `burnSubmittedAt` DATETIME(3) NULL,
  `burnBlockNumber` BIGINT UNSIGNED NULL,
  `burnBlockHash` VARCHAR(66) NULL,
  `burnTransactionIndex` INT UNSIGNED NULL,
  `burnLogIndex` INT UNSIGNED NULL,
  `burnGasUsed` VARCHAR(78) NULL,
  `burnEffectiveGasPrice` VARCHAR(78) NULL,
  `burnConfirmedAt` DATETIME(3) NULL,

  `unlockStatus` ENUM('NOT_STARTED','QUEUED','PROCESSING','SUBMITTED','CONFIRMED','FAILED','NOT_REQUIRED') NOT NULL DEFAULT 'NOT_STARTED',
  `unlockAmountRaw` VARCHAR(78) NULL,
  `unlockPreparedAtBlock` BIGINT UNSIGNED NULL,
  `unlockTxHash` VARCHAR(66) NULL,
  `unlockSubmittedAt` DATETIME(3) NULL,
  `unlockBlockNumber` BIGINT UNSIGNED NULL,
  `unlockBlockHash` VARCHAR(66) NULL,
  `unlockTransactionIndex` INT UNSIGNED NULL,
  `unlockLogIndex` INT UNSIGNED NULL,
  `unlockGasUsed` VARCHAR(78) NULL,
  `unlockEffectiveGasPrice` VARCHAR(78) NULL,
  `unlockConfirmedAt` DATETIME(3) NULL,

  `errorStage` ENUM('AUTHORIZATION','LOCK','PAYMENT','BURN','UNLOCK','SYSTEM') NULL,
  `errorCode` VARCHAR(100) NULL,
  `errorMessage` VARCHAR(2000) NULL,
  `syncStatus` ENUM('IDLE','QUEUED','PROCESSING','FAILED') NOT NULL DEFAULT 'IDLE',
  `syncRequestedAt` DATETIME(3) NULL,
  `syncStartedAt` DATETIME(3) NULL,
  `syncCompletedAt` DATETIME(3) NULL,
  `syncAttempts` INT UNSIGNED NOT NULL DEFAULT 0,
  `nextSyncAt` DATETIME(3) NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT TRUE,
  `isDeleted` BOOLEAN NOT NULL DEFAULT FALSE,
  `createdAt` DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`redemptionUid`),
  UNIQUE KEY `ukTokenRedemptionIdempotency` (`investorUserUid`,`idempotencyKey`),
  UNIQUE KEY `ukTokenRedemptionActiveInterest` (`activeInterestUid`),
  UNIQUE KEY `ukTokenRedemptionLockTxHash` (`lockTxHash`),
  UNIQUE KEY `ukTokenRedemptionPaymentTxHash` (`paymentTxHash`),
  UNIQUE KEY `ukTokenRedemptionBurnTxHash` (`burnTxHash`),
  UNIQUE KEY `ukTokenRedemptionUnlockTxHash` (`unlockTxHash`),
  KEY `idxTokenRedemptionInvestor` (`investorUserUid`,`tokenUid`,`createdAt`),
  KEY `idxTokenRedemptionIssuer` (`issuerUserUid`,`status`,`createdAt`),
  KEY `idxTokenRedemptionRecovery` (`status`,`syncStatus`,`nextSyncAt`,`isDeleted`,`createdAt`),
  KEY `idxTokenRedemptionPaymentMatch` (`chainId`,`usdtContractAddress`,`issuerPaymentWalletAddress`,`investorWalletAddress`,`paymentStatus`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `tokenRedemptionTransaction` (
  `redemptionTransactionUid` CHAR(36) NOT NULL,
  `redemptionUid` CHAR(36) NOT NULL,
  `stage` ENUM('LOCK','PAYMENT','BURN','UNLOCK') NOT NULL,
  `txHash` VARCHAR(66) NOT NULL,
  `status` ENUM('RECEIVED','SUBMITTED','PENDING','CONFIRMED','FAILED') NOT NULL,
  `blockNumber` BIGINT UNSIGNED NULL,
  `blockHash` VARCHAR(66) NULL,
  `transactionIndex` INT UNSIGNED NULL,
  `logIndex` INT UNSIGNED NULL,
  `gasUsed` VARCHAR(78) NULL,
  `effectiveGasPrice` VARCHAR(78) NULL,
  `errorCode` VARCHAR(100) NULL,
  `errorMessage` VARCHAR(2000) NULL,
  `confirmedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`redemptionTransactionUid`),
  UNIQUE KEY `ukTokenRedemptionTransactionHash` (`txHash`),
  KEY `idxTokenRedemptionTransaction` (`redemptionUid`,`stage`,`createdAt`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `tokenRedemptionHistory` (
  `redemptionHistoryUid` CHAR(36) NOT NULL,
  `redemptionUid` CHAR(36) NOT NULL,
  `eventType` VARCHAR(80) NOT NULL,
  `fromStatus` VARCHAR(50) NULL,
  `toStatus` VARCHAR(50) NOT NULL,
  `actorRole` VARCHAR(30) NOT NULL,
  `actorUserUid` CHAR(36) NULL,
  `message` VARCHAR(1000) NULL,
  `metadata` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  PRIMARY KEY (`redemptionHistoryUid`),
  KEY `idxTokenRedemptionHistory` (`redemptionUid`,`createdAt`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `tokenRedemptionPaymentEvent` (
  `redemptionPaymentEventUid` CHAR(36) NOT NULL,
  `chainId` BIGINT UNSIGNED NOT NULL,
  `usdtContractAddress` VARCHAR(42) NOT NULL,
  `fromWalletAddress` VARCHAR(42) NOT NULL,
  `toWalletAddress` VARCHAR(42) NOT NULL,
  `amountRaw` VARCHAR(78) NOT NULL,
  `txHash` VARCHAR(66) NOT NULL,
  `blockNumber` BIGINT UNSIGNED NOT NULL,
  `blockHash` VARCHAR(66) NULL,
  `transactionIndex` INT UNSIGNED NOT NULL,
  `logIndex` INT UNSIGNED NOT NULL,
  `processingStatus` ENUM('NEW','MATCHED','UNMATCHED','FAILED') NOT NULL DEFAULT 'NEW',
  `matchedRedemptionUid` CHAR(36) NULL,
  `processingAttempts` INT UNSIGNED NOT NULL DEFAULT 0,
  `processingMessage` VARCHAR(2000) NULL,
  `processedAt` DATETIME(3) NULL,
  `isCanonical` BOOLEAN NOT NULL DEFAULT TRUE,
  `createdAt` DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`redemptionPaymentEventUid`),
  UNIQUE KEY `ukTokenRedemptionPaymentEvent` (`chainId`,`txHash`,`logIndex`),
  KEY `idxTokenRedemptionPaymentEventProcess` (`chainId`,`processingStatus`,`isCanonical`,`blockNumber`),
  KEY `idxTokenRedemptionPaymentEventMatch` (`fromWalletAddress`,`toWalletAddress`,`amountRaw`,`blockNumber`)
) ENGINE=InnoDB;

INSERT INTO `permissionMaster`
  (`permissionUid`,`roleUid`,`menuUid`,`permissionName`,`permissionCode`,`httpMethod`,`apiPath`)
VALUES
  (UUID(),'00000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000009','Create redemption request','INVESTOR_REDEMPTION_CREATE','POST','/api/v1/investments/tokens/:tokenUid/redemptions'),
  (UUID(),'00000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000009','List redemption history','INVESTOR_REDEMPTION_HISTORY','GET','/api/v1/investments/tokens/:tokenUid/redemptions'),
  (UUID(),'00000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000009','View redemption request','INVESTOR_REDEMPTION_VIEW','GET','/api/v1/investments/redemptions/:redemptionUid'),
  (UUID(),'00000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000009','Authorize redemption request','INVESTOR_REDEMPTION_AUTHORIZE','POST','/api/v1/investments/redemptions/:redemptionUid/authorize'),
  (UUID(),'00000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000009','Cancel redemption request','INVESTOR_REDEMPTION_CANCEL','POST','/api/v1/investments/redemptions/:redemptionUid/cancel'),
  (UUID(),'00000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000009','Retry redemption synchronization','INVESTOR_REDEMPTION_RETRY','POST','/api/v1/investments/redemptions/:redemptionUid/retry'),
  (UUID(),'00000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000009','Retry redemption synchronization','ISSUER_REDEMPTION_RETRY','POST','/api/v1/investments/redemptions/:redemptionUid/retry'),
  (UUID(),'00000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000009','List issuer redemption requests','ISSUER_REDEMPTION_LIST','GET','/api/v1/investments/issuer/redemptions'),
  (UUID(),'00000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000009','View issuer redemption request','ISSUER_REDEMPTION_VIEW','GET','/api/v1/investments/issuer/redemptions/:redemptionUid'),
  (UUID(),'00000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000009','Approve issuer redemption request','ISSUER_REDEMPTION_APPROVE','POST','/api/v1/investments/issuer/redemptions/:redemptionUid/approve'),
  (UUID(),'00000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000009','Reject issuer redemption request','ISSUER_REDEMPTION_REJECT','POST','/api/v1/investments/issuer/redemptions/:redemptionUid/reject'),
  (UUID(),'00000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000009','Confirm issuer redemption payment','ISSUER_REDEMPTION_PAYMENT_CONFIRM','POST','/api/v1/investments/issuer/redemptions/:redemptionUid/payment/confirm')
ON DUPLICATE KEY UPDATE `permissionName`=VALUES(`permissionName`),`menuUid`=VALUES(`menuUid`),
  `permissionCode`=VALUES(`permissionCode`),`isAllowed`=TRUE,`isActive`=TRUE,`isDeleted`=FALSE;

INSERT INTO `generalSettings`
  (`settingUid`,`settingKey`,`settingValue`,`valueType`,`settingGroup`,`description`,`isPublic`)
VALUES
  ('20000000-0000-4000-8000-0000000000f1','RedemptionWorkerEnabled','true','boolean','redemptionWorker','Enables redemption payment indexing and settlement recovery.',FALSE),
  ('20000000-0000-4000-8000-0000000000f2','RedemptionWorkerIntervalSeconds','15','number','redemptionWorker','Delay between redemption reconciliation runs.',FALSE),
  ('20000000-0000-4000-8000-0000000000f3','RedemptionIndexerBlockOffset','1000','number','redemptionWorker','Maximum sequential blocks per USDT event query.',FALSE),
  ('20000000-0000-4000-8000-0000000000f4','RedemptionConfirmationBlocks','12','number','redemptionWorker','Canonical confirmation threshold for lock, payment, burn, and unlock.',FALSE),
  ('20000000-0000-4000-8000-0000000000f5','RedemptionWorkerLeaseSeconds','180','number','redemptionWorker','Distributed lease duration for settlement execution.',FALSE),
  ('20000000-0000-4000-8000-0000000000f6','RedemptionWorkerBatchSize','50','number','redemptionWorker','Redemption rows reconciled per run.',FALSE),
  ('20000000-0000-4000-8000-0000000000f7','RedemptionEventBatchSize','200','number','redemptionWorker','Stored USDT events matched per run.',FALSE),
  ('20000000-0000-4000-8000-0000000000f8','RedemptionIndexerMaxChunksPerRun','10','number','redemptionWorker','Maximum indexer chunks processed per run.',FALSE),
  ('20000000-0000-4000-8000-0000000000f9','RedemptionExpirationBatchSize','50','number','redemptionWorker','Unsigned redemption requests expired per run.',FALSE)
ON DUPLICATE KEY UPDATE `valueType`=VALUES(`valueType`),`settingGroup`=VALUES(`settingGroup`),
  `description`=VALUES(`description`),`isActive`=TRUE,`isDeleted`=FALSE;

-- Uses blockchainIndexerCheckpoint with indexerName = tokenRedemptionPayment and
-- indexerName = platformTokenAgentExecution for the platform-wallet transaction lease shared with purchases.
