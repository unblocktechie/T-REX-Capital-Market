-- Canonical, read-only transaction history for frontend-executed blockchain actions.
-- Blockchain events are authoritative; legacy purchase/redemption/transfer tables remain for migration only.

USE `trexCapitalMarket`;
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS `blockchainTransaction` (
  `transactionUid` CHAR(36) NOT NULL,
  `chainId` BIGINT UNSIGNED NOT NULL,
  `tokenUid` CHAR(36) NOT NULL,
  `organizationUid` CHAR(36) NOT NULL,
  `tokenAddress` VARCHAR(42) NOT NULL,
  `controllerAddress` VARCHAR(42) NULL,
  `transactionHash` VARCHAR(66) NOT NULL,
  `blockNumber` BIGINT UNSIGNED NULL,
  `blockHash` VARCHAR(66) NULL,
  `transactionIndex` INT UNSIGNED NULL,
  `logIndex` INT UNSIGNED NULL,
  `gasUsed` VARCHAR(78) NULL,
  `effectiveGasPrice` VARCHAR(78) NULL,
  `type` ENUM('INVEST','TRANSFER','REDEMPTION','USDT_APPROVAL','TOKEN_ISSUE','TOKEN_BURN','PRICE_UPDATE') NOT NULL,
  `executionType` ENUM('DIRECT','DELEGATED') NOT NULL DEFAULT 'DIRECT',
  `initiatedByUserUid` CHAR(36) NULL,
  `initiatedByWallet` VARCHAR(42) NOT NULL,
  `fromWallet` VARCHAR(42) NULL,
  `toWallet` VARCHAR(42) NULL,
  `tokenAmountRaw` VARCHAR(78) NULL,
  `tokenAmountFormatted` DECIMAL(65,18) NULL,
  `usdtAmountRaw` VARCHAR(78) NULL,
  `usdtAmountFormatted` DECIMAL(65,18) NULL,
  `tokenSymbol` VARCHAR(10) NULL,
  `status` ENUM('SUBMITTED','CONFIRMED','FAILED','ORPHANED') NOT NULL DEFAULT 'SUBMITTED',
  `confirmationCount` INT UNSIGNED NOT NULL DEFAULT 0,
  `blockTimestamp` DATETIME(3) NULL,
  `confirmedAt` DATETIME(3) NULL,
  `errorCode` VARCHAR(100) NULL,
  `errorMessage` VARCHAR(2000) NULL,
  `isCanonical` BOOLEAN NOT NULL DEFAULT TRUE,
  `isActive` BOOLEAN NOT NULL DEFAULT TRUE,
  `isDeleted` BOOLEAN NOT NULL DEFAULT FALSE,
  `createdAt` DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`transactionUid`),
  UNIQUE KEY `ukBlockchainTransactionAction` (`chainId`,`transactionHash`,`type`),
  UNIQUE KEY `ukBlockchainTransactionEvent` (`chainId`,`transactionHash`,`logIndex`),
  KEY `idxBlockchainTransactionToken` (`tokenUid`,`status`,`blockNumber`),
  KEY `idxBlockchainTransactionOrganization` (`organizationUid`,`status`,`blockTimestamp`),
  KEY `idxBlockchainTransactionInitiator` (`initiatedByUserUid`,`status`,`blockTimestamp`),
  KEY `idxBlockchainTransactionWallets` (`initiatedByWallet`,`fromWallet`,`toWallet`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `blockchainIndexedContract` (
  `indexedContractUid` CHAR(36) NOT NULL,
  `indexerName` VARCHAR(80) NOT NULL,
  `chainId` BIGINT UNSIGNED NOT NULL,
  `tokenUid` CHAR(36) NOT NULL,
  `contractAddress` VARCHAR(42) NOT NULL,
  `startBlock` BIGINT UNSIGNED NOT NULL,
  `lastBackfilledBlock` BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `backfillCompletedAt` DATETIME(3) NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT TRUE,
  `isDeleted` BOOLEAN NOT NULL DEFAULT FALSE,
  `createdAt` DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`indexedContractUid`),
  UNIQUE KEY `ukBlockchainIndexedContract` (`indexerName`,`chainId`,`contractAddress`),
  KEY `idxBlockchainIndexedContractBackfill` (`indexerName`,`chainId`,`lastBackfilledBlock`,`isDeleted`)
) ENGINE=InnoDB;

INSERT INTO `permissionMaster`
  (`permissionUid`,`roleUid`,`menuUid`,`permissionName`,`permissionCode`,`httpMethod`,`apiPath`)
