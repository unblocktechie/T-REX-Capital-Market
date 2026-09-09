-- Hybrid investor-claim synchronization architecture (MySQL 8+).
--
-- Adds:
--   1. Durable synchronization state and bounded recovery cursors to investorClaimSubmission.
--   2. A chain-scoped global indexer checkpoint with a DB lease for multi-instance safety.
--   3. A durable raw ClaimAdded/ClaimChanged event ledger. Checkpoints may advance only after
--      the corresponding block-range events are stored here.
--   4. Operator settings for the global indexer and fast targeted recovery runner.
--
-- No foreign keys are intentionally defined. All timestamps are UTC.

USE `trexCapitalMarket`;
SET time_zone = '+00:00';

ALTER TABLE `investorClaimSubmission`
  ADD COLUMN `preparedAtBlock` BIGINT NULL AFTER `issuerIdentityAddress`,
  ADD COLUMN `lastScannedBlock` BIGINT NULL AFTER `preparedAtBlock`,
  ADD COLUMN `syncStatus` ENUM('IDLE', 'QUEUED', 'PROCESSING', 'FAILED') NOT NULL DEFAULT 'IDLE' AFTER `failureReason`,
  ADD COLUMN `syncRequestedAt` DATETIME(3) NULL AFTER `syncStatus`,
  ADD COLUMN `syncStartedAt` DATETIME(3) NULL AFTER `syncRequestedAt`,
  ADD COLUMN `syncCompletedAt` DATETIME(3) NULL AFTER `syncStartedAt`,
  ADD COLUMN `syncAttempts` INT UNSIGNED NOT NULL DEFAULT 0 AFTER `syncCompletedAt`,
  ADD COLUMN `syncFailureReason` VARCHAR(1000) NULL AFTER `syncAttempts`,
  ADD COLUMN `nextSyncAt` DATETIME(3) NULL AFTER `syncFailureReason`,
  ADD KEY `idxInvestorClaimSubmissionRecovery`
    (`status`, `txHash`, `syncStatus`, `isDeleted`, `createdAt`),
  ADD KEY `idxInvestorClaimSubmissionChainMatch`
    (`investorIdentityAddress`, `issuerIdentityAddress`, `claimTopic`, `status`, `isDeleted`);

CREATE TABLE IF NOT EXISTS `blockchainIndexerCheckpoint` (
  `checkpointUid` CHAR(36) NOT NULL,
  `indexerName` VARCHAR(80) NOT NULL,
  `chainId` BIGINT UNSIGNED NOT NULL,
  `startBlock` BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `lastIndexedBlock` BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `lastIndexedBlockHash` VARCHAR(66) NULL,
  `leaseOwner` VARCHAR(120) NULL,
  `leaseExpiresAt` DATETIME(3) NULL,
  `lastRunAt` DATETIME(3) NULL,
  `lastSuccessAt` DATETIME(3) NULL,
  `lastErrorMessage` VARCHAR(2000) NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT TRUE,
  `isDeleted` BOOLEAN NOT NULL DEFAULT FALSE,
  `createdAt` DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`checkpointUid`),
  UNIQUE KEY `ukBlockchainIndexerCheckpoint` (`indexerName`, `chainId`),
  KEY `idxBlockchainIndexerLease` (`indexerName`, `chainId`, `leaseExpiresAt`, `isActive`, `isDeleted`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `investorClaimBlockchainEvent` (
  `claimEventUid` CHAR(36) NOT NULL,
  `chainId` BIGINT UNSIGNED NOT NULL,
  `identityAddress` VARCHAR(42) NOT NULL,
  `claimId` VARCHAR(66) NOT NULL,
  `claimTopic` INT NOT NULL,
  `scheme` INT NOT NULL,
  `issuerIdentityAddress` VARCHAR(42) NOT NULL,
  `data` LONGTEXT NULL,
  `signature` LONGTEXT NULL,
  `uri` TEXT NULL,
  `eventName` ENUM('ClaimAdded', 'ClaimChanged') NOT NULL,
  `txHash` VARCHAR(66) NOT NULL,
  `blockNumber` BIGINT UNSIGNED NOT NULL,
  `blockHash` VARCHAR(66) NULL,
  `transactionIndex` INT UNSIGNED NOT NULL,
  `logIndex` INT UNSIGNED NOT NULL,
  `processingStatus` ENUM('NEW', 'MATCHED', 'UNMATCHED', 'FAILED') NOT NULL DEFAULT 'NEW',
  `matchedSubmissionUid` CHAR(36) NULL,
  `processingAttempts` INT UNSIGNED NOT NULL DEFAULT 0,
  `processingMessage` VARCHAR(2000) NULL,
  `processedAt` DATETIME(3) NULL,
  `isCanonical` BOOLEAN NOT NULL DEFAULT TRUE,
  `isActive` BOOLEAN NOT NULL DEFAULT TRUE,
  `isDeleted` BOOLEAN NOT NULL DEFAULT FALSE,
  `createdAt` DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`claimEventUid`),
  UNIQUE KEY `ukInvestorClaimBlockchainEvent` (`chainId`, `txHash`, `logIndex`),
  KEY `idxInvestorClaimEventProcessing`
    (`chainId`, `processingStatus`, `isCanonical`, `isDeleted`, `blockNumber`),
  KEY `idxInvestorClaimEventIdentity`
    (`chainId`, `identityAddress`, `claimTopic`, `issuerIdentityAddress`, `blockNumber`),
  KEY `idxInvestorClaimEventClaimId` (`chainId`, `claimId`, `blockNumber`)
) ENGINE=InnoDB;

