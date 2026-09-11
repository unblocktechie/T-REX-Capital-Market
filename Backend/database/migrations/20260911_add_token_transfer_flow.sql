-- Backend-authoritative investor-to-investor ERC-3643 token transfer flow.
-- MySQL 8+, camelCase, UTC, soft relationships (no foreign keys).

USE `trexCapitalMarket`;
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS `tokenTransfer` (
  `transferUid` CHAR(36) NOT NULL,
  `tokenUid` CHAR(36) NOT NULL,
  `organizationUid` CHAR(36) NOT NULL,
  `senderInterestUid` CHAR(36) NOT NULL,
  `recipientInterestUid` CHAR(36) NOT NULL,
  `senderInvestorUid` CHAR(36) NOT NULL,
  `recipientInvestorUid` CHAR(36) NOT NULL,
  `senderUserUid` CHAR(36) NOT NULL,
  `recipientUserUid` CHAR(36) NOT NULL,
  `idempotencyKey` VARCHAR(100) NOT NULL,
  `chainId` BIGINT UNSIGNED NOT NULL,
  `tokenAddress` VARCHAR(42) NOT NULL,
  `identityRegistryAddress` VARCHAR(42) NOT NULL,
  `senderWalletAddress` VARCHAR(42) NOT NULL,
  `recipientWalletAddress` VARCHAR(42) NOT NULL,
  `senderIdentityAddress` VARCHAR(42) NOT NULL,
  `recipientIdentityAddress` VARCHAR(42) NOT NULL,
  `tokenDecimals` TINYINT UNSIGNED NOT NULL,
  `tokenAmount` DECIMAL(65,18) NOT NULL,
  `tokenAmountRaw` VARCHAR(78) NOT NULL,
  `senderBalanceBeforeRaw` VARCHAR(78) NOT NULL,
  `recipientBalanceBeforeRaw` VARCHAR(78) NOT NULL,
  `senderFrozenBeforeRaw` VARCHAR(78) NOT NULL,
  `preparedAtBlock` BIGINT UNSIGNED NOT NULL,
  `status` ENUM('PENDING_TRANSFER','COMPLETED','EXPIRED','MANUAL_REVIEW') NOT NULL DEFAULT 'PENDING_TRANSFER',
  `activeSenderTokenKey` VARCHAR(100)
    GENERATED ALWAYS AS (
      CASE WHEN `status` = 'PENDING_TRANSFER'
        THEN CONCAT(LOWER(`senderWalletAddress`), ':', LOWER(`tokenAddress`)) ELSE NULL END
    ) STORED,
  `expiresAt` DATETIME(3) NOT NULL,
  `expiredAt` DATETIME(3) NULL,
  `expirationReason` VARCHAR(100) NULL,
  `txHash` VARCHAR(66) NULL,
  `txHashReceivedAt` DATETIME(3) NULL,
  `blockNumber` BIGINT UNSIGNED NULL,
  `blockHash` VARCHAR(66) NULL,
  `transactionIndex` INT UNSIGNED NULL,
  `logIndex` INT UNSIGNED NULL,
  `gasUsed` VARCHAR(78) NULL,
  `effectiveGasPrice` VARCHAR(78) NULL,
  `senderBalanceAfterRaw` VARCHAR(78) NULL,
  `recipientBalanceAfterRaw` VARCHAR(78) NULL,
  `senderFrozenAfterRaw` VARCHAR(78) NULL,
  `verifiedAt` DATETIME(3) NULL,
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
  PRIMARY KEY (`transferUid`),
  UNIQUE KEY `ukTokenTransferIdempotency` (`senderUserUid`,`idempotencyKey`),
  UNIQUE KEY `ukTokenTransferActiveSenderToken` (`activeSenderTokenKey`),
  UNIQUE KEY `ukTokenTransferTxHash` (`txHash`),
  KEY `idxTokenTransferSenderHistory` (`senderUserUid`,`tokenUid`,`createdAt`),
  KEY `idxTokenTransferRecipientHistory` (`recipientUserUid`,`tokenUid`,`createdAt`),
  KEY `idxTokenTransferRecovery` (`status`,`syncStatus`,`nextSyncAt`,`isDeleted`,`createdAt`),
  KEY `idxTokenTransferExpiration` (`status`,`txHash`,`expiresAt`,`isDeleted`),
  KEY `idxTokenTransferMatch` (`chainId`,`tokenAddress`,`senderWalletAddress`,`recipientWalletAddress`,`status`)
) ENGINE=InnoDB;

-- Append-only audit history for every hash received or recovered for an intent.
CREATE TABLE IF NOT EXISTS `tokenTransferTransaction` (
  `transferTransactionUid` CHAR(36) NOT NULL,
  `transferUid` CHAR(36) NOT NULL,
  `txHash` VARCHAR(66) NOT NULL,
  `status` ENUM('RECEIVED','PENDING','CONFIRMED','FAILED') NOT NULL,
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
  PRIMARY KEY (`transferTransactionUid`),
  UNIQUE KEY `ukTokenTransferTransactionHash` (`transferUid`,`txHash`),
  KEY `idxTokenTransferTransactionTransfer` (`transferUid`,`createdAt`),
  KEY `idxTokenTransferTransactionHash` (`txHash`)
) ENGINE=InnoDB;

