-- Backend-authoritative USDT token purchase + platform Token Agent mint settlement.
-- MySQL 8+ / MariaDB 10.4+, camelCase, UTC, soft relationships (no foreign keys).

USE `trexCapitalMarket`;
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS `tokenPurchase` (
  `purchaseUid` CHAR(36) NOT NULL,
  `interestUid` CHAR(36) NOT NULL,
  `tokenUid` CHAR(36) NOT NULL,
  `organizationUid` CHAR(36) NOT NULL,
  `investorUid` CHAR(36) NOT NULL,
  `investorUserUid` CHAR(36) NOT NULL,
  `idempotencyKey` VARCHAR(100) NOT NULL,
  `chainId` BIGINT UNSIGNED NOT NULL,
  `usdtContractAddress` VARCHAR(42) NOT NULL,
  `tokenAddress` VARCHAR(42) NOT NULL,
  `investorWalletAddress` VARCHAR(42) NOT NULL,
  `treasuryWalletAddress` VARCHAR(42) NOT NULL,
  `platformWalletAddress` VARCHAR(42) NOT NULL,
  `usdtDecimals` TINYINT UNSIGNED NOT NULL,
  `tokenDecimals` TINYINT UNSIGNED NOT NULL,
  `tokenPrice` DECIMAL(65,18) NOT NULL,
  `tokenAmount` DECIMAL(65,18) NOT NULL,
  `tokenAmountRaw` VARCHAR(78) NOT NULL,
  `usdtAmount` DECIMAL(65,18) NOT NULL,
  `usdtAmountRaw` VARCHAR(78) NOT NULL,
  `balanceBeforeRaw` VARCHAR(78) NOT NULL,
  `status` ENUM('PENDING_PAYMENT','PAYMENT_CONFIRMED','MINT_SUBMITTED','COMPLETED','EXPIRED') NOT NULL DEFAULT 'PENDING_PAYMENT',
  `activeInterestUid` CHAR(36)
    GENERATED ALWAYS AS (CASE WHEN `status` IN ('PENDING_PAYMENT','PAYMENT_CONFIRMED','MINT_SUBMITTED') THEN `interestUid` ELSE NULL END) STORED,
  `activeInvestorUid` CHAR(36)
    GENERATED ALWAYS AS (CASE WHEN `status` IN ('PENDING_PAYMENT','PAYMENT_CONFIRMED','MINT_SUBMITTED') THEN `investorUid` ELSE NULL END) STORED,

  `expiresAt` DATETIME(3) NOT NULL,
  `expiredAt` DATETIME(3) NULL,
  `expirationReason` VARCHAR(100) NULL,

  `paymentTxHash` VARCHAR(66) NULL,
  `paymentTxReceivedAt` DATETIME(3) NULL,
  `paymentBlockNumber` BIGINT UNSIGNED NULL,
  `paymentBlockHash` VARCHAR(66) NULL,
  `paymentTransactionIndex` INT UNSIGNED NULL,
  `paymentLogIndex` INT UNSIGNED NULL,
  `paymentGasUsed` VARCHAR(78) NULL,
  `paymentEffectiveGasPrice` VARCHAR(78) NULL,
  `paymentVerifiedAt` DATETIME(3) NULL,

  `mintStatus` ENUM('NOT_STARTED','QUEUED','PROCESSING','SUBMITTED','CONFIRMED','FAILED') NOT NULL DEFAULT 'NOT_STARTED',
  `mintPreparedAtBlock` BIGINT UNSIGNED NULL,
  `mintTxHash` VARCHAR(66) NULL,
  `mintSubmittedAt` DATETIME(3) NULL,
  `mintBlockNumber` BIGINT UNSIGNED NULL,
  `mintBlockHash` VARCHAR(66) NULL,
  `mintTransactionIndex` INT UNSIGNED NULL,
  `mintLogIndex` INT UNSIGNED NULL,
  `mintGasUsed` VARCHAR(78) NULL,
  `mintEffectiveGasPrice` VARCHAR(78) NULL,
  `mintConfirmedAt` DATETIME(3) NULL,

  `preparedAtBlock` BIGINT UNSIGNED NOT NULL,
  `lastPaymentScannedBlock` BIGINT UNSIGNED NULL,
  `lastMintScannedBlock` BIGINT UNSIGNED NULL,
  `errorStage` ENUM('PAYMENT','MINT') NULL,
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
  PRIMARY KEY (`purchaseUid`),
  UNIQUE KEY `ukTokenPurchaseIdempotency` (`investorUserUid`,`idempotencyKey`),
  UNIQUE KEY `ukTokenPurchaseActiveInterest` (`activeInterestUid`),
  UNIQUE KEY `ukTokenPurchaseActiveInvestor` (`activeInvestorUid`),
  UNIQUE KEY `ukTokenPurchasePaymentTxHash` (`paymentTxHash`),
  UNIQUE KEY `ukTokenPurchaseMintTxHash` (`mintTxHash`),
  KEY `idxTokenPurchaseRecovery` (`status`,`syncStatus`,`nextSyncAt`,`isDeleted`,`createdAt`),
  KEY `idxTokenPurchaseExpiration` (`status`,`paymentTxHash`,`expiresAt`,`isDeleted`),
  KEY `idxTokenPurchaseInvestor` (`investorUserUid`,`createdAt`),
  KEY `idxTokenPurchaseMatch` (`chainId`,`usdtContractAddress`,`investorWalletAddress`,`treasuryWalletAddress`,`status`)
) ENGINE=InnoDB;