INSERT INTO `generalSettings`
  (`settingUid`, `settingKey`, `settingValue`, `valueType`, `settingGroup`, `description`, `isPublic`)
VALUES
  ('20000000-0000-4000-8000-0000000000c1', 'ClaimIndexerEnabled', 'true', 'boolean', 'claimIndexer',
    'Master switch for the global multi-ONCHAINID claim event indexer.', FALSE),
  ('20000000-0000-4000-8000-0000000000c2', 'ClaimIndexerIntervalSeconds', '15', 'number', 'claimIndexer',
    'Delay in seconds between global claim indexer runs.', FALSE),
  ('20000000-0000-4000-8000-0000000000c3', 'ClaimIndexerStartBlock', '0', 'number', 'claimIndexer',
    'First blockchain block indexed on initial startup. Zero uses the configured environment start block or one chunk behind the safe head.', FALSE),
  ('20000000-0000-4000-8000-0000000000c4', 'ClaimIndexerBlockOffset', '1000', 'number', 'claimIndexer',
    'Number of sequential blocks processed per checkpointed indexer chunk.', FALSE),
  ('20000000-0000-4000-8000-0000000000c5', 'ClaimIndexerConfirmationBlocks', '2', 'number', 'claimIndexer',
    'Confirmation buffer applied before claim events are indexed.', FALSE),
  ('20000000-0000-4000-8000-0000000000c6', 'ClaimIndexerAddressBatchSize', '100', 'number', 'claimIndexer',
    'Maximum ONCHAINID contract addresses included in one eth_getLogs request.', FALSE),
  ('20000000-0000-4000-8000-0000000000c7', 'ClaimIndexerEventBatchSize', '200', 'number', 'claimIndexer',
    'Maximum stored claim events matched to submissions per processing pass.', FALSE),
  ('20000000-0000-4000-8000-0000000000c8', 'ClaimIndexerLeaseSeconds', '120', 'number', 'claimIndexer',
    'Database-backed global indexer lease duration for multi-instance deployments.', FALSE),
  ('20000000-0000-4000-8000-0000000000c9', 'ClaimRecoveryIntervalSeconds', '15', 'number', 'claimRecovery',
    'Delay in seconds between targeted investor claim recovery runs.', FALSE),
  ('20000000-0000-4000-8000-0000000000ca', 'ClaimIndexerMaxChunksPerRun', '20', 'number', 'claimIndexer',
    'Maximum sequential block chunks processed in one indexer run before yielding.', FALSE)
ON DUPLICATE KEY UPDATE
  `valueType` = VALUES(`valueType`),
  `settingGroup` = VALUES(`settingGroup`),
  `description` = VALUES(`description`),
  `isActive` = TRUE,
  `isDeleted` = FALSE;

-- Operator-tuned settingValue values are intentionally preserved on re-run.

-- Rollback is intentionally manual because confirmed event audit records must be reviewed before
-- removal. Disable ClaimIndexerEnabled and ClaimRecoveryEnabled before rolling back.
