-- Backend-authoritative Identity Registry registration flow (MySQL 8+).
-- Records intent before MetaMask, independently verifies registerIdentity on-chain, and adds
-- a hybrid global-indexer + targeted-recovery audit trail. CamelCase, UTC, no foreign keys.

USE `trexCapitalMarket`;
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS `identityRegistryRegistration` (
  `registryRegistrationUid` CHAR(36) NOT NULL,
  `interestUid` CHAR(36) NOT NULL,
  `tokenUid` CHAR(36) NOT NULL,
  `organizationUid` CHAR(36) NOT NULL,
  `investorUid` CHAR(36) NOT NULL,
  `issuerUserUid` CHAR(36) NOT NULL,
  `chainId` BIGINT UNSIGNED NOT NULL,
  `identityRegistryAddress` VARCHAR(42) NOT NULL,
  `issuerWalletAddress` VARCHAR(42) NOT NULL,
  `investorWalletAddress` VARCHAR(42) NOT NULL,
  `investorIdentityAddress` VARCHAR(42) NOT NULL,
  `countryCode` SMALLINT UNSIGNED NOT NULL,
  `status` ENUM('PENDING', 'CONFIRMED') NOT NULL DEFAULT 'PENDING',
  `txHash` VARCHAR(66) NULL,
  `preparedAtBlock` BIGINT UNSIGNED NULL,
  `lastScannedBlock` BIGINT UNSIGNED NULL,
  `blockNumber` BIGINT UNSIGNED NULL,
  `blockHash` VARCHAR(66) NULL,
  `transactionIndex` INT UNSIGNED NULL,
  `logIndex` INT UNSIGNED NULL,
  `verifiedAt` DATETIME(3) NULL,
  `errorCode` VARCHAR(80) NULL,
  `errorMessage` VARCHAR(1000) NULL,
  `syncStatus` ENUM('IDLE', 'QUEUED', 'PROCESSING', 'FAILED') NOT NULL DEFAULT 'IDLE',
  `syncRequestedAt` DATETIME(3) NULL,
  `syncStartedAt` DATETIME(3) NULL,
  `syncCompletedAt` DATETIME(3) NULL,
  `syncAttempts` INT UNSIGNED NOT NULL DEFAULT 0,
  `nextSyncAt` DATETIME(3) NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT TRUE,
  `isDeleted` BOOLEAN NOT NULL DEFAULT FALSE,
  `createdAt` DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`registryRegistrationUid`),
  UNIQUE KEY `ukIdentityRegistryRegistrationInterest` (`interestUid`),
  UNIQUE KEY `ukIdentityRegistryRegistrationTxHash` (`txHash`),
  KEY `idxIdentityRegistryRegistrationRecovery`
    (`status`, `syncStatus`, `nextSyncAt`, `isDeleted`, `createdAt`),
  KEY `idxIdentityRegistryRegistrationMatch`
    (`chainId`, `identityRegistryAddress`, `investorWalletAddress`, `investorIdentityAddress`, `status`, `isDeleted`),
  KEY `idxIdentityRegistryRegistrationIssuer`
    (`organizationUid`, `issuerUserUid`, `status`, `isDeleted`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `identityRegistryBlockchainEvent` (
  `registryEventUid` CHAR(36) NOT NULL,
  `chainId` BIGINT UNSIGNED NOT NULL,
  `identityRegistryAddress` VARCHAR(42) NOT NULL,
  `investorWalletAddress` VARCHAR(42) NOT NULL,
  `investorIdentityAddress` VARCHAR(42) NOT NULL,
  `eventName` ENUM('IdentityRegistered') NOT NULL,
  `txHash` VARCHAR(66) NOT NULL,
  `blockNumber` BIGINT UNSIGNED NOT NULL,
  `blockHash` VARCHAR(66) NULL,
  `transactionIndex` INT UNSIGNED NOT NULL,
  `logIndex` INT UNSIGNED NOT NULL,
  `processingStatus` ENUM('NEW', 'MATCHED', 'UNMATCHED', 'FAILED') NOT NULL DEFAULT 'NEW',
  `matchedRegistrationUid` CHAR(36) NULL,
  `processingAttempts` INT UNSIGNED NOT NULL DEFAULT 0,
  `processingMessage` VARCHAR(2000) NULL,
  `processedAt` DATETIME(3) NULL,
  `isCanonical` BOOLEAN NOT NULL DEFAULT TRUE,
  `isActive` BOOLEAN NOT NULL DEFAULT TRUE,
  `isDeleted` BOOLEAN NOT NULL DEFAULT FALSE,
  `createdAt` DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`registryEventUid`),
  UNIQUE KEY `ukIdentityRegistryBlockchainEvent` (`chainId`, `txHash`, `logIndex`),
  KEY `idxIdentityRegistryEventProcessing`
    (`chainId`, `processingStatus`, `isCanonical`, `isDeleted`, `blockNumber`),
  KEY `idxIdentityRegistryEventMatch`
    (`chainId`, `identityRegistryAddress`, `investorWalletAddress`, `investorIdentityAddress`, `blockNumber`)
) ENGINE=InnoDB;