-- Append-only history of every frontend payment hash and backend mint hash, including failed
-- verification/reverted attempts. The main tokenPurchase row holds the authoritative latest state.
CREATE TABLE IF NOT EXISTS `tokenPurchaseTransaction` (
  `purchaseTransactionUid` CHAR(36) NOT NULL,
  `purchaseUid` CHAR(36) NOT NULL,
  `stage` ENUM('PAYMENT','MINT') NOT NULL,
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
  PRIMARY KEY (`purchaseTransactionUid`),
  UNIQUE KEY `ukTokenPurchaseTransactionHash` (`txHash`),
  KEY `idxTokenPurchaseTransactionPurchase` (`purchaseUid`,`stage`,`createdAt`)
) ENGINE=InnoDB;

-- Durable raw USDT Transfer ledger. The global checkpoint advances only after these rows are stored.
CREATE TABLE IF NOT EXISTS `tokenPurchasePaymentEvent` (
  `paymentEventUid` CHAR(36) NOT NULL,
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
  `matchedPurchaseUid` CHAR(36) NULL,
  `processingAttempts` INT UNSIGNED NOT NULL DEFAULT 0,
  `processingMessage` VARCHAR(2000) NULL,
  `processedAt` DATETIME(3) NULL,
  `isCanonical` BOOLEAN NOT NULL DEFAULT TRUE,
  `createdAt` DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`paymentEventUid`),
  UNIQUE KEY `ukTokenPurchasePaymentEvent` (`chainId`,`txHash`,`logIndex`),
  KEY `idxTokenPurchasePaymentEventProcess` (`chainId`,`processingStatus`,`isCanonical`,`blockNumber`),
  KEY `idxTokenPurchasePaymentEventMatch` (`fromWalletAddress`,`toWalletAddress`,`amountRaw`,`blockNumber`)
) ENGINE=InnoDB;

INSERT INTO `permissionMaster`
  (`permissionUid`,`roleUid`,`menuUid`,`permissionName`,`permissionCode`,`httpMethod`,`apiPath`)
VALUES
  (UUID(),'00000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000009','Create token purchase','INVESTOR_TOKEN_PURCHASE_CREATE','POST','/api/v1/investments/tokens/:tokenUid/purchases'),
  (UUID(),'00000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000009','List token purchase history','INVESTOR_TOKEN_PURCHASE_HISTORY','GET','/api/v1/investments/tokens/:tokenUid/purchases'),
  (UUID(),'00000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000009','View token purchase','INVESTOR_TOKEN_PURCHASE_VIEW','GET','/api/v1/investments/purchases/:purchaseUid'),
  (UUID(),'00000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000009','Confirm token purchase payment','INVESTOR_TOKEN_PURCHASE_CONFIRM','POST','/api/v1/investments/purchases/:purchaseUid/confirm'),
  (UUID(),'00000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000009','Retry token purchase settlement','INVESTOR_TOKEN_PURCHASE_RETRY','POST','/api/v1/investments/purchases/:purchaseUid/retry')
ON DUPLICATE KEY UPDATE `permissionName`=VALUES(`permissionName`),`menuUid`=VALUES(`menuUid`),
  `isAllowed`=TRUE,`isActive`=TRUE,`isDeleted`=FALSE;

INSERT INTO `generalSettings`
  (`settingUid`,`settingKey`,`settingValue`,`valueType`,`settingGroup`,`description`,`isPublic`)
VALUES
  ('20000000-0000-4000-8000-0000000000e1','PurchaseWorkerEnabled','true','boolean','purchaseWorker','Enables USDT indexing and token mint recovery.',FALSE),
  ('20000000-0000-4000-8000-0000000000e2','PurchaseWorkerIntervalSeconds','15','number','purchaseWorker','Delay between purchase reconciliation runs.',FALSE),
  ('20000000-0000-4000-8000-0000000000e3','PurchaseIndexerBlockOffset','1000','number','purchaseWorker','Maximum sequential blocks per USDT log query.',FALSE),
  ('20000000-0000-4000-8000-0000000000e4','PurchaseIndexerConfirmationBlocks','12','number','purchaseWorker','Safe-head confirmation buffer for payments and mints.',FALSE),
  ('20000000-0000-4000-8000-0000000000e5','PurchaseWorkerLeaseSeconds','180','number','purchaseWorker','Distributed lease duration; serializes platform-wallet minting.',FALSE),
  ('20000000-0000-4000-8000-0000000000e6','PurchaseWorkerBatchSize','50','number','purchaseWorker','Purchase rows reconciled per run.',FALSE),
  ('20000000-0000-4000-8000-0000000000e7','PurchaseEventBatchSize','200','number','purchaseWorker','Stored USDT events matched per run.',FALSE),
  ('20000000-0000-4000-8000-0000000000e8','PurchaseIndexerMaxChunksPerRun','10','number','purchaseWorker','Maximum checkpoint chunks scanned per run.',FALSE),
  ('20000000-0000-4000-8000-0000000000e9','PurchaseExpirationBatchSize','50','number','purchaseWorker','Abandoned no-hash payment intents expired per worker run.',FALSE),
  ('20000000-0000-4000-8000-0000000000ea','PurchaseIntentExpiryGraceSeconds','180','number','purchaseWorker','Grace period after intent expiry so the safe-chain indexer can recover a submitted transfer.',FALSE)
ON DUPLICATE KEY UPDATE `valueType`=VALUES(`valueType`),`settingGroup`=VALUES(`settingGroup`),
  `description`=VALUES(`description`),`isActive`=TRUE,`isDeleted`=FALSE;

-- Uses blockchainIndexerCheckpoint with indexerName = tokenPurchasePayment.