-- Durable global Transfer event ledger. The checkpoint advances only after each block range is stored.
CREATE TABLE IF NOT EXISTS `tokenTransferBlockchainEvent` (
  `transferEventUid` CHAR(36) NOT NULL,
  `chainId` BIGINT UNSIGNED NOT NULL,
  `tokenAddress` VARCHAR(42) NOT NULL,
  `fromWalletAddress` VARCHAR(42) NOT NULL,
  `toWalletAddress` VARCHAR(42) NOT NULL,
  `amountRaw` VARCHAR(78) NOT NULL,
  `txHash` VARCHAR(66) NOT NULL,
  `blockNumber` BIGINT UNSIGNED NOT NULL,
  `blockHash` VARCHAR(66) NULL,
  `transactionIndex` INT UNSIGNED NOT NULL,
  `logIndex` INT UNSIGNED NOT NULL,
  `processingStatus` ENUM('NEW','MATCHED','UNMATCHED','FAILED') NOT NULL DEFAULT 'NEW',
  `matchedTransferUid` CHAR(36) NULL,
  `processingAttempts` INT UNSIGNED NOT NULL DEFAULT 0,
  `processingMessage` VARCHAR(2000) NULL,
  `processedAt` DATETIME(3) NULL,
  `isCanonical` BOOLEAN NOT NULL DEFAULT TRUE,
  `createdAt` DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`transferEventUid`),
  UNIQUE KEY `ukTokenTransferBlockchainEvent` (`chainId`,`txHash`,`logIndex`),
  KEY `idxTokenTransferEventProcess` (`chainId`,`processingStatus`,`isCanonical`,`blockNumber`),
  KEY `idxTokenTransferEventMatch` (`tokenAddress`,`fromWalletAddress`,`toWalletAddress`,`amountRaw`,`blockNumber`)
) ENGINE=InnoDB;

INSERT INTO `permissionMaster`
  (`permissionUid`,`roleUid`,`menuUid`,`permissionName`,`permissionCode`,`httpMethod`,`apiPath`)
VALUES
  (UUID(),'00000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000009','Create token transfer','INVESTOR_TOKEN_TRANSFER_CREATE','POST','/api/v1/investments/tokens/:tokenUid/transfers'),
  (UUID(),'00000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000009','List token transfers','INVESTOR_TOKEN_TRANSFER_LIST','GET','/api/v1/investments/tokens/:tokenUid/transfers'),
  (UUID(),'00000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000009','View token transfer','INVESTOR_TOKEN_TRANSFER_VIEW','GET','/api/v1/investments/transfers/:transferUid'),
  (UUID(),'00000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000009','Confirm token transfer','INVESTOR_TOKEN_TRANSFER_CONFIRM','POST','/api/v1/investments/transfers/:transferUid/confirm'),
  (UUID(),'00000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000009','Retry token transfer','INVESTOR_TOKEN_TRANSFER_RETRY','POST','/api/v1/investments/transfers/:transferUid/retry')
ON DUPLICATE KEY UPDATE `permissionName`=VALUES(`permissionName`),`menuUid`=VALUES(`menuUid`),
  `isAllowed`=TRUE,`isActive`=TRUE,`isDeleted`=FALSE;

INSERT INTO `generalSettings`
  (`settingUid`,`settingKey`,`settingValue`,`valueType`,`settingGroup`,`description`,`isPublic`)
VALUES
  ('21000000-0000-4000-8000-000000000001','TransferWorkerEnabled','true','boolean','transferWorker','Enables ERC-3643 Transfer indexing and intent recovery.',FALSE),
  ('21000000-0000-4000-8000-000000000002','TransferWorkerIntervalSeconds','15','number','transferWorker','Delay between transfer reconciliation runs.',FALSE),
  ('21000000-0000-4000-8000-000000000003','TransferIndexerBlockOffset','1000','number','transferWorker','Maximum sequential blocks per Transfer event query.',FALSE),
  ('21000000-0000-4000-8000-000000000004','TransferIndexerConfirmationBlocks','12','number','transferWorker','Safe-head confirmation buffer for recovered transfers.',FALSE),
  ('21000000-0000-4000-8000-000000000005','TransferIndexerAddressBatchSize','100','number','transferWorker','Token contract addresses per eth_getLogs request.',FALSE),
  ('21000000-0000-4000-8000-000000000006','TransferEventBatchSize','200','number','transferWorker','Stored Transfer events matched per run.',FALSE),
  ('21000000-0000-4000-8000-000000000007','TransferWorkerLeaseSeconds','180','number','transferWorker','Distributed lease duration for transfer indexing.',FALSE),
  ('21000000-0000-4000-8000-000000000008','TransferWorkerBatchSize','50','number','transferWorker','Pending transfer intents reconciled per run.',FALSE),
  ('21000000-0000-4000-8000-000000000009','TransferIndexerMaxChunksPerRun','10','number','transferWorker','Maximum checkpoint chunks processed per run.',FALSE),
  ('21000000-0000-4000-8000-000000000010','TransferExpirationBatchSize','50','number','transferWorker','Abandoned transfer intents expired per run.',FALSE),
  ('21000000-0000-4000-8000-000000000011','TransferIntentExpiryGraceSeconds','180','number','transferWorker','Safe-indexing grace period before an abandoned intent expires.',FALSE)
ON DUPLICATE KEY UPDATE `valueType`=VALUES(`valueType`),`settingGroup`=VALUES(`settingGroup`),
  `description`=VALUES(`description`),`isActive`=TRUE,`isDeleted`=FALSE;

-- Uses blockchainIndexerCheckpoint with indexerName = tokenTransfer.