INSERT INTO `permissionMaster`
  (`permissionUid`, `roleUid`, `menuUid`, `permissionName`, `permissionCode`, `httpMethod`, `apiPath`)
VALUES
  (UUID(), '00000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000009',
    'Create or resume registry registration', 'ISSUER_REGISTRY_REGISTRATION_CREATE', 'POST',
    '/api/v1/investments/issuer/interests/:interestUid/registry-registration'),
  (UUID(), '00000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000009',
    'View registry registration', 'ISSUER_REGISTRY_REGISTRATION_VIEW', 'GET',
    '/api/v1/investments/issuer/interests/:interestUid/registry-registration'),
  (UUID(), '00000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000009',
    'Confirm registry registration', 'ISSUER_REGISTRY_REGISTRATION_CONFIRM', 'POST',
    '/api/v1/investments/issuer/interests/:interestUid/registry-registration/:registryRegistrationUid/confirm')
ON DUPLICATE KEY UPDATE
  `permissionName` = VALUES(`permissionName`), `menuUid` = VALUES(`menuUid`),
  `isAllowed` = TRUE, `isActive` = TRUE, `isDeleted` = FALSE;

INSERT INTO `generalSettings`
  (`settingUid`, `settingKey`, `settingValue`, `valueType`, `settingGroup`, `description`, `isPublic`)
VALUES
  ('20000000-0000-4000-8000-0000000000d1', 'RegistryIndexerEnabled', 'true', 'boolean', 'registryIndexer', 'Enables IdentityRegistered indexing and targeted pending-operation recovery.', FALSE),
  ('20000000-0000-4000-8000-0000000000d2', 'RegistryIndexerIntervalSeconds', '15', 'number', 'registryIndexer', 'Delay between Identity Registry reconciliation runs.', FALSE),
  ('20000000-0000-4000-8000-0000000000d3', 'RegistryIndexerStartBlock', '0', 'number', 'registryIndexer', 'Initial global registry indexer block; zero derives a safe platform start.', FALSE),
  ('20000000-0000-4000-8000-0000000000d4', 'RegistryIndexerBlockOffset', '1000', 'number', 'registryIndexer', 'Maximum sequential blocks per registry indexer chunk.', FALSE),
  ('20000000-0000-4000-8000-0000000000d5', 'RegistryIndexerConfirmationBlocks', '2', 'number', 'registryIndexer', 'Safe-head confirmation buffer for registry indexing.', FALSE),
  ('20000000-0000-4000-8000-0000000000d6', 'RegistryIndexerAddressBatchSize', '100', 'number', 'registryIndexer', 'Registry contract addresses per eth_getLogs request.', FALSE),
  ('20000000-0000-4000-8000-0000000000d7', 'RegistryIndexerEventBatchSize', '200', 'number', 'registryIndexer', 'Stored registry events reconciled per run.', FALSE),
  ('20000000-0000-4000-8000-0000000000d8', 'RegistryIndexerLeaseSeconds', '120', 'number', 'registryIndexer', 'Distributed database lease duration.', FALSE),
  ('20000000-0000-4000-8000-0000000000d9', 'RegistryIndexerMaxChunksPerRun', '20', 'number', 'registryIndexer', 'Maximum checkpoint chunks processed per run.', FALSE),
  ('20000000-0000-4000-8000-0000000000da', 'RegistryRecoveryBatchSize', '100', 'number', 'registryIndexer', 'Pending registry operations processed by targeted recovery per run.', FALSE),
  ('20000000-0000-4000-8000-0000000000db', 'RegistryRecoveryLookbackBlocks', '200000', 'number', 'registryIndexer', 'Maximum bounded lookback when recovering an operation without txHash.', FALSE)
ON DUPLICATE KEY UPDATE
  `valueType` = VALUES(`valueType`), `settingGroup` = VALUES(`settingGroup`),
  `description` = VALUES(`description`), `isActive` = TRUE, `isDeleted` = FALSE;

-- Uses the existing blockchainIndexerCheckpoint table with indexerName = identityRegistryRegistration.
-- Disable RegistryIndexerEnabled before a manual rollback and retain confirmed audit rows.