VALUES
  (UUID(),'00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000009','List blockchain transactions','BLOCKCHAIN_TRANSACTION_LIST','GET','/api/v1/investments/transactions'),
  (UUID(),'00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000009','Export blockchain transactions','BLOCKCHAIN_TRANSACTION_EXPORT','GET','/api/v1/investments/transactions/export'),
  (UUID(),'00000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000009','List issuer blockchain transactions','BLOCKCHAIN_TRANSACTION_LIST','GET','/api/v1/investments/transactions'),
  (UUID(),'00000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000009','Export issuer blockchain transactions','BLOCKCHAIN_TRANSACTION_EXPORT','GET','/api/v1/investments/transactions/export'),
  (UUID(),'00000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000009','Confirm wallet blockchain transaction','BLOCKCHAIN_TRANSACTION_CONFIRM','POST','/api/v1/investments/transactions/confirm'),
  (UUID(),'00000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000009','List investor blockchain transactions','BLOCKCHAIN_TRANSACTION_LIST','GET','/api/v1/investments/transactions'),
  (UUID(),'00000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000009','Export investor blockchain transactions','BLOCKCHAIN_TRANSACTION_EXPORT','GET','/api/v1/investments/transactions/export')
ON DUPLICATE KEY UPDATE `permissionName`=VALUES(`permissionName`),`menuUid`=VALUES(`menuUid`),
  `isAllowed`=TRUE,`isActive`=TRUE,`isDeleted`=FALSE;

INSERT INTO `generalSettings`
  (`settingUid`,`settingKey`,`settingValue`,`valueType`,`settingGroup`,`description`,`isPublic`)
VALUES
  ('22000000-0000-4000-8000-000000000001','TransactionIndexerEnabled','true','boolean','transactionIndexer','Enables read-only indexing of frontend-executed investments, transfers, and redemptions.',FALSE),
  ('22000000-0000-4000-8000-000000000002','TransactionIndexerIntervalSeconds','15','number','transactionIndexer','Delay between canonical transaction indexer runs.',FALSE),
  ('22000000-0000-4000-8000-000000000003','TransactionIndexerBlockOffset','1000','number','transactionIndexer','Maximum sequential blocks processed per indexer chunk.',FALSE),
  ('22000000-0000-4000-8000-000000000004','TransactionIndexerConfirmationBlocks','2','number','transactionIndexer','Confirmations required before a blockchain event becomes canonical history.',FALSE),
  ('22000000-0000-4000-8000-000000000005','TransactionIndexerAddressBatchSize','100','number','transactionIndexer','Token contract addresses per eth_getLogs request.',FALSE),
  ('22000000-0000-4000-8000-000000000006','TransactionIndexerLeaseSeconds','180','number','transactionIndexer','Distributed indexer lease duration.',FALSE),
  ('22000000-0000-4000-8000-000000000007','TransactionIndexerMaxChunksPerRun','10','number','transactionIndexer','Maximum checkpoint chunks processed per run.',FALSE),
  ('22000000-0000-4000-8000-000000000008','TransactionIndexerReorgLookbackBlocks','100','number','transactionIndexer','Blocks rewound when the saved checkpoint is no longer canonical.',FALSE)
ON DUPLICATE KEY UPDATE `valueType`=VALUES(`valueType`),`settingGroup`=VALUES(`settingGroup`),
  `description`=VALUES(`description`),`isActive`=TRUE,`isDeleted`=FALSE;

-- These legacy settlement endpoints are intentionally retired. Historical rows are retained.
UPDATE `permissionMaster`
SET `isAllowed`=FALSE,`isActive`=FALSE,`updatedAt`=UTC_TIMESTAMP(3)
WHERE (`httpMethod`='POST' AND `apiPath` IN (
  '/api/v1/investments/tokens/:tokenUid/purchases',
  '/api/v1/investments/purchases/:purchaseUid/confirm',
  '/api/v1/investments/purchases/:purchaseUid/retry',
  '/api/v1/investments/tokens/:tokenUid/transfers',
  '/api/v1/investments/transfers/:transferUid/confirm',
  '/api/v1/investments/transfers/:transferUid/retry',
  '/api/v1/investments/redemptions/:redemptionUid/retry',
  '/api/v1/investments/issuer/redemptions/:redemptionUid/payment/confirm'
));

-- Uses blockchainIndexerCheckpoint with indexerName = canonicalTransactions.
