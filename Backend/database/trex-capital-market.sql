-- T-REX Capital Market: consolidated fresh-install schema, 2026-11-02
-- Includes current multichain, pricing, API-key policy and application workflow tables.
-- No users, organizations, tokens, transactions, chain secrets or live chain configuration are exported.
-- FRESH INSTALL ONLY: use dated migrations for an existing database.
-- Configure chains/payment tokens through admin APIs and seed locations/admin separately.

CREATE DATABASE IF NOT EXISTS `trexCapitalMarket`
  CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
USE `trexCapitalMarket`;
SET time_zone = '+00:00';
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS `authToken` (
  `tokenUid` char(36) NOT NULL,
  `userUid` char(36) NOT NULL,
  `tokenType` enum('emailVerification','passwordReset') NOT NULL,
  `tokenHash` char(64) NOT NULL,
  `expiresAt` datetime(3) NOT NULL,
  `usedAt` datetime(3) DEFAULT NULL,
  `revokedAt` datetime(3) DEFAULT NULL,
  `isActive` tinyint(1) NOT NULL DEFAULT 1,
  `isDeleted` tinyint(1) NOT NULL DEFAULT 0,
  `createdAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3),
  `updatedAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3) ON UPDATE current_timestamp(3),
  PRIMARY KEY (`tokenUid`),
  UNIQUE KEY `ukAuthTokenHash` (`tokenHash`),
  KEY `idxAuthTokenLookup` (`userUid`,`tokenType`,`expiresAt`,`usedAt`,`revokedAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `blockchainIndexedContract` (
  `indexedContractUid` char(36) NOT NULL,
  `indexerName` varchar(80) NOT NULL,
  `chainId` bigint(20) unsigned NOT NULL,
  `tokenUid` char(36) NOT NULL,
  `contractAddress` varchar(42) NOT NULL,
  `startBlock` bigint(20) unsigned NOT NULL,
  `lastBackfilledBlock` bigint(20) unsigned NOT NULL DEFAULT 0,
  `backfillCompletedAt` datetime(3) DEFAULT NULL,
  `isActive` tinyint(1) NOT NULL DEFAULT 1,
  `isDeleted` tinyint(1) NOT NULL DEFAULT 0,
  `createdAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3),
  `updatedAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3) ON UPDATE current_timestamp(3),
  PRIMARY KEY (`indexedContractUid`),
  UNIQUE KEY `ukBlockchainIndexedContract` (`indexerName`,`chainId`,`contractAddress`),
  KEY `idxBlockchainIndexedContractBackfill` (`indexerName`,`chainId`,`lastBackfilledBlock`,`isDeleted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `blockchainIndexerCheckpoint` (
  `checkpointUid` char(36) NOT NULL,
  `indexerName` varchar(80) NOT NULL,
  `chainId` bigint(20) unsigned NOT NULL,
  `startBlock` bigint(20) unsigned NOT NULL DEFAULT 0,
  `lastIndexedBlock` bigint(20) unsigned NOT NULL DEFAULT 0,
  `lastIndexedBlockHash` varchar(66) DEFAULT NULL,
  `leaseOwner` varchar(120) DEFAULT NULL,
  `leaseExpiresAt` datetime(3) DEFAULT NULL,
  `lastRunAt` datetime(3) DEFAULT NULL,
  `lastSuccessAt` datetime(3) DEFAULT NULL,
  `lastErrorMessage` varchar(2000) DEFAULT NULL,
  `isActive` tinyint(1) NOT NULL DEFAULT 1,
  `isDeleted` tinyint(1) NOT NULL DEFAULT 0,
  `createdAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3),
  `updatedAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3) ON UPDATE current_timestamp(3),
  PRIMARY KEY (`checkpointUid`),
  UNIQUE KEY `ukBlockchainIndexerCheckpoint` (`indexerName`,`chainId`),
  KEY `idxBlockchainIndexerLease` (`indexerName`,`chainId`,`leaseExpiresAt`,`isActive`,`isDeleted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `blockchainTransaction` (
  `transactionUid` char(36) NOT NULL,
  `chainUid` char(36) NOT NULL,
  `chainId` bigint(20) unsigned NOT NULL,
  `tokenUid` char(36) NOT NULL,
  `organizationUid` char(36) NOT NULL,
  `tokenAddress` varchar(42) NOT NULL,
  `controllerAddress` varchar(42) DEFAULT NULL,
  `transactionHash` varchar(66) NOT NULL,
  `blockNumber` bigint(20) unsigned DEFAULT NULL,
  `blockHash` varchar(66) DEFAULT NULL,
  `transactionIndex` int(10) unsigned DEFAULT NULL,
  `logIndex` int(10) unsigned DEFAULT NULL,
  `gasUsed` varchar(78) DEFAULT NULL,
  `effectiveGasPrice` varchar(78) DEFAULT NULL,
  `type` enum('INVEST','TRANSFER','REDEMPTION','USDT_APPROVAL','TOKEN_ISSUE','TOKEN_BURN','PRICE_UPDATE') NOT NULL,
  `executionType` enum('DIRECT','DELEGATED') NOT NULL DEFAULT 'DIRECT',
  `initiatedByUserUid` char(36) DEFAULT NULL,
  `initiatedByWallet` varchar(42) NOT NULL,
  `fromWallet` varchar(42) DEFAULT NULL,
  `toWallet` varchar(42) DEFAULT NULL,
  `tokenAmountRaw` varchar(78) DEFAULT NULL,
  `tokenAmountFormatted` decimal(65,18) DEFAULT NULL,
  `paymentTokenAddress` varchar(42) DEFAULT NULL,
  `paymentTokenName` varchar(80) DEFAULT NULL,
  `paymentTokenSymbol` varchar(20) DEFAULT NULL,
  `paymentTokenDecimals` tinyint(3) unsigned DEFAULT NULL,
  `paymentAmountRaw` varchar(78) DEFAULT NULL,
  `paymentAmountFormatted` decimal(65,18) DEFAULT NULL,
  `usdtAmountRaw` varchar(78) DEFAULT NULL,
  `usdtAmountFormatted` decimal(65,18) DEFAULT NULL,
  `tokenSymbol` varchar(10) DEFAULT NULL,
  `status` enum('SUBMITTED','CONFIRMED','FAILED','ORPHANED') NOT NULL DEFAULT 'SUBMITTED',
  `confirmationCount` int(10) unsigned NOT NULL DEFAULT 0,
  `blockTimestamp` datetime(3) DEFAULT NULL,
  `confirmedAt` datetime(3) DEFAULT NULL,
  `errorCode` varchar(100) DEFAULT NULL,
  `errorMessage` varchar(2000) DEFAULT NULL,
  `isCanonical` tinyint(1) NOT NULL DEFAULT 1,
  `isActive` tinyint(1) NOT NULL DEFAULT 1,
  `isDeleted` tinyint(1) NOT NULL DEFAULT 0,
  `createdAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3),
  `updatedAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3) ON UPDATE current_timestamp(3),
  PRIMARY KEY (`transactionUid`),
  UNIQUE KEY `ukBlockchainTransactionAction` (`chainId`,`transactionHash`,`type`),
  UNIQUE KEY `ukBlockchainTransactionEvent` (`chainId`,`transactionHash`,`logIndex`),
  KEY `idxBlockchainTransactionToken` (`tokenUid`,`status`,`blockNumber`),
  KEY `idxBlockchainTransactionOrganization` (`organizationUid`,`status`,`blockTimestamp`),
  KEY `idxBlockchainTransactionInitiator` (`initiatedByUserUid`,`status`,`blockTimestamp`),
  KEY `idxBlockchainTransactionWallets` (`initiatedByWallet`,`fromWallet`,`toWallet`),
  KEY `idxBlockchainTransactionPaymentToken` (`chainId`,`paymentTokenAddress`,`blockNumber`),
  KEY `idxBlockchainTransactionChainUid` (`chainUid`,`status`,`blockNumber`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `chainMaster` (
  `chainUid` char(36) NOT NULL,
  `chainCode` varchar(40) NOT NULL,
  `chainName` varchar(100) NOT NULL,
  `chainId` bigint(20) unsigned NOT NULL,
  `networkName` varchar(80) NOT NULL,
  `nativeCurrencyName` varchar(50) NOT NULL,
  `nativeCurrencySymbol` varchar(12) NOT NULL,
  `nativeCurrencyDecimals` tinyint(3) unsigned NOT NULL DEFAULT 18,
  `rpcUrl` varchar(1000) NOT NULL,
  `fallbackRpcUrls` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`fallbackRpcUrls`)),
  `publicRpcUrl` varchar(1000) DEFAULT NULL,
  `explorerUrl` varchar(500) DEFAULT NULL,
  `contractSuiteDeployedAt` datetime(3) DEFAULT NULL,
  `trexImplementationAuthorityAddress` varchar(42) DEFAULT NULL,
  `imageOriginalFileName` varchar(255) DEFAULT NULL,
  `imageStorageKey` varchar(255) DEFAULT NULL,
  `imageMimeType` varchar(50) DEFAULT NULL,
  `imageFileSize` int(10) unsigned DEFAULT NULL,
  `imageWidth` smallint(5) unsigned DEFAULT NULL,
  `imageHeight` smallint(5) unsigned DEFAULT NULL,
  `imageChecksumSha256` char(64) DEFAULT NULL,
  `imageVirusScanStatus` enum('notConfigured','clean') DEFAULT NULL,
  `identityFactoryAddress` varchar(42) NOT NULL,
  `platformControllerAddress` varchar(42) NOT NULL,
  `countryRestrictModuleAddress` varchar(42) DEFAULT NULL,
  `maxBalanceModuleAddress` varchar(42) DEFAULT NULL,
  `maxInvestorsModuleAddress` varchar(42) DEFAULT NULL,
  `platformControllerOwnerAddress` varchar(42) DEFAULT NULL,
  `idFactoryAccessManagerAddress` varchar(42) DEFAULT NULL,
  `idFactoryAccessManagerAdminAddress` varchar(42) DEFAULT NULL,
  `tokenImplementationAddress` varchar(42) DEFAULT NULL,
  `claimTopicsRegistryImplementationAddress` varchar(42) DEFAULT NULL,
  `identityRegistryImplementationAddress` varchar(42) DEFAULT NULL,
  `identityRegistryStorageImplementationAddress` varchar(42) DEFAULT NULL,
  `trustedIssuersRegistryImplementationAddress` varchar(42) DEFAULT NULL,
  `modularComplianceImplementationAddress` varchar(42) DEFAULT NULL,
  `identityImplementationAddress` varchar(42) DEFAULT NULL,
  `trexFactoryAddress` varchar(42) NOT NULL,
  `trexGatewayAddress` varchar(42) DEFAULT NULL,
  `identityImplementationAuthorityAddress` varchar(42) DEFAULT NULL,
  `deployerAddress` varchar(42) DEFAULT NULL,
  `deployerPrivateKeyEncrypted` text DEFAULT NULL,
  `confirmations` int(10) unsigned NOT NULL DEFAULT 2,
  `registryConfirmations` int(10) unsigned NOT NULL DEFAULT 2,
  `transactionTimeoutMs` int(10) unsigned NOT NULL DEFAULT 120000,
  `deploymentStartBlock` bigint(20) unsigned NOT NULL DEFAULT 0,
  `claimIndexerStartBlock` bigint(20) unsigned NOT NULL DEFAULT 0,
  `registryIndexerStartBlock` bigint(20) unsigned NOT NULL DEFAULT 0,
  `transactionIndexerStartBlock` bigint(20) unsigned NOT NULL DEFAULT 0,
  `registryRecoveryLookbackBlocks` bigint(20) unsigned NOT NULL DEFAULT 200000,
  `registryRecoveryBlockOffset` int(10) unsigned NOT NULL DEFAULT 20000,
  `reconcileBlockOffset` int(10) unsigned NOT NULL DEFAULT 9000,
  `reconcileMaxLookbackBlocks` bigint(20) unsigned NOT NULL DEFAULT 1000000,
  `deploymentAttemptTtlMinutes` int(10) unsigned NOT NULL DEFAULT 20,
  `delegationManagerAddresses` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`delegationManagerAddresses`)),
  `indexersEnabled` tinyint(1) NOT NULL DEFAULT 1,
  `isTestnet` tinyint(1) NOT NULL DEFAULT 0,
  `isDefault` tinyint(1) NOT NULL DEFAULT 0,
  `displayOrder` int(10) unsigned NOT NULL DEFAULT 0,
  `isActive` tinyint(1) NOT NULL DEFAULT 1,
  `isDeleted` tinyint(1) NOT NULL DEFAULT 0,
  `defaultSlot` tinyint(3) unsigned GENERATED ALWAYS AS (case when `isDefault` = 1 and `isActive` = 1 and `isDeleted` = 0 then 1 else NULL end) STORED,
  `createdAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3),
  `updatedAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3) ON UPDATE current_timestamp(3),
  PRIMARY KEY (`chainUid`),
  UNIQUE KEY `ukChainMasterCode` (`chainCode`),
  UNIQUE KEY `ukChainMasterChainId` (`chainId`),
  UNIQUE KEY `ukChainMasterDefault` (`defaultSlot`),
  KEY `idxChainMasterActive` (`isActive`,`isDeleted`,`isDefault`,`displayOrder`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `chainMasterAudit` (
  `chainAuditUid` char(36) NOT NULL,
  `chainUid` char(36) NOT NULL,
  `changedByUserUid` char(36) NOT NULL,
  `operation` enum('CREATE','UPDATE') NOT NULL,
  `changedFields` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL CHECK (json_valid(`changedFields`)),
  `beforeData` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`beforeData`)),
  `afterData` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`afterData`)),
  `createdAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3),
  `updatedAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3),
  PRIMARY KEY (`chainAuditUid`),
  KEY `idxChainMasterAuditChain` (`chainUid`,`createdAt`),
  KEY `idxChainMasterAuditUser` (`changedByUserUid`,`createdAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `cityMaster` (
  `cityUid` char(36) NOT NULL,
  `countryUid` char(36) NOT NULL,
  `stateUid` char(36) NOT NULL,
  `cityName` varchar(150) NOT NULL,
  `isActive` tinyint(1) NOT NULL DEFAULT 1,
  `isDeleted` tinyint(1) NOT NULL DEFAULT 0,
  `createdAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3),
  `updatedAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3) ON UPDATE current_timestamp(3),
  PRIMARY KEY (`cityUid`),
  UNIQUE KEY `ukCityMasterName` (`stateUid`,`cityName`),
  KEY `idxCityMasterStateName` (`stateUid`,`cityName`,`isActive`,`isDeleted`),
  KEY `idxCityMasterCountryUid` (`countryUid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `claimTopicMaster` (
  `claimTopicUid` char(36) NOT NULL,
  `claimTopicCode` varchar(80) NOT NULL,
  `claimTopicName` varchar(120) NOT NULL,
  `description` varchar(500) DEFAULT NULL,
  `value` int(10) unsigned NOT NULL,
  `displayOrder` int(10) unsigned NOT NULL DEFAULT 0,
  `isActive` tinyint(1) NOT NULL DEFAULT 1,
  `isDeleted` tinyint(1) NOT NULL DEFAULT 0,
  `createdAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3),
  `updatedAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3) ON UPDATE current_timestamp(3),
  PRIMARY KEY (`claimTopicUid`),
  UNIQUE KEY `ukClaimTopicMasterCode` (`claimTopicCode`),
  UNIQUE KEY `ukClaimTopicMasterValue` (`value`),
  KEY `idxClaimTopicMasterStatus` (`isActive`,`isDeleted`,`displayOrder`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `countryMaster` (
  `countryUid` char(36) NOT NULL,
  `countryCode` char(2) NOT NULL,
  `numericCode` char(3) NOT NULL,
  `countryName` varchar(120) NOT NULL,
  `phoneCode` varchar(20) DEFAULT NULL,
  `currencyCode` char(3) DEFAULT NULL,
  `isActive` tinyint(1) NOT NULL DEFAULT 1,
  `isDeleted` tinyint(1) NOT NULL DEFAULT 0,
  `createdAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3),
  `updatedAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3) ON UPDATE current_timestamp(3),
  PRIMARY KEY (`countryUid`),
  UNIQUE KEY `ukCountryMasterCode` (`countryCode`),
  UNIQUE KEY `ukCountryMasterNumericCode` (`numericCode`),
  KEY `idxCountryMasterName` (`countryName`,`isActive`,`isDeleted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `documentTypeMaster` (
  `documentTypeUid` char(36) NOT NULL,
  `documentTypeCode` varchar(80) NOT NULL,
  `documentTypeName` varchar(150) NOT NULL,
  `description` varchar(500) DEFAULT NULL,
  `isRequired` tinyint(1) NOT NULL DEFAULT 0,
  `displayOrder` int(10) unsigned NOT NULL DEFAULT 0,
  `isActive` tinyint(1) NOT NULL DEFAULT 1,
  `isDeleted` tinyint(1) NOT NULL DEFAULT 0,
  `createdAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3),
  `updatedAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3) ON UPDATE current_timestamp(3),
  PRIMARY KEY (`documentTypeUid`),
  UNIQUE KEY `ukDocumentTypeMasterCode` (`documentTypeCode`),
  KEY `idxDocumentTypeMasterStatus` (`isRequired`,`isActive`,`isDeleted`,`displayOrder`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `entityTypeMaster` (
  `entityTypeUid` char(36) NOT NULL,
  `entityTypeCode` varchar(50) NOT NULL,
  `entityTypeName` varchar(100) NOT NULL,
  `displayOrder` int(10) unsigned NOT NULL DEFAULT 0,
  `isActive` tinyint(1) NOT NULL DEFAULT 1,
  `isDeleted` tinyint(1) NOT NULL DEFAULT 0,
  `createdAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3),
  `updatedAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3) ON UPDATE current_timestamp(3),
  PRIMARY KEY (`entityTypeUid`),
  UNIQUE KEY `ukEntityTypeMasterCode` (`entityTypeCode`),
  KEY `idxEntityTypeMasterStatus` (`isActive`,`isDeleted`,`displayOrder`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `generalSettings` (
  `settingUid` char(36) NOT NULL,
  `settingKey` varchar(120) NOT NULL,
  `settingValue` text NOT NULL,
  `valueType` enum('string','number','boolean','json') NOT NULL DEFAULT 'string',
  `settingGroup` varchar(80) NOT NULL DEFAULT 'application',
  `description` varchar(500) DEFAULT NULL,
  `isPublic` tinyint(1) NOT NULL DEFAULT 0,
  `isActive` tinyint(1) NOT NULL DEFAULT 1,
  `isDeleted` tinyint(1) NOT NULL DEFAULT 0,
  `createdAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3),
  `updatedAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3) ON UPDATE current_timestamp(3),
  PRIMARY KEY (`settingUid`),
  UNIQUE KEY `ukGeneralSettingsKey` (`settingKey`),
  KEY `idxGeneralSettingsGroup` (`settingGroup`,`isPublic`,`isActive`,`isDeleted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `identityRegistryBlockchainEvent` (
  `registryEventUid` char(36) NOT NULL,
  `chainId` bigint(20) unsigned NOT NULL,
  `identityRegistryAddress` varchar(42) NOT NULL,
  `investorWalletAddress` varchar(42) NOT NULL,
  `investorIdentityAddress` varchar(42) NOT NULL,
  `eventName` enum('IdentityRegistered') NOT NULL,
  `txHash` varchar(66) NOT NULL,
  `blockNumber` bigint(20) unsigned NOT NULL,
  `blockHash` varchar(66) DEFAULT NULL,
  `transactionIndex` int(10) unsigned NOT NULL,
  `logIndex` int(10) unsigned NOT NULL,
  `processingStatus` enum('NEW','MATCHED','UNMATCHED','FAILED') NOT NULL DEFAULT 'NEW',
  `matchedRegistrationUid` char(36) DEFAULT NULL,
  `processingAttempts` int(10) unsigned NOT NULL DEFAULT 0,
  `processingMessage` varchar(2000) DEFAULT NULL,
  `processedAt` datetime(3) DEFAULT NULL,
  `isCanonical` tinyint(1) NOT NULL DEFAULT 1,
  `isActive` tinyint(1) NOT NULL DEFAULT 1,
  `isDeleted` tinyint(1) NOT NULL DEFAULT 0,
  `createdAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3),
  `updatedAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3) ON UPDATE current_timestamp(3),
  PRIMARY KEY (`registryEventUid`),
  UNIQUE KEY `ukIdentityRegistryBlockchainEvent` (`chainId`,`txHash`,`logIndex`),
  KEY `idxIdentityRegistryEventProcessing` (`chainId`,`processingStatus`,`isCanonical`,`isDeleted`,`blockNumber`),
  KEY `idxIdentityRegistryEventMatch` (`chainId`,`identityRegistryAddress`,`investorWalletAddress`,`investorIdentityAddress`,`blockNumber`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `identityRegistryRegistration` (
  `registryRegistrationUid` char(36) NOT NULL,
  `interestUid` char(36) NOT NULL,
  `tokenUid` char(36) NOT NULL,
  `organizationUid` char(36) NOT NULL,
  `investorUid` char(36) NOT NULL,
  `issuerUserUid` char(36) NOT NULL,
  `chainUid` char(36) NOT NULL,
  `chainId` bigint(20) unsigned NOT NULL,
  `identityRegistryAddress` varchar(42) NOT NULL,
  `issuerWalletAddress` varchar(42) NOT NULL,
  `investorWalletAddress` varchar(42) NOT NULL,
  `investorIdentityAddress` varchar(42) NOT NULL,
  `countryCode` smallint(5) unsigned NOT NULL,
  `status` enum('PENDING','CONFIRMED') NOT NULL DEFAULT 'PENDING',
  `txHash` varchar(66) DEFAULT NULL,
  `preparedAtBlock` bigint(20) unsigned DEFAULT NULL,
  `lastScannedBlock` bigint(20) unsigned DEFAULT NULL,
  `blockNumber` bigint(20) unsigned DEFAULT NULL,
  `blockHash` varchar(66) DEFAULT NULL,
  `transactionIndex` int(10) unsigned DEFAULT NULL,
  `logIndex` int(10) unsigned DEFAULT NULL,
  `verifiedAt` datetime(3) DEFAULT NULL,
  `errorCode` varchar(80) DEFAULT NULL,
  `errorMessage` varchar(1000) DEFAULT NULL,
  `syncStatus` enum('IDLE','QUEUED','PROCESSING','FAILED') NOT NULL DEFAULT 'IDLE',
  `syncRequestedAt` datetime(3) DEFAULT NULL,
  `syncStartedAt` datetime(3) DEFAULT NULL,
  `syncCompletedAt` datetime(3) DEFAULT NULL,
  `syncAttempts` int(10) unsigned NOT NULL DEFAULT 0,
  `nextSyncAt` datetime(3) DEFAULT NULL,
  `isActive` tinyint(1) NOT NULL DEFAULT 1,
  `isDeleted` tinyint(1) NOT NULL DEFAULT 0,
  `createdAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3),
  `updatedAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3) ON UPDATE current_timestamp(3),
  PRIMARY KEY (`registryRegistrationUid`),
  UNIQUE KEY `ukIdentityRegistryRegistrationInterest` (`interestUid`),
  UNIQUE KEY `ukIdentityRegistryRegistrationChainTxHash` (`chainId`,`txHash`),
  KEY `idxIdentityRegistryRegistrationRecovery` (`status`,`syncStatus`,`nextSyncAt`,`isDeleted`,`createdAt`),
  KEY `idxIdentityRegistryRegistrationMatch` (`chainId`,`identityRegistryAddress`,`investorWalletAddress`,`investorIdentityAddress`,`status`,`isDeleted`),
  KEY `idxIdentityRegistryRegistrationIssuer` (`organizationUid`,`issuerUserUid`,`status`,`isDeleted`),
  KEY `idxIdentityRegistryRegistrationChainUid` (`chainUid`,`status`,`isDeleted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `industryMaster` (
  `industryUid` char(36) NOT NULL,
  `industryCode` varchar(50) NOT NULL,
  `industryName` varchar(120) NOT NULL,
  `displayOrder` int(10) unsigned NOT NULL DEFAULT 0,
  `isActive` tinyint(1) NOT NULL DEFAULT 1,
  `isDeleted` tinyint(1) NOT NULL DEFAULT 0,
  `createdAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3),
  `updatedAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3) ON UPDATE current_timestamp(3),
  PRIMARY KEY (`industryUid`),
  UNIQUE KEY `ukIndustryMasterCode` (`industryCode`),
  KEY `idxIndustryMasterStatus` (`isActive`,`isDeleted`,`displayOrder`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `investmentSubmissionDocument` (
  `submissionDocumentUid` char(36) NOT NULL,
  `historyUid` char(36) NOT NULL,
  `interestUid` char(36) NOT NULL,
  `tokenUid` char(36) NOT NULL,
  `organizationUid` char(36) NOT NULL,
  `investorUid` char(36) NOT NULL,
  `submissionNumber` int(11) NOT NULL,
  `documentUid` char(36) NOT NULL,
  `documentTypeUid` char(36) DEFAULT NULL,
  `documentTypeName` varchar(150) DEFAULT NULL,
  `documentCategory` varchar(20) DEFAULT NULL,
  `claimTopicCode` varchar(80) DEFAULT NULL,
  `versionNumber` int(11) DEFAULT NULL,
  `originalFileName` varchar(255) DEFAULT NULL,
  `storageKey` varchar(500) DEFAULT NULL,
  `mimeType` varchar(100) DEFAULT NULL,
  `fileSize` bigint(20) unsigned DEFAULT NULL,
  `isActive` tinyint(1) NOT NULL DEFAULT 1,
  `isDeleted` tinyint(1) NOT NULL DEFAULT 0,
  `createdAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3),
  `updatedAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3) ON UPDATE current_timestamp(3),
  PRIMARY KEY (`submissionDocumentUid`),
  KEY `idxSubmissionDocInterest` (`interestUid`,`submissionNumber`),
  KEY `idxSubmissionDocHistory` (`historyUid`),
  KEY `idxSubmissionDocDocument` (`interestUid`,`documentUid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `investorClaimBlockchainEvent` (
  `claimEventUid` char(36) NOT NULL,
  `chainId` bigint(20) unsigned NOT NULL,
  `identityAddress` varchar(42) NOT NULL,
  `claimId` varchar(66) NOT NULL,
  `claimTopic` int(11) NOT NULL,
  `scheme` int(11) NOT NULL,
  `issuerIdentityAddress` varchar(42) NOT NULL,
  `data` longtext DEFAULT NULL,
  `signature` longtext DEFAULT NULL,
  `uri` text DEFAULT NULL,
  `eventName` enum('ClaimAdded','ClaimChanged') NOT NULL,
  `txHash` varchar(66) NOT NULL,
  `blockNumber` bigint(20) unsigned NOT NULL,
  `blockHash` varchar(66) DEFAULT NULL,
  `transactionIndex` int(10) unsigned NOT NULL,
  `logIndex` int(10) unsigned NOT NULL,
  `processingStatus` enum('NEW','MATCHED','UNMATCHED','FAILED') NOT NULL DEFAULT 'NEW',
  `matchedSubmissionUid` char(36) DEFAULT NULL,
  `processingAttempts` int(10) unsigned NOT NULL DEFAULT 0,
  `processingMessage` varchar(2000) DEFAULT NULL,
  `processedAt` datetime(3) DEFAULT NULL,
  `isCanonical` tinyint(1) NOT NULL DEFAULT 1,
  `isActive` tinyint(1) NOT NULL DEFAULT 1,
  `isDeleted` tinyint(1) NOT NULL DEFAULT 0,
  `createdAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3),
  `updatedAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3) ON UPDATE current_timestamp(3),
  PRIMARY KEY (`claimEventUid`),
  UNIQUE KEY `ukInvestorClaimBlockchainEvent` (`chainId`,`txHash`,`logIndex`),
  KEY `idxInvestorClaimEventProcessing` (`chainId`,`processingStatus`,`isCanonical`,`isDeleted`,`blockNumber`),
  KEY `idxInvestorClaimEventIdentity` (`chainId`,`identityAddress`,`claimTopic`,`issuerIdentityAddress`,`blockNumber`),
  KEY `idxInvestorClaimEventClaimId` (`chainId`,`claimId`,`blockNumber`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `investorClaimSubmission` (
  `submissionUid` char(36) NOT NULL,
  `interestUid` char(36) NOT NULL,
  `claimSignatureUid` char(36) NOT NULL,
  `investorUid` char(36) NOT NULL,
  `tokenUid` char(36) NOT NULL,
  `organizationUid` char(36) NOT NULL,
  `chainUid` char(36) NOT NULL,
  `chainId` bigint(20) unsigned NOT NULL,
  `claimTopic` int(11) NOT NULL,
  `data` text DEFAULT NULL,
  `signature` text DEFAULT NULL,
  `investorIdentityAddress` varchar(42) DEFAULT NULL,
  `issuerIdentityAddress` varchar(42) DEFAULT NULL,
  `preparedAtBlock` bigint(20) DEFAULT NULL,
  `lastScannedBlock` bigint(20) DEFAULT NULL,
  `txHash` varchar(66) DEFAULT NULL,
  `blockNumber` bigint(20) DEFAULT NULL,
  `transactionIndex` int(11) DEFAULT NULL,
  `logIndex` int(11) DEFAULT NULL,
  `status` enum('PENDING','CONFIRMED','FAILED') NOT NULL DEFAULT 'PENDING',
  `failureReason` varchar(255) DEFAULT NULL,
  `syncStatus` enum('IDLE','QUEUED','PROCESSING','FAILED') NOT NULL DEFAULT 'IDLE',
  `syncRequestedAt` datetime(3) DEFAULT NULL,
  `syncStartedAt` datetime(3) DEFAULT NULL,
  `syncCompletedAt` datetime(3) DEFAULT NULL,
  `syncAttempts` int(10) unsigned NOT NULL DEFAULT 0,
  `syncFailureReason` varchar(1000) DEFAULT NULL,
  `nextSyncAt` datetime(3) DEFAULT NULL,
  `submittedAt` datetime(3) DEFAULT NULL,
  `confirmedAt` datetime(3) DEFAULT NULL,
  `isActive` tinyint(1) NOT NULL DEFAULT 1,
  `isDeleted` tinyint(1) NOT NULL DEFAULT 0,
  `createdAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3),
  `updatedAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3) ON UPDATE current_timestamp(3),
  PRIMARY KEY (`submissionUid`),
  UNIQUE KEY `ukInvestorClaimSubmission` (`interestUid`,`claimSignatureUid`),
  UNIQUE KEY `ukInvestorClaimSubmissionEvent` (`txHash`,`logIndex`),
  KEY `idxInvestorClaimSubmissionInterest` (`interestUid`,`status`,`isDeleted`),
  KEY `idxInvestorClaimSubmissionInvestor` (`investorUid`,`isDeleted`),
  KEY `idxInvestorClaimSubmissionRecovery` (`status`,`txHash`,`syncStatus`,`isDeleted`,`createdAt`),
  KEY `idxInvestorClaimSubmissionChainMatch` (`investorIdentityAddress`,`issuerIdentityAddress`,`claimTopic`,`status`,`isDeleted`),
  KEY `idxInvestorClaimSubmissionChain` (`chainId`,`status`,`syncStatus`,`isDeleted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `investorDocument` (
  `documentUid` char(36) NOT NULL,
  `investorUid` char(36) NOT NULL,
  `documentTypeUid` char(36) NOT NULL,
  `versionNumber` int(11) NOT NULL DEFAULT 1,
  `isCurrent` tinyint(1) NOT NULL DEFAULT 1,
  `uploadedByUserUid` char(36) DEFAULT NULL,
  `documentCategory` enum('kyc','accredited') NOT NULL,
  `claimTopicCode` varchar(80) DEFAULT NULL,
  `originalFileName` varchar(255) NOT NULL,
  `storedFileName` varchar(255) NOT NULL,
  `storageKey` varchar(500) NOT NULL,
  `mimeType` varchar(100) NOT NULL,
  `fileSize` bigint(20) unsigned NOT NULL,
  `checksumSha256` char(64) NOT NULL,
  `isActive` tinyint(1) NOT NULL DEFAULT 1,
  `isDeleted` tinyint(1) NOT NULL DEFAULT 0,
  `createdAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3),
  `updatedAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3) ON UPDATE current_timestamp(3),
  PRIMARY KEY (`documentUid`),
  UNIQUE KEY `ukInvestorDocumentStorageKey` (`storageKey`),
  KEY `idxInvestorDocumentInvestor` (`investorUid`,`documentCategory`,`isActive`,`isDeleted`),
  KEY `idxInvestorDocumentType` (`documentTypeUid`),
  KEY `idxInvestorDocumentClaimTopic` (`investorUid`,`claimTopicCode`,`isActive`,`isDeleted`),
  KEY `idxInvestorDocumentCurrent` (`investorUid`,`documentTypeUid`,`isCurrent`,`isDeleted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `investorDocumentTypeMaster` (
  `documentTypeUid` char(36) NOT NULL,
  `documentTypeCode` varchar(80) NOT NULL,
  `documentTypeName` varchar(150) NOT NULL,
  `documentCategory` enum('kyc','accredited') NOT NULL,
  `claimTopicCode` varchar(80) DEFAULT NULL,
  `description` varchar(500) DEFAULT NULL,
  `isRequired` tinyint(1) NOT NULL DEFAULT 0,
  `displayOrder` int(10) unsigned NOT NULL DEFAULT 0,
  `isActive` tinyint(1) NOT NULL DEFAULT 1,
  `isDeleted` tinyint(1) NOT NULL DEFAULT 0,
  `createdAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3),
  `updatedAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3) ON UPDATE current_timestamp(3),
  PRIMARY KEY (`documentTypeUid`),
  UNIQUE KEY `ukInvestorDocumentTypeCode` (`documentTypeCode`),
  KEY `idxInvestorDocumentTypeCategory` (`documentCategory`,`isActive`,`isDeleted`,`displayOrder`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `investorInvestmentCategory` (
  `investorInvestmentCategoryUid` char(36) NOT NULL,
  `investorUid` char(36) NOT NULL,
  `categoryCode` varchar(40) NOT NULL,
  `isActive` tinyint(1) NOT NULL DEFAULT 1,
  `isDeleted` tinyint(1) NOT NULL DEFAULT 0,
  `createdAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3),
  `updatedAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3) ON UPDATE current_timestamp(3),
  PRIMARY KEY (`investorInvestmentCategoryUid`),
  UNIQUE KEY `ukInvestorInvestmentCategory` (`investorUid`,`categoryCode`),
  KEY `idxInvestorInvestmentCategory` (`investorUid`,`isActive`,`isDeleted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `investorInvitation` (
  `invitationUid` char(36) NOT NULL,
  `organizationUid` char(36) NOT NULL,
  `tokenUid` char(36) NOT NULL,
  `issuerUserUid` char(36) NOT NULL,
  `investorUid` char(36) NOT NULL,
  `investorUserUid` char(36) NOT NULL,
  `status` enum('PENDING','SENT','VIEWED') NOT NULL DEFAULT 'PENDING',
  `emailStatus` enum('PENDING','PROCESSING','SENT','FAILED') NOT NULL DEFAULT 'PENDING',
  `emailAttempts` int(10) unsigned NOT NULL DEFAULT 0,
  `emailMessageId` varchar(255) DEFAULT NULL,
  `emailClaimedAt` datetime(3) DEFAULT NULL,
  `lastEmailError` varchar(2000) DEFAULT NULL,
  `sentAt` datetime(3) DEFAULT NULL,
  `viewedAt` datetime(3) DEFAULT NULL,
  `isActive` tinyint(1) NOT NULL DEFAULT 1,
  `isDeleted` tinyint(1) NOT NULL DEFAULT 0,
  `createdAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3),
  `updatedAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3) ON UPDATE current_timestamp(3),
  PRIMARY KEY (`invitationUid`),
  UNIQUE KEY `ukInvestorInvitation` (`organizationUid`,`tokenUid`,`investorUid`),
  KEY `idxInvestorInvitationIssuer` (`issuerUserUid`,`tokenUid`,`status`,`isDeleted`),
  KEY `idxInvestorInvitationInvestor` (`investorUid`,`status`,`sentAt`,`isDeleted`),
  KEY `idxInvestorInvitationEmail` (`emailStatus`,`emailClaimedAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `investorMaster` (
  `investorUid` char(36) NOT NULL,
  `userUid` char(36) NOT NULL,
  `firstName` varchar(50) DEFAULT NULL,
  `lastName` varchar(50) DEFAULT NULL,
  `dateOfBirth` date DEFAULT NULL,
  `gender` enum('male','female','other') DEFAULT NULL,
  `streetAddress` varchar(150) DEFAULT NULL,
  `countryUid` char(36) DEFAULT NULL,
  `stateUid` char(36) DEFAULT NULL,
  `cityUid` char(36) DEFAULT NULL,
  `sourceOfWealth` varchar(120) DEFAULT NULL,
  `estimatedNetWorth` varchar(60) DEFAULT NULL,
  `annualInvestmentCapacity` varchar(60) DEFAULT NULL,
  `yearsOfExperience` tinyint(3) unsigned DEFAULT NULL,
  `previousRwaExperience` enum('yes','no') DEFAULT NULL,
  `rwaExperienceDescription` varchar(600) DEFAULT NULL,
  `accreditationType` enum('individual','institutional','qualified_professional') DEFAULT NULL,
  `walletAddress` varchar(42) DEFAULT NULL,
  `onboardingChainUid` char(36) DEFAULT NULL,
  `registeredWalletAddress` varchar(42) GENERATED ALWAYS AS (case when `status` = 'submitted' and `walletAddress` is not null and trim(`walletAddress`) <> '' then lcase(trim(`walletAddress`)) else NULL end) STORED,
  `profileReference` varchar(60) DEFAULT NULL,
  `onchainIdReference` varchar(120) DEFAULT NULL,
  `contractAddress` varchar(42) DEFAULT NULL,
  `contractTxnHash` varchar(66) DEFAULT NULL,
  `contractTxnMessage` text DEFAULT NULL,
  `currentStep` enum('identityDetails','identityDocuments','compliance','completed') NOT NULL DEFAULT 'identityDetails',
  `isDraft` tinyint(1) NOT NULL DEFAULT 1,
  `status` enum('draft','submitted') NOT NULL DEFAULT 'draft',
  `submittedAt` datetime(3) DEFAULT NULL,
  `isActive` tinyint(1) NOT NULL DEFAULT 1,
  `isDeleted` tinyint(1) NOT NULL DEFAULT 0,
  `createdAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3),
  `updatedAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3) ON UPDATE current_timestamp(3),
  PRIMARY KEY (`investorUid`),
  UNIQUE KEY `ukInvestorMasterUserUid` (`userUid`),
  UNIQUE KEY `ukInvestorMasterProfileReference` (`profileReference`),
  UNIQUE KEY `ukInvestorMasterRegisteredWallet` (`registeredWalletAddress`),
  KEY `idxInvestorMasterStatus` (`status`,`isDraft`,`isActive`,`isDeleted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `issuerApiKey` (
  `issuerApiKeyUid` char(36) NOT NULL,
  `publicId` char(24) NOT NULL,
  `userUid` char(36) NOT NULL,
  `organizationUid` char(36) NOT NULL,
  `keyName` varchar(100) NOT NULL,
  `keyHash` char(64) NOT NULL,
  `keyPrefix` varchar(32) NOT NULL,
  `keyLastFour` char(4) NOT NULL,
  `scopes` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL CHECK (json_valid(`scopes`)),
  `expiresAt` datetime(3) NOT NULL,
  `lastUsedAt` datetime(3) DEFAULT NULL,
  `lastUsedIp` varchar(64) DEFAULT NULL,
  `revokedAt` datetime(3) DEFAULT NULL,
  `isActive` tinyint(1) NOT NULL DEFAULT 1,
  `isDeleted` tinyint(1) NOT NULL DEFAULT 0,
  `createdAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3),
  `updatedAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3) ON UPDATE current_timestamp(3),
  PRIMARY KEY (`issuerApiKeyUid`),
  UNIQUE KEY `ukIssuerApiKeyPublicId` (`publicId`),
  UNIQUE KEY `ukIssuerApiKeyHash` (`keyHash`),
  KEY `idxIssuerApiKeyOwner` (`userUid`,`organizationUid`,`isActive`,`expiresAt`),
  KEY `fkIssuerApiKeyOrganization` (`organizationUid`),
  CONSTRAINT `fkIssuerApiKeyOrganization` FOREIGN KEY (`organizationUid`) REFERENCES `organizationMaster` (`organizationUid`),
  CONSTRAINT `fkIssuerApiKeyUser` FOREIGN KEY (`userUid`) REFERENCES `userMaster` (`userUid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `issuerApiKeyAudit` (
  `issuerApiKeyAuditUid` char(36) NOT NULL,
  `issuerApiKeyUid` char(36) NOT NULL,
  `userUid` char(36) NOT NULL,
  `action` enum('CREATED','AUTHENTICATED','REVOKED','ROTATED','POLICY_UPDATED') NOT NULL,
  `httpMethod` varchar(10) DEFAULT NULL,
  `apiPath` varchar(255) DEFAULT NULL,
  `ipAddress` varchar(64) DEFAULT NULL,
  `userAgent` varchar(500) DEFAULT NULL,
  `requestId` varchar(100) DEFAULT NULL,
  `details` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`details`)),
  `createdAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3),
  PRIMARY KEY (`issuerApiKeyAuditUid`),
  KEY `idxIssuerApiKeyAuditKey` (`issuerApiKeyUid`,`createdAt`),
  KEY `idxIssuerApiKeyAuditUser` (`userUid`,`createdAt`),
  CONSTRAINT `fkIssuerApiKeyAuditKey` FOREIGN KEY (`issuerApiKeyUid`) REFERENCES `issuerApiKey` (`issuerApiKeyUid`),
  CONSTRAINT `fkIssuerApiKeyAuditUser` FOREIGN KEY (`userUid`) REFERENCES `userMaster` (`userUid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `issuerApiKeyPolicy` (
  `issuerApiKeyUid` char(36) NOT NULL,
  `threshold` decimal(5,2) DEFAULT NULL,
  `maxCumulative24hPercent` decimal(5,2) DEFAULT NULL,
  `cooldownSeconds` int(10) unsigned DEFAULT NULL,
  `frequency` enum('hourly','daily','weekly','monthly') DEFAULT NULL,
  `allowedDays` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`allowedDays`)),
  `startTime` char(5) DEFAULT NULL,
  `endTime` char(5) DEFAULT NULL,
  `timezone` varchar(100) NOT NULL DEFAULT 'UTC',
  `allowedIps` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL CHECK (json_valid(`allowedIps`)),
  `createdAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3),
  `updatedAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3),
  PRIMARY KEY (`issuerApiKeyUid`),
  CONSTRAINT `fkApiKeyPolicyKey` FOREIGN KEY (`issuerApiKeyUid`) REFERENCES `issuerApiKey` (`issuerApiKeyUid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `issuerClaimSignature` (
  `signatureUid` char(36) NOT NULL,
  `verificationUid` char(36) NOT NULL,
  `interestUid` char(36) NOT NULL,
  `claimTopic` int(11) NOT NULL,
  `data` text DEFAULT NULL,
  `signature` text DEFAULT NULL,
  `signedByWallet` varchar(42) DEFAULT NULL,
  `status` enum('PENDING','VERIFICATION_FAILED','NETWORK_ERROR','SIGNED') NOT NULL DEFAULT 'PENDING',
  `verificationError` text DEFAULT NULL,
  `verifiedAt` datetime(3) DEFAULT NULL,
  `isActive` tinyint(1) NOT NULL DEFAULT 1,
  `isDeleted` tinyint(1) NOT NULL DEFAULT 0,
  `createdAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3),
  `updatedAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3) ON UPDATE current_timestamp(3),
  PRIMARY KEY (`signatureUid`),
  UNIQUE KEY `ukIssuerClaimSignatureTopic` (`verificationUid`,`claimTopic`),
  KEY `idxIssuerClaimSignatureVerification` (`verificationUid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `issuerClaimVerification` (
  `verificationUid` char(36) NOT NULL,
  `interestUid` char(36) NOT NULL,
  `tokenUid` char(36) NOT NULL,
  `organizationUid` char(36) NOT NULL,
  `investorUid` char(36) NOT NULL,
  `status` enum('PENDING','VERIFICATION_FAILED','NETWORK_ERROR','SIGNED') NOT NULL DEFAULT 'PENDING',
  `requiredClaimCount` int(11) NOT NULL,
  `verifiedClaimCount` int(11) NOT NULL DEFAULT 0,
  `requiredClaimTopics` varchar(255) DEFAULT NULL,
  `attemptNumber` int(11) NOT NULL,
  `completedAt` datetime(3) DEFAULT NULL,
  `isActive` tinyint(1) NOT NULL DEFAULT 1,
  `isDeleted` tinyint(1) NOT NULL DEFAULT 0,
  `createdAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3),
  `updatedAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3) ON UPDATE current_timestamp(3),
  PRIMARY KEY (`verificationUid`),
  UNIQUE KEY `ukIssuerClaimVerificationAttempt` (`interestUid`,`attemptNumber`),
  KEY `idxIssuerClaimVerificationInterest` (`interestUid`,`status`,`isDeleted`),
  KEY `idxIssuerClaimVerificationOrg` (`organizationUid`,`status`,`isDeleted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `menuMaster` (
  `menuUid` char(36) NOT NULL,
  `parentMenuUid` char(36) DEFAULT NULL,
  `menuName` varchar(100) NOT NULL,
  `menuCode` varchar(80) NOT NULL,
  `routePath` varchar(255) DEFAULT NULL,
  `icon` varchar(100) DEFAULT NULL,
  `displayOrder` int(10) unsigned NOT NULL DEFAULT 0,
  `isVisible` tinyint(1) NOT NULL DEFAULT 1,
  `isActive` tinyint(1) NOT NULL DEFAULT 1,
  `isDeleted` tinyint(1) NOT NULL DEFAULT 0,
  `createdAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3),
  `updatedAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3) ON UPDATE current_timestamp(3),
  PRIMARY KEY (`menuUid`),
  UNIQUE KEY `ukMenuMasterMenuCode` (`menuCode`),
  KEY `idxMenuMasterParentMenuUid` (`parentMenuUid`),
  KEY `idxMenuMasterOrder` (`displayOrder`,`isActive`,`isDeleted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `organizationBeneficialOwner` (
  `beneficialOwnerUid` char(36) NOT NULL,
  `organizationUid` char(36) NOT NULL,
  `fullName` varchar(120) DEFAULT NULL,
  `dateOfBirth` date DEFAULT NULL,
  `nationalityCountryUid` char(36) DEFAULT NULL,
  `ownershipPercentage` decimal(5,2) DEFAULT NULL,
  `isPrimary` tinyint(1) NOT NULL DEFAULT 0,
  `isActive` tinyint(1) NOT NULL DEFAULT 1,
  `isDeleted` tinyint(1) NOT NULL DEFAULT 0,
  `createdAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3),
  `updatedAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3) ON UPDATE current_timestamp(3),
  PRIMARY KEY (`beneficialOwnerUid`),
  KEY `idxOrganizationBeneficialOwnerOrganization` (`organizationUid`,`isActive`,`isDeleted`),
  KEY `idxOrganizationBeneficialOwnerNationality` (`nationalityCountryUid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `organizationDocument` (
  `documentUid` char(36) NOT NULL,
  `organizationUid` char(36) NOT NULL,
  `documentTypeUid` char(36) NOT NULL,
  `originalFileName` varchar(255) NOT NULL,
  `storedFileName` varchar(255) NOT NULL,
  `storageKey` varchar(500) NOT NULL,
  `mimeType` varchar(100) NOT NULL,
  `fileSize` bigint(20) unsigned NOT NULL,
  `checksumSha256` char(64) NOT NULL,
  `isActive` tinyint(1) NOT NULL DEFAULT 1,
  `isDeleted` tinyint(1) NOT NULL DEFAULT 0,
  `createdAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3),
  `updatedAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3) ON UPDATE current_timestamp(3),
  PRIMARY KEY (`documentUid`),
  UNIQUE KEY `ukOrganizationDocumentStorageKey` (`storageKey`),
  KEY `idxOrganizationDocumentOrganization` (`organizationUid`,`documentTypeUid`,`isActive`,`isDeleted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `organizationMaster` (
  `organizationUid` char(36) NOT NULL,
  `userUid` char(36) NOT NULL,
  `legalCompanyName` varchar(200) DEFAULT NULL,
  `entityTypeUid` char(36) DEFAULT NULL,
  `registrationNumber` varchar(100) DEFAULT NULL,
  `streetAddress` varchar(255) DEFAULT NULL,
  `countryUid` char(36) DEFAULT NULL,
  `stateUid` char(36) DEFAULT NULL,
  `cityUid` char(36) DEFAULT NULL,
  `postalCode` varchar(20) DEFAULT NULL,
  `countryOfIncorporationUid` char(36) DEFAULT NULL,
  `dateOfIncorporation` date DEFAULT NULL,
  `taxIdentificationNumber` varchar(100) DEFAULT NULL,
  `industryUid` char(36) DEFAULT NULL,
  `businessActivity` text DEFAULT NULL,
  `website` varchar(500) DEFAULT NULL,
  `walletAddress` varchar(42) DEFAULT NULL,
  `serviceWalletAddress` varchar(42) DEFAULT NULL,
  `onboardingChainUid` char(36) DEFAULT NULL,
  `registeredWalletAddress` varchar(42) GENERATED ALWAYS AS (case when `walletAddress` is not null and trim(`walletAddress`) <> '' and `isDeleted` = 0 then lcase(trim(`walletAddress`)) else NULL end) STORED,
  `contractAddress` varchar(42) DEFAULT NULL,
  `contractTxnHash` varchar(66) DEFAULT NULL,
  `contractTxnMessage` text DEFAULT NULL,
  `currentStep` enum('companyInformation','jurisdiction','beneficialOwners','documents','completed') NOT NULL DEFAULT 'companyInformation',
  `isDraft` tinyint(1) NOT NULL DEFAULT 1,
  `status` enum('draft','submitted','resubmitted','underReview','approved','rejected') NOT NULL DEFAULT 'draft',
  `isUserNotified` tinyint(1) NOT NULL DEFAULT 0,
  `submittedAt` datetime(3) DEFAULT NULL,
  `isActive` tinyint(1) NOT NULL DEFAULT 1,
  `isDeleted` tinyint(1) NOT NULL DEFAULT 0,
  `createdAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3),
  `updatedAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3) ON UPDATE current_timestamp(3),
  `rejectionReason` text DEFAULT NULL,
  `rejectionCount` tinyint(3) unsigned NOT NULL DEFAULT 0,
  `canResubmit` tinyint(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`organizationUid`),
  UNIQUE KEY `ukOrganizationMasterUserUid` (`userUid`),
  UNIQUE KEY `ukOrganizationRegistration` (`countryOfIncorporationUid`,`registrationNumber`),
  UNIQUE KEY `ukOrganizationMasterRegisteredWallet` (`registeredWalletAddress`),
  KEY `idxOrganizationMasterStatus` (`status`,`isDraft`,`isActive`,`isDeleted`),
  KEY `idxOrganizationMasterLocation` (`countryUid`,`stateUid`,`cityUid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `organizationServiceWallet` (
  `organizationServiceWalletUid` char(36) NOT NULL,
  `organizationUid` char(36) NOT NULL,
  `chainUid` char(36) NOT NULL,
  `chainId` bigint(20) unsigned NOT NULL,
  `controllerAddress` varchar(42) NOT NULL,
  `mainWalletAddress` varchar(42) NOT NULL,
  `serviceWalletAddress` varchar(42) DEFAULT NULL,
  `sourceTxHash` varchar(66) DEFAULT NULL,
  `sourceBlockNumber` bigint(20) unsigned DEFAULT NULL,
  `sourceBlockHash` varchar(66) DEFAULT NULL,
  `sourceLogIndex` int(10) unsigned DEFAULT NULL,
  `verifiedAt` datetime(3) DEFAULT NULL,
  `isActive` tinyint(1) NOT NULL DEFAULT 1,
  `isDeleted` tinyint(1) NOT NULL DEFAULT 0,
  `createdAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3),
  `updatedAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3) ON UPDATE current_timestamp(3),
  PRIMARY KEY (`organizationServiceWalletUid`),
  UNIQUE KEY `ukOrganizationServiceWalletChain` (`organizationUid`,`chainUid`),
  UNIQUE KEY `ukOrganizationServiceWalletEvent` (`chainId`,`sourceTxHash`,`sourceLogIndex`),
  KEY `idxOrganizationServiceWalletLookup` (`chainId`,`mainWalletAddress`,`isDeleted`),
  KEY `fkOrganizationServiceWalletChain` (`chainUid`),
  CONSTRAINT `fkOrganizationServiceWalletChain` FOREIGN KEY (`chainUid`) REFERENCES `chainMaster` (`chainUid`),
  CONSTRAINT `fkOrganizationServiceWalletOrganization` FOREIGN KEY (`organizationUid`) REFERENCES `organizationMaster` (`organizationUid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `paymentTokenMaster` (
  `paymentTokenUid` char(36) NOT NULL,
  `chainUid` char(36) NOT NULL,
  `paymentTokenCode` varchar(50) NOT NULL,
  `paymentTokenName` varchar(80) NOT NULL,
  `paymentTokenSymbol` varchar(20) NOT NULL,
  `contractAddress` varchar(42) NOT NULL,
  `decimals` tinyint(3) unsigned NOT NULL,
  `chainId` bigint(20) unsigned NOT NULL,
  `networkName` varchar(80) NOT NULL,
  `explorerUrl` varchar(500) DEFAULT NULL,
  `imageOriginalFileName` varchar(255) DEFAULT NULL,
  `imageStorageKey` varchar(255) DEFAULT NULL,
  `imageMimeType` varchar(50) DEFAULT NULL,
  `imageFileSize` int(10) unsigned DEFAULT NULL,
  `imageWidth` smallint(5) unsigned DEFAULT NULL,
  `imageHeight` smallint(5) unsigned DEFAULT NULL,
  `imageChecksumSha256` char(64) DEFAULT NULL,
  `imageVirusScanStatus` enum('notConfigured','clean') DEFAULT NULL,
  `supportsPurchase` tinyint(1) NOT NULL DEFAULT 1,
  `supportsRedemption` tinyint(1) NOT NULL DEFAULT 1,
  `isDefault` tinyint(1) NOT NULL DEFAULT 0,
  `displayOrder` int(10) unsigned NOT NULL DEFAULT 0,
  `isActive` tinyint(1) NOT NULL DEFAULT 1,
  `isDeleted` tinyint(1) NOT NULL DEFAULT 0,
  `createdAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3),
  `updatedAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3) ON UPDATE current_timestamp(3),
  `defaultChainUid` char(36) GENERATED ALWAYS AS (case when `isDefault` = 1 and `isActive` = 1 and `isDeleted` = 0 then `chainUid` else NULL end) STORED,
  PRIMARY KEY (`paymentTokenUid`),
  UNIQUE KEY `ukPaymentTokenChainAddress` (`chainId`,`contractAddress`),
  UNIQUE KEY `ukPaymentTokenChainCode` (`chainUid`,`paymentTokenCode`),
  UNIQUE KEY `ukPaymentTokenDefaultPerChain` (`defaultChainUid`),
  KEY `idxPaymentTokenActive` (`chainId`,`isActive`,`isDeleted`,`displayOrder`),
  KEY `idxPaymentTokenActions` (`chainId`,`supportsPurchase`,`supportsRedemption`,`isActive`,`isDeleted`),
  KEY `idxPaymentTokenChainUid` (`chainUid`,`isActive`,`isDeleted`,`displayOrder`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `permissionMaster` (
  `permissionUid` char(36) NOT NULL,
  `roleUid` char(36) NOT NULL,
  `menuUid` char(36) DEFAULT NULL,
  `permissionName` varchar(120) NOT NULL,
  `permissionCode` varchar(120) NOT NULL,
  `httpMethod` enum('GET','POST','PUT','PATCH','DELETE') NOT NULL,
  `apiPath` varchar(255) NOT NULL,
  `isAllowed` tinyint(1) NOT NULL DEFAULT 1,
  `isActive` tinyint(1) NOT NULL DEFAULT 1,
  `isDeleted` tinyint(1) NOT NULL DEFAULT 0,
  `createdAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3),
  `updatedAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3) ON UPDATE current_timestamp(3),
  PRIMARY KEY (`permissionUid`),
  UNIQUE KEY `ukPermissionMasterApi` (`roleUid`,`httpMethod`,`apiPath`),
  UNIQUE KEY `ukPermissionMasterCode` (`roleUid`,`permissionCode`),
  KEY `idxPermissionMasterMenuUid` (`menuUid`),
  KEY `idxPermissionMasterLookup` (`roleUid`,`isAllowed`,`isActive`,`isDeleted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `stateMaster` (
  `stateUid` char(36) NOT NULL,
  `countryUid` char(36) NOT NULL,
  `stateCode` varchar(20) NOT NULL,
  `stateName` varchar(120) NOT NULL,
  `isActive` tinyint(1) NOT NULL DEFAULT 1,
  `isDeleted` tinyint(1) NOT NULL DEFAULT 0,
  `createdAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3),
  `updatedAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3) ON UPDATE current_timestamp(3),
  PRIMARY KEY (`stateUid`),
  UNIQUE KEY `ukStateMasterCode` (`countryUid`,`stateCode`),
  KEY `idxStateMasterCountryName` (`countryUid`,`stateName`,`isActive`,`isDeleted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `tokenClaimTopic` (
  `tokenClaimTopicUid` char(36) NOT NULL,
  `tokenUid` char(36) NOT NULL,
  `claimTopicUid` char(36) NOT NULL,
  `claimTopicValue` int(10) unsigned NOT NULL,
  `isActive` tinyint(1) NOT NULL DEFAULT 1,
  `isDeleted` tinyint(1) NOT NULL DEFAULT 0,
  `createdAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3),
  `updatedAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3) ON UPDATE current_timestamp(3),
  PRIMARY KEY (`tokenClaimTopicUid`),
  UNIQUE KEY `ukTokenClaimTopicSelection` (`tokenUid`,`claimTopicUid`),
  KEY `idxTokenClaimTopicValue` (`tokenUid`,`claimTopicValue`,`isActive`,`isDeleted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `tokenCountryRestriction` (
  `tokenCountryRestrictionUid` char(36) NOT NULL,
  `tokenUid` char(36) NOT NULL,
  `countryUid` char(36) NOT NULL,
  `iso3166NumericCode` char(3) NOT NULL,
  `isActive` tinyint(1) NOT NULL DEFAULT 1,
  `isDeleted` tinyint(1) NOT NULL DEFAULT 0,
  `createdAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3),
  `updatedAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3) ON UPDATE current_timestamp(3),
  PRIMARY KEY (`tokenCountryRestrictionUid`),
  UNIQUE KEY `ukTokenCountryRestrictionSelection` (`tokenUid`,`countryUid`),
  KEY `idxTokenCountryRestrictionCode` (`tokenUid`,`iso3166NumericCode`,`isActive`,`isDeleted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `tokenDeploymentAttempt` (
  `deploymentAttemptUid` char(36) NOT NULL,
  `tokenUid` char(36) NOT NULL,
  `organizationUid` char(36) NOT NULL,
  `userUid` char(36) NOT NULL,
  `chainUid` char(36) NOT NULL,
  `walletAddress` varchar(42) NOT NULL,
  `chainId` int(10) unsigned NOT NULL,
  `networkName` varchar(50) DEFAULT NULL,
  `status` enum('pending','submitted','confirming','confirmed','failed','wallet_rejected','cancelled','expired') NOT NULL DEFAULT 'pending',
  `idempotencyKey` varchar(100) NOT NULL,
  `transactionHash` varchar(66) DEFAULT NULL,
  `contractAddress` varchar(42) DEFAULT NULL,
  `blockNumber` bigint(20) unsigned DEFAULT NULL,
  `errorCode` varchar(80) DEFAULT NULL,
  `errorMessage` text DEFAULT NULL,
  `metadata` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`metadata`)),
  `expiresAt` datetime(3) DEFAULT NULL,
  `submittedAt` datetime(3) DEFAULT NULL,
  `confirmedAt` datetime(3) DEFAULT NULL,
  `failedAt` datetime(3) DEFAULT NULL,
  `isActive` tinyint(1) NOT NULL DEFAULT 1,
  `isDeleted` tinyint(1) NOT NULL DEFAULT 0,
  `createdAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3),
  `updatedAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3) ON UPDATE current_timestamp(3),
  PRIMARY KEY (`deploymentAttemptUid`),
  UNIQUE KEY `ukTokenDeploymentAttemptIdempotency` (`tokenUid`,`idempotencyKey`),
  UNIQUE KEY `ukTokenDeploymentAttemptChainTxHash` (`chainUid`,`transactionHash`),
  KEY `idxTokenDeploymentAttemptToken` (`tokenUid`,`status`,`isDeleted`),
  KEY `idxTokenDeploymentAttemptOrganization` (`organizationUid`),
  KEY `idxTokenDeploymentAttemptUser` (`userUid`),
  KEY `idxTokenDeploymentAttemptStatus` (`status`,`expiresAt`),
  KEY `idxTokenDeploymentAttemptExpiry` (`expiresAt`),
  KEY `idxTokenDeploymentAttemptChain` (`chainUid`,`status`,`isDeleted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `tokenInvestmentInterest` (
  `interestUid` char(36) NOT NULL,
  `tokenUid` char(36) NOT NULL,
  `organizationUid` char(36) NOT NULL,
  `investorUid` char(36) NOT NULL,
  `investorUserUid` char(36) NOT NULL,
  `walletAddress` varchar(42) DEFAULT NULL,
  `status` enum('pending','submitIntrest','verifiedByIssuer','claimSubmitted','registered','approved','rejected','cancelled') NOT NULL DEFAULT 'pending',
  `note` varchar(500) DEFAULT NULL,
  `rejectReasonType` varchar(40) DEFAULT NULL,
  `rejectReason` varchar(1000) DEFAULT NULL,
  `rejectedClaim` varchar(500) DEFAULT NULL,
  `rejectedCount` int(11) NOT NULL DEFAULT 3,
  `canResubmitClaim` int(11) NOT NULL DEFAULT 0,
  `submittedAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3),
  `decisionAt` datetime(3) DEFAULT NULL,
  `isActive` tinyint(1) NOT NULL DEFAULT 1,
  `isDeleted` tinyint(1) NOT NULL DEFAULT 0,
  `createdAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3),
  `updatedAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3) ON UPDATE current_timestamp(3),
  PRIMARY KEY (`interestUid`),
  UNIQUE KEY `ukTokenInvestmentInterest` (`tokenUid`,`investorUid`),
  KEY `idxTokenInvestmentInterestOrg` (`organizationUid`,`status`,`isDeleted`),
  KEY `idxTokenInvestmentInterestToken` (`tokenUid`,`status`,`isDeleted`),
  KEY `idxTokenInvestmentInterestInvestor` (`investorUid`,`isDeleted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `tokenInvestmentInterestHistory` (
  `historyUid` char(36) NOT NULL,
  `interestUid` char(36) NOT NULL,
  `tokenUid` char(36) NOT NULL,
  `organizationUid` char(36) NOT NULL,
  `investorUid` char(36) NOT NULL,
  `eventType` enum('submitted','rejected','resubmitted','approved','verifiedByIssuer','claimSubmitted','registered') NOT NULL,
  `rejectReasonType` varchar(40) DEFAULT NULL,
  `rejectReason` varchar(1000) DEFAULT NULL,
  `rejectedClaim` varchar(500) DEFAULT NULL,
  `resubmitAttempt` int(11) DEFAULT NULL,
  `actorRole` enum('investor','issuer','system') NOT NULL DEFAULT 'system',
  `actorUserUid` char(36) DEFAULT NULL,
  `note` varchar(1000) DEFAULT NULL,
  `isActive` tinyint(1) NOT NULL DEFAULT 1,
  `isDeleted` tinyint(1) NOT NULL DEFAULT 0,
  `createdAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3),
  `updatedAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3) ON UPDATE current_timestamp(3),
  PRIMARY KEY (`historyUid`),
  KEY `idxInterestHistoryInterest` (`interestUid`,`createdAt`),
  KEY `idxInterestHistoryOrg` (`organizationUid`,`eventType`,`isDeleted`),
  KEY `idxInterestHistoryInvestor` (`investorUid`,`isDeleted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `tokenMaster` (
  `tokenUid` char(36) NOT NULL,
  `organizationUid` char(36) NOT NULL,
  `userUid` char(36) NOT NULL,
  `chainUid` char(36) NOT NULL,
  `tokenName` varchar(50) DEFAULT NULL,
  `tokenSymbol` varchar(10) DEFAULT NULL,
  `decimals` tinyint(3) unsigned DEFAULT NULL,
  `initialTokenPrice` decimal(36,18) DEFAULT NULL,
  `currentTokenPrice` decimal(36,18) DEFAULT NULL,
  `treasuryWalletAddress` varchar(42) DEFAULT NULL,
  `paymentTokenAddress` varchar(42) DEFAULT NULL,
  `tokenDescription` varchar(2000) DEFAULT NULL,
  `imageOriginalFileName` varchar(255) DEFAULT NULL,
  `imageStorageKey` varchar(255) DEFAULT NULL,
  `imageMimeType` varchar(50) DEFAULT NULL,
  `imageFileSize` int(10) unsigned DEFAULT NULL,
  `imageWidth` smallint(5) unsigned DEFAULT NULL,
  `imageHeight` smallint(5) unsigned DEFAULT NULL,
  `imageChecksumSha256` char(64) DEFAULT NULL,
  `imageVirusScanStatus` enum('notConfigured','clean') NOT NULL DEFAULT 'notConfigured',
  `trustedClaimIssuerWalletAddress` varchar(42) DEFAULT NULL,
  `maxInvestors` int(10) unsigned DEFAULT NULL,
  `maxBalancePerInvestor` decimal(36,18) DEFAULT NULL,
  `countryRestrictionMode` enum('allowlist','blocklist') DEFAULT NULL,
  `tokenAgentWalletAddress` varchar(42) DEFAULT NULL,
  `identityManagerWalletAddress` varchar(42) DEFAULT NULL,
  `platformAgentWallet` varchar(42) DEFAULT NULL,
  `tokenAddress` varchar(42) DEFAULT NULL,
  `identityRegistryAddress` varchar(42) DEFAULT NULL,
  `identityRegistryStorageAddress` varchar(42) DEFAULT NULL,
  `trustedIssuersRegistryAddress` varchar(42) DEFAULT NULL,
  `claimTopicsRegistryAddress` varchar(42) DEFAULT NULL,
  `modularComplianceAddress` varchar(42) DEFAULT NULL,
  `deployTxHash` varchar(66) DEFAULT NULL,
  `deploymentSalt` varchar(66) DEFAULT NULL,
  `deployedAtBlock` bigint(20) unsigned DEFAULT NULL,
  `currentStep` enum('tokenInformation','claims','compliance','governance','review','deployed') NOT NULL DEFAULT 'tokenInformation',
  `isDraft` tinyint(1) NOT NULL DEFAULT 1,
  `status` enum('draft','readyToDeploy','deploymentPending','deployed','deploymentFailed') NOT NULL DEFAULT 'draft',
  `contractAddress` varchar(42) DEFAULT NULL,
  `contractTxnHash` varchar(66) DEFAULT NULL,
  `contractTxnMessage` text DEFAULT NULL,
  `deployedAt` datetime(3) DEFAULT NULL,
  `isActive` tinyint(1) NOT NULL DEFAULT 1,
  `isDeleted` tinyint(1) NOT NULL DEFAULT 0,
  `createdAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3),
  `updatedAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3) ON UPDATE current_timestamp(3),
  PRIMARY KEY (`tokenUid`),
  UNIQUE KEY `ukTokenMasterOrganizationUid` (`organizationUid`),
  UNIQUE KEY `ukTokenMasterChainSymbol` (`chainUid`,`tokenSymbol`),
  UNIQUE KEY `ukTokenMasterChainAddress` (`chainUid`,`tokenAddress`),
  UNIQUE KEY `ukTokenMasterChainDeployTxHash` (`chainUid`,`deployTxHash`),
  KEY `idxTokenMasterUserUid` (`userUid`),
  KEY `idxTokenMasterStatus` (`status`,`isActive`,`isDeleted`),
  KEY `idxTokenPaymentToken` (`paymentTokenAddress`,`status`,`isDeleted`),
  KEY `idxTokenMasterChain` (`chainUid`,`status`,`isActive`,`isDeleted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `tokenPriceApiRequest` (
  `requestUid` char(36) NOT NULL,
  `userUid` char(36) NOT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3),
  PRIMARY KEY (`requestUid`),
  KEY `idxTokenPriceApiRequestUserTime` (`userUid`,`createdAt`),
  CONSTRAINT `fkTokenPriceApiRequestUser` FOREIGN KEY (`userUid`) REFERENCES `userMaster` (`userUid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `tokenPriceUpdate` (
  `priceUpdateUid` char(36) NOT NULL,
  `chainUid` char(36) NOT NULL,
  `chainId` bigint(20) unsigned NOT NULL,
  `tokenUid` char(36) NOT NULL,
  `organizationUid` char(36) NOT NULL,
  `issuerUserUid` char(36) DEFAULT NULL,
  `controllerAddress` varchar(42) DEFAULT NULL,
  `tokenAddress` varchar(42) NOT NULL,
  `issuerWalletAddress` varchar(42) NOT NULL,
  `serviceWalletAddress` varchar(42) DEFAULT NULL,
  `submissionMode` enum('RELAYED','DIRECT','INDEXED','LEGACY') NOT NULL DEFAULT 'RELAYED',
  `priceDecimals` tinyint(3) unsigned DEFAULT 6,
  `oldPriceRaw` varchar(78) DEFAULT NULL,
  `newPriceRaw` varchar(78) DEFAULT NULL,
  `newPriceFormatted` decimal(65,18) NOT NULL,
  `signerNonce` varchar(78) DEFAULT NULL,
  `signatureDeadline` bigint(20) unsigned DEFAULT NULL,
  `signatureV` tinyint(3) unsigned DEFAULT NULL,
  `signatureR` varchar(66) DEFAULT NULL,
  `signatureS` varchar(66) DEFAULT NULL,
  `status` enum('PENDING','SUBMITTED','CONFIRMED','FAILED','ORPHANED','APPLIED','CANCELLED','EXPIRED') NOT NULL DEFAULT 'PENDING',
  `transactionHash` varchar(66) DEFAULT NULL,
  `blockNumber` bigint(20) unsigned DEFAULT NULL,
  `blockHash` varchar(66) DEFAULT NULL,
  `transactionIndex` int(10) unsigned DEFAULT NULL,
  `logIndex` int(10) unsigned DEFAULT NULL,
  `gasUsed` varchar(78) DEFAULT NULL,
  `effectiveGasPrice` varchar(78) DEFAULT NULL,
  `submittedAt` datetime(3) DEFAULT NULL,
  `confirmedAt` datetime(3) DEFAULT NULL,
  `errorCode` varchar(100) DEFAULT NULL,
  `errorMessage` varchar(2000) DEFAULT NULL,
  `isCanonical` tinyint(1) NOT NULL DEFAULT 1,
  `isActive` tinyint(1) NOT NULL DEFAULT 1,
  `isDeleted` tinyint(1) NOT NULL DEFAULT 0,
  `createdAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3),
  `updatedAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3) ON UPDATE current_timestamp(3),
  `oldPriceFormatted` decimal(65,18) DEFAULT NULL,
  `isLegacyUpdate` tinyint(1) GENERATED ALWAYS AS (`submissionMode` = 'LEGACY') STORED,
  `isOnchainUpdate` tinyint(1) GENERATED ALWAYS AS (`submissionMode` <> 'LEGACY') STORED,
  `directTransactionNonce` bigint(20) unsigned DEFAULT NULL,
  `preparedAtBlock` bigint(20) unsigned DEFAULT NULL,
  `updateType` varchar(20) GENERATED ALWAYS AS (case when `submissionMode` = 'RELAYED' or `serviceWalletAddress` is not null then 'Automated (bot)' else 'Manual' end) STORED,
  PRIMARY KEY (`priceUpdateUid`),
  UNIQUE KEY `ukTokenPriceUpdateSignerNonce` (`chainId`,`serviceWalletAddress`,`signerNonce`),
  UNIQUE KEY `ukTokenPriceUpdateTransaction` (`chainId`,`transactionHash`),
  UNIQUE KEY `ukTokenPriceUpdateEvent` (`chainId`,`transactionHash`,`logIndex`),
  KEY `idxTokenPriceUpdateToken` (`tokenUid`,`status`,`createdAt`),
  KEY `idxTokenPriceUpdateRateLimit` (`chainId`,`serviceWalletAddress`,`createdAt`),
  KEY `fkTokenPriceUpdateOrganization` (`organizationUid`),
  KEY `fkTokenPriceUpdateChain` (`chainUid`),
  CONSTRAINT `fkTokenPriceUpdateChain` FOREIGN KEY (`chainUid`) REFERENCES `chainMaster` (`chainUid`),
  CONSTRAINT `fkTokenPriceUpdateOrganization` FOREIGN KEY (`organizationUid`) REFERENCES `organizationMaster` (`organizationUid`),
  CONSTRAINT `fkTokenPriceUpdateToken` FOREIGN KEY (`tokenUid`) REFERENCES `tokenMaster` (`tokenUid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `tokenPurchase` (
  `purchaseUid` char(36) NOT NULL,
  `interestUid` char(36) NOT NULL,
  `tokenUid` char(36) NOT NULL,
  `organizationUid` char(36) NOT NULL,
  `investorUid` char(36) NOT NULL,
  `investorUserUid` char(36) NOT NULL,
  `idempotencyKey` varchar(100) NOT NULL,
  `chainId` bigint(20) unsigned NOT NULL,
  `usdtContractAddress` varchar(42) NOT NULL,
  `tokenAddress` varchar(42) NOT NULL,
  `investorWalletAddress` varchar(42) NOT NULL,
  `treasuryWalletAddress` varchar(42) NOT NULL,
  `platformWalletAddress` varchar(42) NOT NULL,
  `usdtDecimals` tinyint(3) unsigned NOT NULL,
  `tokenDecimals` tinyint(3) unsigned NOT NULL,
  `tokenPrice` decimal(65,18) NOT NULL,
  `tokenAmount` decimal(65,18) NOT NULL,
  `tokenAmountRaw` varchar(78) NOT NULL,
  `usdtAmount` decimal(65,18) NOT NULL,
  `usdtAmountRaw` varchar(78) NOT NULL,
  `balanceBeforeRaw` varchar(78) NOT NULL,
  `status` enum('PENDING_PAYMENT','PAYMENT_CONFIRMED','MINT_SUBMITTED','COMPLETED','EXPIRED') NOT NULL DEFAULT 'PENDING_PAYMENT',
  `activeInterestUid` char(36) GENERATED ALWAYS AS (case when `status` in ('PENDING_PAYMENT','PAYMENT_CONFIRMED','MINT_SUBMITTED') then `interestUid` else NULL end) STORED,
  `activeInvestorUid` char(36) GENERATED ALWAYS AS (case when `status` in ('PENDING_PAYMENT','PAYMENT_CONFIRMED','MINT_SUBMITTED') then `investorUid` else NULL end) STORED,
  `expiresAt` datetime(3) NOT NULL,
  `expiredAt` datetime(3) DEFAULT NULL,
  `expirationReason` varchar(100) DEFAULT NULL,
  `paymentTxHash` varchar(66) DEFAULT NULL,
  `paymentTxReceivedAt` datetime(3) DEFAULT NULL,
  `paymentBlockNumber` bigint(20) unsigned DEFAULT NULL,
  `paymentBlockHash` varchar(66) DEFAULT NULL,
  `paymentTransactionIndex` int(10) unsigned DEFAULT NULL,
  `paymentLogIndex` int(10) unsigned DEFAULT NULL,
  `paymentGasUsed` varchar(78) DEFAULT NULL,
  `paymentEffectiveGasPrice` varchar(78) DEFAULT NULL,
  `paymentVerifiedAt` datetime(3) DEFAULT NULL,
  `mintStatus` enum('NOT_STARTED','QUEUED','PROCESSING','SUBMITTED','CONFIRMED','FAILED') NOT NULL DEFAULT 'NOT_STARTED',
  `mintPreparedAtBlock` bigint(20) unsigned DEFAULT NULL,
  `mintTxHash` varchar(66) DEFAULT NULL,
  `mintSubmittedAt` datetime(3) DEFAULT NULL,
  `mintBlockNumber` bigint(20) unsigned DEFAULT NULL,
  `mintBlockHash` varchar(66) DEFAULT NULL,
  `mintTransactionIndex` int(10) unsigned DEFAULT NULL,
  `mintLogIndex` int(10) unsigned DEFAULT NULL,
  `mintGasUsed` varchar(78) DEFAULT NULL,
  `mintEffectiveGasPrice` varchar(78) DEFAULT NULL,
  `mintConfirmedAt` datetime(3) DEFAULT NULL,
  `preparedAtBlock` bigint(20) unsigned NOT NULL,
  `lastPaymentScannedBlock` bigint(20) unsigned DEFAULT NULL,
  `lastMintScannedBlock` bigint(20) unsigned DEFAULT NULL,
  `errorStage` enum('PAYMENT','MINT') DEFAULT NULL,
  `errorCode` varchar(100) DEFAULT NULL,
  `errorMessage` varchar(2000) DEFAULT NULL,
  `syncStatus` enum('IDLE','QUEUED','PROCESSING','FAILED') NOT NULL DEFAULT 'IDLE',
  `syncRequestedAt` datetime(3) DEFAULT NULL,
  `syncStartedAt` datetime(3) DEFAULT NULL,
  `syncCompletedAt` datetime(3) DEFAULT NULL,
  `syncAttempts` int(10) unsigned NOT NULL DEFAULT 0,
  `nextSyncAt` datetime(3) DEFAULT NULL,
  `isActive` tinyint(1) NOT NULL DEFAULT 1,
  `isDeleted` tinyint(1) NOT NULL DEFAULT 0,
  `createdAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3),
  `updatedAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3) ON UPDATE current_timestamp(3),
  PRIMARY KEY (`purchaseUid`),
  UNIQUE KEY `ukTokenPurchaseIdempotency` (`investorUserUid`,`idempotencyKey`),
  UNIQUE KEY `ukTokenPurchaseActiveInterest` (`activeInterestUid`),
  UNIQUE KEY `ukTokenPurchaseActiveInvestor` (`activeInvestorUid`),
  UNIQUE KEY `ukTokenPurchasePaymentTxHash` (`paymentTxHash`),
  UNIQUE KEY `ukTokenPurchaseMintTxHash` (`mintTxHash`),
  KEY `idxTokenPurchaseRecovery` (`status`,`syncStatus`,`nextSyncAt`,`isDeleted`,`createdAt`),
  KEY `idxTokenPurchaseInvestor` (`investorUserUid`,`createdAt`),
  KEY `idxTokenPurchaseMatch` (`chainId`,`usdtContractAddress`,`investorWalletAddress`,`treasuryWalletAddress`,`status`),
  KEY `idxTokenPurchaseExpiration` (`status`,`paymentTxHash`,`expiresAt`,`isDeleted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `tokenPurchasePaymentEvent` (
  `paymentEventUid` char(36) NOT NULL,
  `chainId` bigint(20) unsigned NOT NULL,
  `usdtContractAddress` varchar(42) NOT NULL,
  `fromWalletAddress` varchar(42) NOT NULL,
  `toWalletAddress` varchar(42) NOT NULL,
  `amountRaw` varchar(78) NOT NULL,
  `txHash` varchar(66) NOT NULL,
  `blockNumber` bigint(20) unsigned NOT NULL,
  `blockHash` varchar(66) DEFAULT NULL,
  `transactionIndex` int(10) unsigned NOT NULL,
  `logIndex` int(10) unsigned NOT NULL,
  `processingStatus` enum('NEW','MATCHED','UNMATCHED','FAILED') NOT NULL DEFAULT 'NEW',
  `matchedPurchaseUid` char(36) DEFAULT NULL,
  `processingAttempts` int(10) unsigned NOT NULL DEFAULT 0,
  `processingMessage` varchar(2000) DEFAULT NULL,
  `processedAt` datetime(3) DEFAULT NULL,
  `isCanonical` tinyint(1) NOT NULL DEFAULT 1,
  `createdAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3),
  `updatedAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3) ON UPDATE current_timestamp(3),
  PRIMARY KEY (`paymentEventUid`),
  UNIQUE KEY `ukTokenPurchasePaymentEvent` (`chainId`,`txHash`,`logIndex`),
  KEY `idxTokenPurchasePaymentEventProcess` (`chainId`,`processingStatus`,`isCanonical`,`blockNumber`),
  KEY `idxTokenPurchasePaymentEventMatch` (`fromWalletAddress`,`toWalletAddress`,`amountRaw`,`blockNumber`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `tokenPurchaseTransaction` (
  `purchaseTransactionUid` char(36) NOT NULL,
  `purchaseUid` char(36) NOT NULL,
  `stage` enum('PAYMENT','MINT') NOT NULL,
  `txHash` varchar(66) NOT NULL,
  `status` enum('RECEIVED','SUBMITTED','PENDING','CONFIRMED','FAILED') NOT NULL,
  `blockNumber` bigint(20) unsigned DEFAULT NULL,
  `blockHash` varchar(66) DEFAULT NULL,
  `transactionIndex` int(10) unsigned DEFAULT NULL,
  `logIndex` int(10) unsigned DEFAULT NULL,
  `gasUsed` varchar(78) DEFAULT NULL,
  `effectiveGasPrice` varchar(78) DEFAULT NULL,
  `errorCode` varchar(100) DEFAULT NULL,
  `errorMessage` varchar(2000) DEFAULT NULL,
  `confirmedAt` datetime(3) DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3),
  `updatedAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3) ON UPDATE current_timestamp(3),
  PRIMARY KEY (`purchaseTransactionUid`),
  UNIQUE KEY `ukTokenPurchaseTransactionHash` (`txHash`),
  KEY `idxTokenPurchaseTransactionPurchase` (`purchaseUid`,`stage`,`createdAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `tokenRedemption` (
  `redemptionUid` char(36) NOT NULL,
  `interestUid` char(36) NOT NULL,
  `tokenUid` char(36) NOT NULL,
  `organizationUid` char(36) NOT NULL,
  `investorUid` char(36) NOT NULL,
  `investorUserUid` char(36) NOT NULL,
  `issuerUserUid` char(36) NOT NULL,
  `idempotencyKey` varchar(100) NOT NULL,
  `chainId` bigint(20) unsigned NOT NULL,
  `usdtContractAddress` varchar(42) NOT NULL,
  `tokenAddress` varchar(42) NOT NULL,
  `investorWalletAddress` varchar(42) NOT NULL,
  `issuerPaymentWalletAddress` varchar(42) NOT NULL,
  `platformWalletAddress` varchar(42) NOT NULL,
  `usdtDecimals` tinyint(3) unsigned NOT NULL,
  `tokenDecimals` tinyint(3) unsigned NOT NULL,
  `tokenPrice` decimal(65,18) NOT NULL,
  `tokenAmount` decimal(65,18) NOT NULL,
  `tokenAmountRaw` varchar(78) NOT NULL,
  `usdtAmount` decimal(65,18) NOT NULL,
  `usdtAmountRaw` varchar(78) NOT NULL,
  `balanceBeforeRaw` varchar(78) NOT NULL,
  `frozenBeforeRaw` varchar(78) NOT NULL,
  `totalSupplyBeforeRaw` varchar(78) NOT NULL,
  `preparedAtBlock` bigint(20) unsigned NOT NULL,
  `status` enum('PENDING_INVESTOR_AUTHORIZATION','PENDING_ISSUER_APPROVAL','ISSUER_APPROVED','TOKEN_LOCK_SUBMITTED','TOKENS_LOCKED','PAYMENT_SUBMITTED','PAYMENT_CONFIRMED','BURN_SUBMITTED','BURN_CONFIRMED','UNLOCK_SUBMITTED','CANCELLATION_PENDING','COMPLETED','ISSUER_REJECTED','CANCELLED','EXPIRED','MANUAL_REVIEW') NOT NULL DEFAULT 'PENDING_INVESTOR_AUTHORIZATION',
  `activeInterestUid` char(36) GENERATED ALWAYS AS (case when `status` not in ('COMPLETED','ISSUER_REJECTED','CANCELLED','EXPIRED') then `interestUid` else NULL end) STORED,
  `authorizationNonce` char(36) NOT NULL,
  `authorizationDeadline` datetime(3) NOT NULL,
  `authorizationSignature` varchar(132) DEFAULT NULL,
  `authorizedAt` datetime(3) DEFAULT NULL,
  `issuerDecisionAt` datetime(3) DEFAULT NULL,
  `issuerDecisionNote` varchar(1000) DEFAULT NULL,
  `rejectionReason` varchar(1000) DEFAULT NULL,
  `expiresAt` datetime(3) NOT NULL,
  `expiredAt` datetime(3) DEFAULT NULL,
  `lockStatus` enum('NOT_STARTED','QUEUED','PROCESSING','SUBMITTED','CONFIRMED','FAILED','NOT_REQUIRED') NOT NULL DEFAULT 'NOT_STARTED',
  `lockPreparedAtBlock` bigint(20) unsigned DEFAULT NULL,
  `lockTxHash` varchar(66) DEFAULT NULL,
  `lockSubmittedAt` datetime(3) DEFAULT NULL,
  `lockBlockNumber` bigint(20) unsigned DEFAULT NULL,
  `lockBlockHash` varchar(66) DEFAULT NULL,
  `lockTransactionIndex` int(10) unsigned DEFAULT NULL,
  `lockLogIndex` int(10) unsigned DEFAULT NULL,
  `lockGasUsed` varchar(78) DEFAULT NULL,
  `lockEffectiveGasPrice` varchar(78) DEFAULT NULL,
  `lockConfirmedAt` datetime(3) DEFAULT NULL,
  `paymentStatus` enum('NOT_STARTED','AWAITING_ISSUER','SUBMITTED','CONFIRMED','FAILED','NOT_REQUIRED') NOT NULL DEFAULT 'NOT_STARTED',
  `paymentRequestedAtBlock` bigint(20) unsigned DEFAULT NULL,
  `paymentTxHash` varchar(66) DEFAULT NULL,
  `paymentTxReceivedAt` datetime(3) DEFAULT NULL,
  `paymentBlockNumber` bigint(20) unsigned DEFAULT NULL,
  `paymentBlockHash` varchar(66) DEFAULT NULL,
  `paymentTransactionIndex` int(10) unsigned DEFAULT NULL,
  `paymentLogIndex` int(10) unsigned DEFAULT NULL,
  `paymentGasUsed` varchar(78) DEFAULT NULL,
  `paymentEffectiveGasPrice` varchar(78) DEFAULT NULL,
  `paymentVerifiedAt` datetime(3) DEFAULT NULL,
  `burnStatus` enum('NOT_STARTED','QUEUED','PROCESSING','SUBMITTED','CONFIRMED','FAILED','NOT_REQUIRED') NOT NULL DEFAULT 'NOT_STARTED',
  `burnPreparedAtBlock` bigint(20) unsigned DEFAULT NULL,
  `burnTxHash` varchar(66) DEFAULT NULL,
  `burnSubmittedAt` datetime(3) DEFAULT NULL,
  `burnBlockNumber` bigint(20) unsigned DEFAULT NULL,
  `burnBlockHash` varchar(66) DEFAULT NULL,
  `burnTransactionIndex` int(10) unsigned DEFAULT NULL,
  `burnLogIndex` int(10) unsigned DEFAULT NULL,
  `burnGasUsed` varchar(78) DEFAULT NULL,
  `burnEffectiveGasPrice` varchar(78) DEFAULT NULL,
  `burnConfirmedAt` datetime(3) DEFAULT NULL,
  `unlockStatus` enum('NOT_STARTED','QUEUED','PROCESSING','SUBMITTED','CONFIRMED','FAILED','NOT_REQUIRED') NOT NULL DEFAULT 'NOT_STARTED',
  `unlockAmountRaw` varchar(78) DEFAULT NULL,
  `unlockPreparedAtBlock` bigint(20) unsigned DEFAULT NULL,
  `unlockTxHash` varchar(66) DEFAULT NULL,
  `unlockSubmittedAt` datetime(3) DEFAULT NULL,
  `unlockBlockNumber` bigint(20) unsigned DEFAULT NULL,
  `unlockBlockHash` varchar(66) DEFAULT NULL,
  `unlockTransactionIndex` int(10) unsigned DEFAULT NULL,
  `unlockLogIndex` int(10) unsigned DEFAULT NULL,
  `unlockGasUsed` varchar(78) DEFAULT NULL,
  `unlockEffectiveGasPrice` varchar(78) DEFAULT NULL,
  `unlockConfirmedAt` datetime(3) DEFAULT NULL,
  `errorStage` enum('AUTHORIZATION','LOCK','PAYMENT','BURN','UNLOCK','SYSTEM') DEFAULT NULL,
  `errorCode` varchar(100) DEFAULT NULL,
  `errorMessage` varchar(2000) DEFAULT NULL,
  `syncStatus` enum('IDLE','QUEUED','PROCESSING','FAILED') NOT NULL DEFAULT 'IDLE',
  `syncRequestedAt` datetime(3) DEFAULT NULL,
  `syncStartedAt` datetime(3) DEFAULT NULL,
  `syncCompletedAt` datetime(3) DEFAULT NULL,
  `syncAttempts` int(10) unsigned NOT NULL DEFAULT 0,
  `nextSyncAt` datetime(3) DEFAULT NULL,
  `isActive` tinyint(1) NOT NULL DEFAULT 1,
  `isDeleted` tinyint(1) NOT NULL DEFAULT 0,
  `createdAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3),
  `updatedAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3) ON UPDATE current_timestamp(3),
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `tokenRedemptionHistory` (
  `redemptionHistoryUid` char(36) NOT NULL,
  `redemptionUid` char(36) NOT NULL,
  `eventType` varchar(80) NOT NULL,
  `fromStatus` varchar(50) DEFAULT NULL,
  `toStatus` varchar(50) NOT NULL,
  `actorRole` varchar(30) NOT NULL,
  `actorUserUid` char(36) DEFAULT NULL,
  `message` varchar(1000) DEFAULT NULL,
  `metadata` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`metadata`)),
  `createdAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3),
  PRIMARY KEY (`redemptionHistoryUid`),
  KEY `idxTokenRedemptionHistory` (`redemptionUid`,`createdAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `tokenRedemptionPaymentEvent` (
  `redemptionPaymentEventUid` char(36) NOT NULL,
  `chainId` bigint(20) unsigned NOT NULL,
  `usdtContractAddress` varchar(42) NOT NULL,
  `fromWalletAddress` varchar(42) NOT NULL,
  `toWalletAddress` varchar(42) NOT NULL,
  `amountRaw` varchar(78) NOT NULL,
  `txHash` varchar(66) NOT NULL,
  `blockNumber` bigint(20) unsigned NOT NULL,
  `blockHash` varchar(66) DEFAULT NULL,
  `transactionIndex` int(10) unsigned NOT NULL,
  `logIndex` int(10) unsigned NOT NULL,
  `processingStatus` enum('NEW','MATCHED','UNMATCHED','FAILED') NOT NULL DEFAULT 'NEW',
  `matchedRedemptionUid` char(36) DEFAULT NULL,
  `processingAttempts` int(10) unsigned NOT NULL DEFAULT 0,
  `processingMessage` varchar(2000) DEFAULT NULL,
  `processedAt` datetime(3) DEFAULT NULL,
  `isCanonical` tinyint(1) NOT NULL DEFAULT 1,
  `createdAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3),
  `updatedAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3) ON UPDATE current_timestamp(3),
  PRIMARY KEY (`redemptionPaymentEventUid`),
  UNIQUE KEY `ukTokenRedemptionPaymentEvent` (`chainId`,`txHash`,`logIndex`),
  KEY `idxTokenRedemptionPaymentEventProcess` (`chainId`,`processingStatus`,`isCanonical`,`blockNumber`),
  KEY `idxTokenRedemptionPaymentEventMatch` (`fromWalletAddress`,`toWalletAddress`,`amountRaw`,`blockNumber`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `tokenRedemptionTransaction` (
  `redemptionTransactionUid` char(36) NOT NULL,
  `redemptionUid` char(36) NOT NULL,
  `stage` enum('LOCK','PAYMENT','BURN','UNLOCK') NOT NULL,
  `txHash` varchar(66) NOT NULL,
  `status` enum('RECEIVED','SUBMITTED','PENDING','CONFIRMED','FAILED') NOT NULL,
  `blockNumber` bigint(20) unsigned DEFAULT NULL,
  `blockHash` varchar(66) DEFAULT NULL,
  `transactionIndex` int(10) unsigned DEFAULT NULL,
  `logIndex` int(10) unsigned DEFAULT NULL,
  `gasUsed` varchar(78) DEFAULT NULL,
  `effectiveGasPrice` varchar(78) DEFAULT NULL,
  `errorCode` varchar(100) DEFAULT NULL,
  `errorMessage` varchar(2000) DEFAULT NULL,
  `confirmedAt` datetime(3) DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3),
  `updatedAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3) ON UPDATE current_timestamp(3),
  PRIMARY KEY (`redemptionTransactionUid`),
  UNIQUE KEY `ukTokenRedemptionTransactionHash` (`txHash`),
  KEY `idxTokenRedemptionTransaction` (`redemptionUid`,`stage`,`createdAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `tokenServiceWallet` (
  `tokenServiceWalletUid` char(36) NOT NULL,
  `tokenUid` char(36) NOT NULL,
  `tokenAddress` varchar(42) NOT NULL,
  `organizationUid` char(36) NOT NULL,
  `chainUid` char(36) NOT NULL,
  `chainId` bigint(20) unsigned NOT NULL,
  `controllerAddress` varchar(42) NOT NULL,
  `mainWalletAddress` varchar(42) NOT NULL,
  `serviceWalletAddress` varchar(42) DEFAULT NULL,
  `sourceTxHash` varchar(66) DEFAULT NULL,
  `sourceBlockNumber` bigint(20) unsigned DEFAULT NULL,
  `sourceBlockHash` varchar(66) DEFAULT NULL,
  `sourceLogIndex` int(10) unsigned DEFAULT NULL,
  `verifiedAt` datetime(3) DEFAULT NULL,
  `isActive` tinyint(1) NOT NULL DEFAULT 1,
  `isDeleted` tinyint(1) NOT NULL DEFAULT 0,
  `createdAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3),
  `updatedAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3) ON UPDATE current_timestamp(3),
  PRIMARY KEY (`tokenServiceWalletUid`),
  UNIQUE KEY `ukTokenServiceWallet` (`tokenUid`,`chainUid`),
  UNIQUE KEY `ukTokenServiceWalletEvent` (`chainId`,`sourceTxHash`,`sourceLogIndex`),
  KEY `organizationUid` (`organizationUid`),
  KEY `chainUid` (`chainUid`),
  CONSTRAINT `tokenservicewallet_ibfk_1` FOREIGN KEY (`tokenUid`) REFERENCES `tokenMaster` (`tokenUid`),
  CONSTRAINT `tokenservicewallet_ibfk_2` FOREIGN KEY (`organizationUid`) REFERENCES `organizationMaster` (`organizationUid`),
  CONSTRAINT `tokenservicewallet_ibfk_3` FOREIGN KEY (`chainUid`) REFERENCES `chainMaster` (`chainUid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `tokenTransfer` (
  `transferUid` char(36) NOT NULL,
  `tokenUid` char(36) NOT NULL,
  `organizationUid` char(36) NOT NULL,
  `senderInterestUid` char(36) NOT NULL,
  `recipientInterestUid` char(36) NOT NULL,
  `senderInvestorUid` char(36) NOT NULL,
  `recipientInvestorUid` char(36) NOT NULL,
  `senderUserUid` char(36) NOT NULL,
  `recipientUserUid` char(36) NOT NULL,
  `idempotencyKey` varchar(100) NOT NULL,
  `chainId` bigint(20) unsigned NOT NULL,
  `tokenAddress` varchar(42) NOT NULL,
  `identityRegistryAddress` varchar(42) NOT NULL,
  `senderWalletAddress` varchar(42) NOT NULL,
  `recipientWalletAddress` varchar(42) NOT NULL,
  `senderIdentityAddress` varchar(42) NOT NULL,
  `recipientIdentityAddress` varchar(42) NOT NULL,
  `tokenDecimals` tinyint(3) unsigned NOT NULL,
  `tokenPrice` decimal(65,18) NOT NULL,
  `tokenAmount` decimal(65,18) NOT NULL,
  `tokenAmountRaw` varchar(78) NOT NULL,
  `senderBalanceBeforeRaw` varchar(78) NOT NULL,
  `recipientBalanceBeforeRaw` varchar(78) NOT NULL,
  `senderFrozenBeforeRaw` varchar(78) NOT NULL,
  `preparedAtBlock` bigint(20) unsigned NOT NULL,
  `status` enum('PENDING_TRANSFER','COMPLETED','EXPIRED','MANUAL_REVIEW') NOT NULL DEFAULT 'PENDING_TRANSFER',
  `activeSenderTokenKey` varchar(100) GENERATED ALWAYS AS (case when `status` = 'PENDING_TRANSFER' then concat(lcase(`senderWalletAddress`),':',lcase(`tokenAddress`)) else NULL end) STORED,
  `expiresAt` datetime(3) NOT NULL,
  `expiredAt` datetime(3) DEFAULT NULL,
  `expirationReason` varchar(100) DEFAULT NULL,
  `txHash` varchar(66) DEFAULT NULL,
  `txHashReceivedAt` datetime(3) DEFAULT NULL,
  `blockNumber` bigint(20) unsigned DEFAULT NULL,
  `blockHash` varchar(66) DEFAULT NULL,
  `transactionIndex` int(10) unsigned DEFAULT NULL,
  `logIndex` int(10) unsigned DEFAULT NULL,
  `gasUsed` varchar(78) DEFAULT NULL,
  `effectiveGasPrice` varchar(78) DEFAULT NULL,
  `senderBalanceAfterRaw` varchar(78) DEFAULT NULL,
  `recipientBalanceAfterRaw` varchar(78) DEFAULT NULL,
  `senderFrozenAfterRaw` varchar(78) DEFAULT NULL,
  `verifiedAt` datetime(3) DEFAULT NULL,
  `errorCode` varchar(100) DEFAULT NULL,
  `errorMessage` varchar(2000) DEFAULT NULL,
  `syncStatus` enum('IDLE','QUEUED','PROCESSING','FAILED') NOT NULL DEFAULT 'IDLE',
  `syncRequestedAt` datetime(3) DEFAULT NULL,
  `syncStartedAt` datetime(3) DEFAULT NULL,
  `syncCompletedAt` datetime(3) DEFAULT NULL,
  `syncAttempts` int(10) unsigned NOT NULL DEFAULT 0,
  `nextSyncAt` datetime(3) DEFAULT NULL,
  `isActive` tinyint(1) NOT NULL DEFAULT 1,
  `isDeleted` tinyint(1) NOT NULL DEFAULT 0,
  `createdAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3),
  `updatedAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3) ON UPDATE current_timestamp(3),
  PRIMARY KEY (`transferUid`),
  UNIQUE KEY `ukTokenTransferIdempotency` (`senderUserUid`,`idempotencyKey`),
  UNIQUE KEY `ukTokenTransferActiveSenderToken` (`activeSenderTokenKey`),
  UNIQUE KEY `ukTokenTransferTxHash` (`txHash`),
  KEY `idxTokenTransferSenderHistory` (`senderUserUid`,`tokenUid`,`createdAt`),
  KEY `idxTokenTransferRecipientHistory` (`recipientUserUid`,`tokenUid`,`createdAt`),
  KEY `idxTokenTransferRecovery` (`status`,`syncStatus`,`nextSyncAt`,`isDeleted`,`createdAt`),
  KEY `idxTokenTransferExpiration` (`status`,`txHash`,`expiresAt`,`isDeleted`),
  KEY `idxTokenTransferMatch` (`chainId`,`tokenAddress`,`senderWalletAddress`,`recipientWalletAddress`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `tokenTransferBlockchainEvent` (
  `transferEventUid` char(36) NOT NULL,
  `chainId` bigint(20) unsigned NOT NULL,
  `tokenAddress` varchar(42) NOT NULL,
  `fromWalletAddress` varchar(42) NOT NULL,
  `toWalletAddress` varchar(42) NOT NULL,
  `amountRaw` varchar(78) NOT NULL,
  `txHash` varchar(66) NOT NULL,
  `blockNumber` bigint(20) unsigned NOT NULL,
  `blockHash` varchar(66) DEFAULT NULL,
  `transactionIndex` int(10) unsigned NOT NULL,
  `logIndex` int(10) unsigned NOT NULL,
  `processingStatus` enum('NEW','MATCHED','UNMATCHED','FAILED') NOT NULL DEFAULT 'NEW',
  `matchedTransferUid` char(36) DEFAULT NULL,
  `processingAttempts` int(10) unsigned NOT NULL DEFAULT 0,
  `processingMessage` varchar(2000) DEFAULT NULL,
  `processedAt` datetime(3) DEFAULT NULL,
  `isCanonical` tinyint(1) NOT NULL DEFAULT 1,
  `createdAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3),
  `updatedAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3) ON UPDATE current_timestamp(3),
  PRIMARY KEY (`transferEventUid`),
  UNIQUE KEY `ukTokenTransferBlockchainEvent` (`chainId`,`txHash`,`logIndex`),
  KEY `idxTokenTransferEventProcess` (`chainId`,`processingStatus`,`isCanonical`,`blockNumber`),
  KEY `idxTokenTransferEventMatch` (`tokenAddress`,`fromWalletAddress`,`toWalletAddress`,`amountRaw`,`blockNumber`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `tokenTransferTransaction` (
  `transferTransactionUid` char(36) NOT NULL,
  `transferUid` char(36) NOT NULL,
  `txHash` varchar(66) NOT NULL,
  `status` enum('RECEIVED','PENDING','CONFIRMED','FAILED') NOT NULL,
  `blockNumber` bigint(20) unsigned DEFAULT NULL,
  `blockHash` varchar(66) DEFAULT NULL,
  `transactionIndex` int(10) unsigned DEFAULT NULL,
  `logIndex` int(10) unsigned DEFAULT NULL,
  `gasUsed` varchar(78) DEFAULT NULL,
  `effectiveGasPrice` varchar(78) DEFAULT NULL,
  `errorCode` varchar(100) DEFAULT NULL,
  `errorMessage` varchar(2000) DEFAULT NULL,
  `confirmedAt` datetime(3) DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3),
  `updatedAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3) ON UPDATE current_timestamp(3),
  PRIMARY KEY (`transferTransactionUid`),
  UNIQUE KEY `ukTokenTransferTransactionHash` (`transferUid`,`txHash`),
  KEY `idxTokenTransferTransactionTransfer` (`transferUid`,`createdAt`),
  KEY `idxTokenTransferTransactionHash` (`txHash`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `userChainIdentity` (
  `userChainIdentityUid` char(36) NOT NULL,
  `userUid` char(36) NOT NULL,
  `chainUid` char(36) NOT NULL,
  `roleName` enum('Issuer','Investor') NOT NULL,
  `walletAddress` varchar(42) NOT NULL,
  `identityAddress` varchar(42) DEFAULT NULL,
  `identityFactoryAddress` varchar(42) NOT NULL,
  `creationTxHash` varchar(66) DEFAULT NULL,
  `creationBlockNumber` bigint(20) unsigned DEFAULT NULL,
  `creationBlockHash` varchar(66) DEFAULT NULL,
  `status` enum('CREATING','CREATED','FAILED') NOT NULL DEFAULT 'CREATING',
  `isUnlocked` tinyint(1) NOT NULL DEFAULT 0,
  `unlockedAt` datetime(3) DEFAULT NULL,
  `errorCode` varchar(100) DEFAULT NULL,
  `errorMessage` varchar(2000) DEFAULT NULL,
  `isActive` tinyint(1) NOT NULL DEFAULT 1,
  `isDeleted` tinyint(1) NOT NULL DEFAULT 0,
  `createdAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3),
  `updatedAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3) ON UPDATE current_timestamp(3),
  PRIMARY KEY (`userChainIdentityUid`),
  UNIQUE KEY `ukUserChainIdentityUserChain` (`userUid`,`chainUid`),
  UNIQUE KEY `ukUserChainIdentityWallet` (`chainUid`,`walletAddress`),
  UNIQUE KEY `ukUserChainIdentityAddress` (`chainUid`,`identityAddress`),
  UNIQUE KEY `ukUserChainIdentityTxHash` (`chainUid`,`creationTxHash`),
  KEY `idxUserChainIdentityStatus` (`chainUid`,`status`,`isUnlocked`,`isDeleted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `userMaster` (
  `userUid` char(36) NOT NULL,
  `roleUid` char(36) NOT NULL,
  `fullName` varchar(120) NOT NULL,
  `email` varchar(254) NOT NULL,
  `passwordHash` varchar(255) NOT NULL,
  `emailVerified` tinyint(1) NOT NULL DEFAULT 0,
  `emailVerifiedAt` datetime(3) DEFAULT NULL,
  `isActive` tinyint(1) NOT NULL DEFAULT 1,
  `isDeleted` tinyint(1) NOT NULL DEFAULT 0,
  `lastLoginAt` datetime(3) DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3),
  `updatedAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3) ON UPDATE current_timestamp(3),
  PRIMARY KEY (`userUid`),
  UNIQUE KEY `ukUserMasterEmail` (`email`),
  KEY `idxUserMasterRoleUid` (`roleUid`),
  KEY `idxUserMasterStatus` (`isActive`,`isDeleted`),
  KEY `idxUserMasterFullName` (`fullName`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `userRole` (
  `roleUid` char(36) NOT NULL,
  `roleName` varchar(80) NOT NULL,
  `description` varchar(500) DEFAULT NULL,
  `isSystem` tinyint(1) NOT NULL DEFAULT 0,
  `isActive` tinyint(1) NOT NULL DEFAULT 1,
  `isDeleted` tinyint(1) NOT NULL DEFAULT 0,
  `createdAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3),
  `updatedAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3) ON UPDATE current_timestamp(3),
  PRIMARY KEY (`roleUid`),
  UNIQUE KEY `ukUserRoleRoleName` (`roleName`),
  KEY `idxUserRoleStatus` (`isActive`,`isDeleted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `verificationTeamNotification` (
  `notificationUid` char(36) NOT NULL,
  `userUid` char(36) NOT NULL,
  `fullName` varchar(255) NOT NULL,
  `email` varchar(255) NOT NULL,
  `roleName` varchar(40) NOT NULL,
  `status` enum('PENDING','SENDING','SENT') NOT NULL DEFAULT 'PENDING',
  `attempts` int(10) unsigned NOT NULL DEFAULT 0,
  `leaseToken` char(36) DEFAULT NULL,
  `leaseUntil` datetime(3) DEFAULT NULL,
  `nextAttemptAt` datetime(3) DEFAULT NULL,
  `lastError` varchar(100) DEFAULT NULL,
  `sentAt` datetime(3) DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT utc_timestamp(3),
  PRIMARY KEY (`notificationUid`),
  UNIQUE KEY `ukVerificationTeamUser` (`userUid`),
  KEY `idxVerificationTeamDelivery` (`status`,`nextAttemptAt`,`leaseUntil`),
  CONSTRAINT `fkVerificationTeamUser` FOREIGN KEY (`userUid`) REFERENCES `userMaster` (`userUid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- Seed source: base defaults
INSERT INTO `entityTypeMaster` (`entityTypeUid`, `entityTypeCode`, `entityTypeName`, `displayOrder`)
VALUES
  ('30000000-0000-4000-8000-000000000001', 'LLC', 'Limited Liability Company', 10),
  ('30000000-0000-4000-8000-000000000002', 'CORPORATION', 'Corporation', 20),
  ('30000000-0000-4000-8000-000000000003', 'PARTNERSHIP', 'Partnership', 30),
  ('30000000-0000-4000-8000-000000000004', 'FOUNDATION', 'Foundation', 40),
  ('30000000-0000-4000-8000-000000000005', 'OTHER', 'Other', 50)
ON DUPLICATE KEY UPDATE `entityTypeName` = VALUES(`entityTypeName`), `isActive` = TRUE, `isDeleted` = FALSE;

-- Seed source: base defaults
INSERT INTO `industryMaster` (`industryUid`, `industryCode`, `industryName`, `displayOrder`)
VALUES
  ('31000000-0000-4000-8000-000000000001', 'FINANCIAL_SERVICES', 'Financial Services', 10),
  ('31000000-0000-4000-8000-000000000002', 'TECHNOLOGY', 'Technology', 20),
  ('31000000-0000-4000-8000-000000000003', 'REAL_ESTATE', 'Real Estate', 30),
  ('31000000-0000-4000-8000-000000000004', 'ENERGY', 'Energy', 40),
  ('31000000-0000-4000-8000-000000000005', 'HEALTHCARE', 'Healthcare', 50),
  ('31000000-0000-4000-8000-000000000006', 'OTHER', 'Other', 60)
ON DUPLICATE KEY UPDATE `industryName` = VALUES(`industryName`), `isActive` = TRUE, `isDeleted` = FALSE;

-- Seed source: base defaults
INSERT INTO `documentTypeMaster`
  (`documentTypeUid`, `documentTypeCode`, `documentTypeName`, `description`, `isRequired`, `displayOrder`)
VALUES
  ('32000000-0000-4000-8000-000000000001', 'CERTIFICATE_OF_INCORPORATION', 'Certificate of Incorporation', 'Official incorporation or formation certificate.', TRUE, 10),
  ('32000000-0000-4000-8000-000000000002', 'ARTICLES_OF_ASSOCIATION', 'Articles of Association', 'Articles, memorandum, bylaws, or equivalent constitutional document.', TRUE, 20),
  ('32000000-0000-4000-8000-000000000003', 'TAX_REGISTRATION', 'Tax Registration Certificate', 'Government-issued tax registration evidence.', TRUE, 30),
  ('32000000-0000-4000-8000-000000000004', 'OWNERSHIP_STRUCTURE', 'Ownership Structure', 'Current shareholder register or ownership chart.', TRUE, 40),
  ('32000000-0000-4000-8000-000000000005', 'PROOF_OF_ADDRESS', 'Proof of Registered Address', 'Recent proof of registered business address.', FALSE, 50),
  ('32000000-0000-4000-8000-000000000006', 'BUSINESS_LICENSE', 'Business License', 'Applicable regulatory or operating license.', FALSE, 60),
  ('32000000-0000-4000-8000-000000000007', 'OTHER', 'Other Supporting Document', 'Additional supporting documentation.', FALSE, 70)
ON DUPLICATE KEY UPDATE `documentTypeName` = VALUES(`documentTypeName`), `description` = VALUES(`description`), `isRequired` = VALUES(`isRequired`), `isActive` = TRUE, `isDeleted` = FALSE;

-- Seed source: base defaults
INSERT INTO `userRole` (`roleUid`, `roleName`, `description`, `isSystem`, `isActive`)
VALUES
  ('00000000-0000-4000-8000-000000000001', 'Super Administrator', 'Unrestricted platform administration role.', TRUE, TRUE),
  ('00000000-0000-4000-8000-000000000002', 'User', 'Legacy general user role retained for managed accounts.', TRUE, TRUE),
  ('00000000-0000-4000-8000-000000000003', 'Issuer', 'Launchpad issuer account created when signup isIssuer is true.', TRUE, TRUE),
  ('00000000-0000-4000-8000-000000000004', 'Investor', 'Launchpad investor account created when signup isIssuer is false.', TRUE, TRUE)
ON DUPLICATE KEY UPDATE `description` = VALUES(`description`), `isActive` = TRUE;

-- Seed source: base defaults
INSERT INTO `menuMaster` (`menuUid`, `menuName`, `menuCode`, `routePath`, `icon`, `displayOrder`)
VALUES
  ('10000000-0000-4000-8000-000000000001', 'Users', 'USERS', '/users', 'users', 10),
  ('10000000-0000-4000-8000-000000000002', 'Roles', 'ROLES', '/roles', 'shield', 20),
  ('10000000-0000-4000-8000-000000000003', 'Menus', 'MENUS', '/menus', 'menu', 30),
  ('10000000-0000-4000-8000-000000000004', 'Permissions', 'PERMISSIONS', '/permissions', 'key', 40),
  ('10000000-0000-4000-8000-000000000005', 'Settings', 'GENERAL_SETTINGS', '/settings', 'settings', 50),
  ('10000000-0000-4000-8000-000000000006', 'Organization Onboarding', 'ORGANIZATION_ONBOARDING', '/organization', 'building', 60),
  ('10000000-0000-4000-8000-000000000007', 'Token Creation', 'TOKEN_CREATION', '/token', 'coins', 70)
ON DUPLICATE KEY UPDATE `menuName` = VALUES(`menuName`), `routePath` = VALUES(`routePath`), `isActive` = TRUE;

-- Seed source: base defaults
INSERT INTO `permissionMaster`
  (`permissionUid`, `roleUid`, `menuUid`, `permissionName`, `permissionCode`, `httpMethod`, `apiPath`)
VALUES
  (UUID(), '00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Create user', 'USER_CREATE', 'POST', '/api/v1/users'),
  (UUID(), '00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'List users', 'USER_LIST', 'GET', '/api/v1/users'),
  (UUID(), '00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'View user', 'USER_VIEW', 'GET', '/api/v1/users/:userUid'),
  (UUID(), '00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Update user', 'USER_UPDATE', 'PUT', '/api/v1/users/:userUid'),
  (UUID(), '00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Delete user', 'USER_DELETE', 'DELETE', '/api/v1/users/:userUid'),
  (UUID(), '00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'Create role', 'ROLE_CREATE', 'POST', '/api/v1/roles'),
  (UUID(), '00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'List roles', 'ROLE_LIST', 'GET', '/api/v1/roles'),
  (UUID(), '00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'View role', 'ROLE_VIEW', 'GET', '/api/v1/roles/:roleUid'),
  (UUID(), '00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'Update role', 'ROLE_UPDATE', 'PUT', '/api/v1/roles/:roleUid'),
  (UUID(), '00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'Delete role', 'ROLE_DELETE', 'DELETE', '/api/v1/roles/:roleUid'),
  (UUID(), '00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', 'Create menu', 'MENU_CREATE', 'POST', '/api/v1/menus'),
  (UUID(), '00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', 'List menus', 'MENU_LIST', 'GET', '/api/v1/menus'),
  (UUID(), '00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', 'View menu', 'MENU_VIEW', 'GET', '/api/v1/menus/:menuUid'),
  (UUID(), '00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', 'Update menu', 'MENU_UPDATE', 'PUT', '/api/v1/menus/:menuUid'),
  (UUID(), '00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', 'Delete menu', 'MENU_DELETE', 'DELETE', '/api/v1/menus/:menuUid'),
  (UUID(), '00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000004', 'Create permission', 'PERMISSION_CREATE', 'POST', '/api/v1/permissions'),
  (UUID(), '00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000004', 'List permissions', 'PERMISSION_LIST', 'GET', '/api/v1/permissions'),
  (UUID(), '00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000004', 'View permission', 'PERMISSION_VIEW', 'GET', '/api/v1/permissions/:permissionUid'),
  (UUID(), '00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000004', 'Update permission', 'PERMISSION_UPDATE', 'PUT', '/api/v1/permissions/:permissionUid'),
  (UUID(), '00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000004', 'Delete permission', 'PERMISSION_DELETE', 'DELETE', '/api/v1/permissions/:permissionUid'),
  (UUID(), '00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000005', 'Create setting', 'SETTING_CREATE', 'POST', '/api/v1/general-settings'),
  (UUID(), '00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000005', 'List settings', 'SETTING_LIST', 'GET', '/api/v1/general-settings'),
  (UUID(), '00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000005', 'View setting', 'SETTING_VIEW', 'GET', '/api/v1/general-settings/:settingUid'),
  (UUID(), '00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000005', 'Update setting', 'SETTING_UPDATE', 'PUT', '/api/v1/general-settings/:settingUid'),
  (UUID(), '00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000005', 'Delete setting', 'SETTING_DELETE', 'DELETE', '/api/v1/general-settings/:settingUid'),
  (UUID(), '00000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000003', 'List menus', 'MENU_LIST', 'GET', '/api/v1/menus'),
  (UUID(), '00000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000003', 'View menu', 'MENU_VIEW', 'GET', '/api/v1/menus/:menuUid'),
  (UUID(), '00000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000003', 'List menus', 'MENU_LIST', 'GET', '/api/v1/menus'),
  (UUID(), '00000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000003', 'View menu', 'MENU_VIEW', 'GET', '/api/v1/menus/:menuUid'),
  (UUID(), '00000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000006', 'View own organization', 'ORG_VIEW_OWN', 'GET', '/api/v1/organizations/me'),
  (UUID(), '00000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000006', 'Save company information', 'ORG_SAVE_COMPANY', 'PUT', '/api/v1/organizations/me/company-information'),
  (UUID(), '00000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000006', 'Save jurisdiction', 'ORG_SAVE_JURISDICTION', 'PUT', '/api/v1/organizations/me/jurisdiction'),
  (UUID(), '00000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000006', 'Save beneficial owners', 'ORG_SAVE_UBOS', 'PUT', '/api/v1/organizations/me/beneficial-owners'),
  (UUID(), '00000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000006', 'Upload organization documents', 'ORG_UPLOAD_DOCUMENT', 'POST', '/api/v1/organizations/me/documents'),
  (UUID(), '00000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000006', 'List organization documents', 'ORG_LIST_DOCUMENTS', 'GET', '/api/v1/organizations/me/documents'),
  (UUID(), '00000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000006', 'Download organization document', 'ORG_DOWNLOAD_DOCUMENT', 'GET', '/api/v1/organizations/me/documents/:documentUid/download'),
  (UUID(), '00000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000006', 'Delete organization document', 'ORG_DELETE_DOCUMENT', 'DELETE', '/api/v1/organizations/me/documents/:documentUid'),
  (UUID(), '00000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000006', 'Submit organization', 'ORG_SUBMIT', 'POST', '/api/v1/organizations/me/submit'),
  (UUID(), '00000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000006', 'Mark organization user notified', 'ORG_MARK_USER_NOTIFIED', 'PATCH', '/api/v1/organizations/me/user-notified'),
  (UUID(), '00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000006', 'List submitted organizations', 'ADMIN_ORG_LIST', 'GET', '/api/v1/admin/organizations'),
  (UUID(), '00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000006', 'View submitted organization', 'ADMIN_ORG_VIEW', 'GET', '/api/v1/admin/organizations/:organizationUid'),
  (UUID(), '00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000006', 'Preview or download organization document', 'ADMIN_ORG_DOCUMENT_FILE', 'GET', '/api/v1/admin/organizations/:organizationUid/documents/:documentUid/file'),
  (UUID(), '00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000006', 'Review submitted organization', 'ADMIN_ORG_REVIEW', 'PATCH', '/api/v1/admin/organizations/:organizationUid/status')
ON DUPLICATE KEY UPDATE `permissionName` = VALUES(`permissionName`), `menuUid` = VALUES(`menuUid`), `isAllowed` = TRUE, `isActive` = TRUE, `isDeleted` = FALSE;

-- Seed source: base defaults
INSERT INTO `claimTopicMaster`
  (`claimTopicUid`, `claimTopicCode`, `claimTopicName`, `description`, `value`, `displayOrder`)
VALUES
  ('30000000-0000-4000-8000-000000000001', 'KYC', 'KYC (Know Your Customer)', 'Verified identity and residential address.', 1, 10),
  ('30000000-0000-4000-8000-000000000002', 'ACCREDITED_INVESTOR', 'Accredited Investor', 'Meets configured net-worth or income requirements.', 2, 20)
ON DUPLICATE KEY UPDATE
  `claimTopicName` = VALUES(`claimTopicName`),
  `description` = VALUES(`description`),
  `value` = VALUES(`value`),
  `displayOrder` = VALUES(`displayOrder`),
  `isActive` = TRUE,
  `isDeleted` = FALSE;

-- Seed source: base defaults
INSERT INTO `permissionMaster`
  (`permissionUid`, `roleUid`, `menuUid`, `permissionName`, `permissionCode`, `httpMethod`, `apiPath`)
VALUES
  (UUID(), '00000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000007', 'View own token form', 'TOKEN_VIEW_OWN', 'GET', '/api/v1/tokens/me'),
  (UUID(), '00000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000007', 'Save token information', 'TOKEN_SAVE_INFORMATION', 'PUT', '/api/v1/tokens/me/information'),
  (UUID(), '00000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000007', 'View token image', 'TOKEN_VIEW_IMAGE', 'GET', '/api/v1/tokens/me/image'),
  (UUID(), '00000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000007', 'Save token claims', 'TOKEN_SAVE_CLAIMS', 'PUT', '/api/v1/tokens/me/claims'),
  (UUID(), '00000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000007', 'Save token compliance rules', 'TOKEN_SAVE_COMPLIANCE', 'PUT', '/api/v1/tokens/me/compliance'),
  (UUID(), '00000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000007', 'Save token governance roles', 'TOKEN_SAVE_GOVERNANCE', 'PUT', '/api/v1/tokens/me/governance'),
  (UUID(), '00000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000007', 'Update current token price', 'TOKEN_UPDATE_CURRENT_PRICE', 'PATCH', '/api/v1/tokens/me/price'),
  (UUID(), '00000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000007', 'Submit token for deployment', 'TOKEN_SUBMIT', 'POST', '/api/v1/tokens/me/submit')
ON DUPLICATE KEY UPDATE
  `permissionName` = VALUES(`permissionName`),
  `menuUid` = VALUES(`menuUid`),
  `isAllowed` = TRUE,
  `isActive` = TRUE,
  `isDeleted` = FALSE;

-- Seed source: 20260723_add_issuer_investor_roles.sql
INSERT INTO `userRole` (`roleUid`, `roleName`, `description`, `isSystem`, `isActive`)
VALUES
  ('00000000-0000-4000-8000-000000000003', 'Issuer', 'Launchpad issuer account created when signup isIssuer is true.', TRUE, TRUE),
  ('00000000-0000-4000-8000-000000000004', 'Investor', 'Launchpad investor account created when signup isIssuer is false.', TRUE, TRUE)
ON DUPLICATE KEY UPDATE
  `description` = VALUES(`description`),
  `isSystem` = TRUE,
  `isActive` = TRUE,
  `isDeleted` = FALSE;

-- Seed source: 20260723_add_issuer_investor_roles.sql
INSERT INTO `permissionMaster`
  (`permissionUid`, `roleUid`, `menuUid`, `permissionName`, `permissionCode`, `httpMethod`, `apiPath`)
VALUES
  (UUID(), '00000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000003', 'List menus', 'MENU_LIST', 'GET', '/api/v1/menus'),
  (UUID(), '00000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000003', 'View menu', 'MENU_VIEW', 'GET', '/api/v1/menus/:menuUid'),
  (UUID(), '00000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000003', 'List menus', 'MENU_LIST', 'GET', '/api/v1/menus'),
  (UUID(), '00000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000003', 'View menu', 'MENU_VIEW', 'GET', '/api/v1/menus/:menuUid')
ON DUPLICATE KEY UPDATE
  `permissionName` = VALUES(`permissionName`),
  `menuUid` = VALUES(`menuUid`),
  `isAllowed` = TRUE,
  `isActive` = TRUE,
  `isDeleted` = FALSE;

-- Seed source: 20260727_add_organization_user_notified.sql
INSERT INTO `permissionMaster`
  (`permissionUid`, `roleUid`, `menuUid`, `permissionName`, `permissionCode`, `httpMethod`, `apiPath`)
VALUES
  (
    UUID(),
    '00000000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000006',
    'Mark organization user notified',
    'ORG_MARK_USER_NOTIFIED',
    'PATCH',
    '/api/v1/organizations/me/user-notified'
  )
ON DUPLICATE KEY UPDATE
  `permissionName` = VALUES(`permissionName`),
  `menuUid` = VALUES(`menuUid`),
  `isAllowed` = TRUE,
  `isActive` = TRUE,
  `isDeleted` = FALSE;

-- Seed source: 20260728_add_admin_organization_document_access.sql
INSERT INTO `permissionMaster`
  (`permissionUid`, `roleUid`, `menuUid`, `permissionName`, `permissionCode`, `httpMethod`, `apiPath`)
VALUES
  (
    UUID(),
    '00000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000006',
    'Preview or download organization document',
    'ADMIN_ORG_DOCUMENT_FILE',
    'GET',
    '/api/v1/admin/organizations/:organizationUid/documents/:documentUid/file'
  )
ON DUPLICATE KEY UPDATE
  `permissionName` = VALUES(`permissionName`),
  `menuUid` = VALUES(`menuUid`),
  `isAllowed` = TRUE,
  `isActive` = TRUE,
  `isDeleted` = FALSE;

-- Seed source: 20260728_add_admin_organization_review.sql
INSERT INTO `permissionMaster`
  (`permissionUid`, `roleUid`, `menuUid`, `permissionName`, `permissionCode`, `httpMethod`, `apiPath`)
VALUES
  (
    UUID(),
    '00000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000006',
    'List submitted organizations',
    'ADMIN_ORG_LIST',
    'GET',
    '/api/v1/admin/organizations'
  ),
  (
    UUID(),
    '00000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000006',
    'View submitted organization',
    'ADMIN_ORG_VIEW',
    'GET',
    '/api/v1/admin/organizations/:organizationUid'
  ),
  (
    UUID(),
    '00000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000006',
    'Review submitted organization',
    'ADMIN_ORG_REVIEW',
    'PATCH',
    '/api/v1/admin/organizations/:organizationUid/status'
  )
ON DUPLICATE KEY UPDATE
  `permissionName` = VALUES(`permissionName`),
  `menuUid` = VALUES(`menuUid`),
  `isAllowed` = TRUE,
  `isActive` = TRUE,
  `isDeleted` = FALSE;

-- Seed source: 20260730_add_token_creation_flow.sql
INSERT INTO `claimTopicMaster`
  (`claimTopicUid`, `claimTopicCode`, `claimTopicName`, `description`, `value`, `displayOrder`)
VALUES
  ('30000000-0000-4000-8000-000000000001', 'KYC', 'KYC (Know Your Customer)', 'Verified identity and residential address.', 1, 10),
  ('30000000-0000-4000-8000-000000000002', 'ACCREDITED_INVESTOR', 'Accredited Investor', 'Meets configured net-worth or income requirements.', 2, 20)
ON DUPLICATE KEY UPDATE
  `claimTopicName` = VALUES(`claimTopicName`),
  `description` = VALUES(`description`),
  `value` = VALUES(`value`),
  `displayOrder` = VALUES(`displayOrder`),
  `isActive` = TRUE,
  `isDeleted` = FALSE;

-- Seed source: 20260730_add_token_creation_flow.sql
INSERT INTO `menuMaster` (`menuUid`, `menuName`, `menuCode`, `routePath`, `icon`, `displayOrder`)
VALUES ('10000000-0000-4000-8000-000000000007', 'Token Creation', 'TOKEN_CREATION', '/token', 'coins', 70)
ON DUPLICATE KEY UPDATE `menuName` = VALUES(`menuName`), `routePath` = VALUES(`routePath`), `isActive` = TRUE;

-- Seed source: 20260730_add_token_creation_flow.sql
INSERT INTO `permissionMaster`
  (`permissionUid`, `roleUid`, `menuUid`, `permissionName`, `permissionCode`, `httpMethod`, `apiPath`)
VALUES
  (UUID(), '00000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000007', 'View own token form', 'TOKEN_VIEW_OWN', 'GET', '/api/v1/tokens/me'),
  (UUID(), '00000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000007', 'Save token information', 'TOKEN_SAVE_INFORMATION', 'PUT', '/api/v1/tokens/me/information'),
  (UUID(), '00000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000007', 'View token image', 'TOKEN_VIEW_IMAGE', 'GET', '/api/v1/tokens/me/image'),
  (UUID(), '00000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000007', 'Save token claims', 'TOKEN_SAVE_CLAIMS', 'PUT', '/api/v1/tokens/me/claims'),
  (UUID(), '00000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000007', 'Save token compliance rules', 'TOKEN_SAVE_COMPLIANCE', 'PUT', '/api/v1/tokens/me/compliance'),
  (UUID(), '00000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000007', 'Save token governance roles', 'TOKEN_SAVE_GOVERNANCE', 'PUT', '/api/v1/tokens/me/governance'),
  (UUID(), '00000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000007', 'Submit token for deployment', 'TOKEN_SUBMIT', 'POST', '/api/v1/tokens/me/submit')
ON DUPLICATE KEY UPDATE
  `permissionName` = VALUES(`permissionName`),
  `menuUid` = VALUES(`menuUid`),
  `isAllowed` = TRUE,
  `isActive` = TRUE,
  `isDeleted` = FALSE;

-- Seed source: 20260804_add_token_deployment_attempts.sql
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

-- Seed source: 20260805_add_trex_deployment_sync.sql
INSERT INTO `generalSettings`
  (`settingUid`, `settingKey`, `settingValue`, `valueType`, `settingGroup`, `description`, `isPublic`)
VALUES
  ('20000000-0000-4000-8000-0000000000a1', 'TrexDeploymentSyncInterval', '60', 'number', 'trexDeploymentSync',
    'Background TREX deployment sync interval in minutes.', FALSE),
  ('20000000-0000-4000-8000-0000000000a2', 'TrexDeploymentLastSyncBlock', '0', 'number', 'trexDeploymentSync',
    'Last blockchain block number successfully processed by the sync runner (checkpoint).', FALSE),
  ('20000000-0000-4000-8000-0000000000a3', 'TrexDeploymentBlockOffset', '500', 'number', 'trexDeploymentSync',
    'Number of blocks scanned per eth_getLogs request.', FALSE),
  ('20000000-0000-4000-8000-0000000000a4', 'TrexDeploymentConfirmationBlocks', '2', 'number', 'trexDeploymentSync',
    'Confirmation buffer; the runner never processes newer than LatestBlock - this value.', FALSE),
  ('20000000-0000-4000-8000-0000000000a5', 'TrexDeploymentStartBlock', '0', 'number', 'trexDeploymentSync',
    'Optional first-run start block (set to the TREX factory deploy block for full recovery). 0 = start one offset behind the safe head.', FALSE),
  ('20000000-0000-4000-8000-0000000000a6', 'TrexDeploymentSyncEnabled', 'true', 'boolean', 'trexDeploymentSync',
    'Master on/off switch for the background TREX deployment sync runner.', FALSE)
ON DUPLICATE KEY UPDATE
  `valueType` = VALUES(`valueType`),
  `settingGroup` = VALUES(`settingGroup`),
  `description` = VALUES(`description`),
  `isActive` = TRUE,
  `isDeleted` = FALSE;

-- Seed source: 20260807_add_investor_onboarding.sql
INSERT INTO `investorDocumentTypeMaster`
  (`documentTypeUid`, `documentTypeCode`, `documentTypeName`, `documentCategory`, `description`, `isRequired`, `displayOrder`)
VALUES
  ('33000000-0000-4000-8000-000000000001', 'PASSPORT', 'Passport', 'kyc', 'Government-issued passport photo page.', TRUE, 10),
  ('33000000-0000-4000-8000-000000000002', 'NATIONAL_ID', 'National ID', 'kyc', 'Valid national identity card.', TRUE, 20),
  ('33000000-0000-4000-8000-000000000003', 'DRIVERS_LICENSE', 'Driver''s License', 'kyc', 'Current government-issued driver''s license.', FALSE, 30),

  ('33000000-0000-4000-8000-000000000011', 'BANK_REFERENCE_LETTER', 'Bank Reference Letter', 'accredited', 'Bank reference letter supporting accreditation.', FALSE, 10),
  ('33000000-0000-4000-8000-000000000012', 'INVESTMENT_PORTFOLIO_STATEMENT', 'Investment Portfolio Statement', 'accredited', 'Recent investment portfolio statement.', FALSE, 20),
  ('33000000-0000-4000-8000-000000000013', 'NET_WORTH_STATEMENT', 'Net Worth Statement', 'accredited', 'Signed net-worth statement.', FALSE, 30),
  ('33000000-0000-4000-8000-000000000014', 'INCOME_CERTIFICATE', 'Income Certificate', 'accredited', 'Certified income evidence.', FALSE, 40),
  ('33000000-0000-4000-8000-000000000015', 'TAX_RETURN', 'Tax Return', 'accredited', 'Recent tax return.', FALSE, 50),
  ('33000000-0000-4000-8000-000000000016', 'ACCOUNTANT_CPA_CERTIFICATION', 'Accountant or CPA Certification', 'accredited', 'Accountant or CPA accreditation certification.', FALSE, 60),
  ('33000000-0000-4000-8000-000000000017', 'ACCREDITED_INVESTOR_CERTIFICATE', 'Accredited Investor Certificate', 'accredited', 'Third-party accredited-investor certificate.', FALSE, 70)
ON DUPLICATE KEY UPDATE
  `documentTypeName` = VALUES(`documentTypeName`),
  `documentCategory` = VALUES(`documentCategory`),
  `description` = VALUES(`description`),
  `isRequired` = VALUES(`isRequired`),
  `displayOrder` = VALUES(`displayOrder`),
  `isActive` = TRUE,
  `isDeleted` = FALSE;

-- Seed source: 20260807_add_investor_onboarding.sql
INSERT INTO `menuMaster` (`menuUid`, `menuName`, `menuCode`, `routePath`, `icon`, `displayOrder`)
VALUES
  ('10000000-0000-4000-8000-000000000008', 'Investor Onboarding', 'INVESTOR_ONBOARDING', '/investor', 'user-check', 80)
ON DUPLICATE KEY UPDATE `menuName` = VALUES(`menuName`), `routePath` = VALUES(`routePath`), `isActive` = TRUE;

-- Seed source: 20260807_add_investor_onboarding.sql
INSERT INTO `permissionMaster`
  (`permissionUid`, `roleUid`, `menuUid`, `permissionName`, `permissionCode`, `httpMethod`, `apiPath`)
VALUES
  (UUID(), '00000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000008', 'View own investor form', 'INVESTOR_VIEW_OWN', 'GET', '/api/v1/investors/me'),
  (UUID(), '00000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000008', 'Save investor identity details', 'INVESTOR_SAVE_IDENTITY', 'PUT', '/api/v1/investors/me/identity'),
  (UUID(), '00000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000008', 'Save investor compliance questionnaire', 'INVESTOR_SAVE_COMPLIANCE', 'PUT', '/api/v1/investors/me/compliance'),
  (UUID(), '00000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000008', 'Upload investor documents', 'INVESTOR_UPLOAD_DOCUMENT', 'POST', '/api/v1/investors/me/documents'),
  (UUID(), '00000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000008', 'List investor documents', 'INVESTOR_LIST_DOCUMENTS', 'GET', '/api/v1/investors/me/documents'),
  (UUID(), '00000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000008', 'Download investor document', 'INVESTOR_DOWNLOAD_DOCUMENT', 'GET', '/api/v1/investors/me/documents/:documentUid/download'),
  (UUID(), '00000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000008', 'Delete investor document', 'INVESTOR_DELETE_DOCUMENT', 'DELETE', '/api/v1/investors/me/documents/:documentUid'),
  (UUID(), '00000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000008', 'Submit investor onboarding', 'INVESTOR_SUBMIT', 'POST', '/api/v1/investors/me/submit')
ON DUPLICATE KEY UPDATE
  `permissionName` = VALUES(`permissionName`),
  `menuUid` = VALUES(`menuUid`),
  `isAllowed` = TRUE,
  `isActive` = TRUE,
  `isDeleted` = FALSE;

-- Seed source: 20260808_add_investment_journey.sql
UPDATE `investorDocumentTypeMaster`
  SET `claimTopicCode` = CASE `documentCategory` WHEN 'kyc' THEN 'KYC' ELSE 'ACCREDITED_INVESTOR' END
  WHERE `claimTopicCode` IS NULL OR `claimTopicCode` = '';

-- Seed source: 20260808_add_investment_journey.sql
INSERT INTO `menuMaster` (`menuUid`, `menuName`, `menuCode`, `routePath`, `icon`, `displayOrder`)
VALUES
  ('10000000-0000-4000-8000-000000000009', 'Investments', 'INVESTMENTS', '/investments', 'trending-up', 90)
ON DUPLICATE KEY UPDATE `menuName` = VALUES(`menuName`), `routePath` = VALUES(`routePath`), `isActive` = TRUE;

-- Seed source: 20260808_add_investment_journey.sql
INSERT INTO `permissionMaster`
  (`permissionUid`, `roleUid`, `menuUid`, `permissionName`, `permissionCode`, `httpMethod`, `apiPath`)
VALUES

  (UUID(), '00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000009', 'List investment tokens (admin)', 'ADMIN_INVESTMENT_TOKEN_LIST', 'GET', '/api/v1/investments/tokens'),
  (UUID(), '00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000009', 'View investment token (admin)', 'ADMIN_INVESTMENT_TOKEN_VIEW', 'GET', '/api/v1/investments/tokens/:tokenUid'),
  (UUID(), '00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000009', 'View investment token image (admin)', 'ADMIN_INVESTMENT_TOKEN_IMAGE', 'GET', '/api/v1/investments/tokens/:tokenUid/image'),
  (UUID(), '00000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000009', 'List investment tokens', 'INVESTMENT_TOKEN_LIST', 'GET', '/api/v1/investments/tokens'),
  (UUID(), '00000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000009', 'View investment token', 'INVESTMENT_TOKEN_VIEW', 'GET', '/api/v1/investments/tokens/:tokenUid'),
  (UUID(), '00000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000009', 'View investment token image', 'INVESTMENT_TOKEN_IMAGE', 'GET', '/api/v1/investments/tokens/:tokenUid/image'),

  (UUID(), '00000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000009', 'View token required documents', 'INVESTMENT_REQUIRED_DOCUMENTS', 'GET', '/api/v1/investments/tokens/:tokenUid/required-documents'),
  (UUID(), '00000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000009', 'Submit investment interest', 'INVESTMENT_SUBMIT_INTEREST', 'POST', '/api/v1/investments/tokens/:tokenUid/interest'),
  (UUID(), '00000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000009', 'List my investment interests', 'INVESTMENT_MY_INTERESTS', 'GET', '/api/v1/investments/me/interests'),

  (UUID(), '00000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000009', 'List investment interests (issuer)', 'ISSUER_INVESTMENT_INTEREST_LIST', 'GET', '/api/v1/investments/issuer/interests'),
  (UUID(), '00000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000009', 'View investment interest (issuer)', 'ISSUER_INVESTMENT_INTEREST_VIEW', 'GET', '/api/v1/investments/issuer/interests/:interestUid'),
  (UUID(), '00000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000009', 'Download interest investor document (issuer)', 'ISSUER_INVESTMENT_INTEREST_DOC', 'GET', '/api/v1/investments/issuer/interests/:interestUid/documents/:documentUid/download')
ON DUPLICATE KEY UPDATE
  `permissionName` = VALUES(`permissionName`),
  `menuUid` = VALUES(`menuUid`),
  `isAllowed` = TRUE,
  `isActive` = TRUE,
  `isDeleted` = FALSE;

-- Seed source: 20260811_investment_interest_reject_flow.sql
INSERT INTO `permissionMaster`
  (`permissionUid`, `roleUid`, `menuUid`, `permissionName`, `permissionCode`, `httpMethod`, `apiPath`)
VALUES
  (UUID(), '00000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000009', 'Approve investment interest (issuer)', 'ISSUER_INVESTMENT_INTEREST_APPROVE', 'POST', '/api/v1/investments/issuer/interests/:interestUid/approve'),
  (UUID(), '00000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000009', 'Reject investment interest (issuer)', 'ISSUER_INVESTMENT_INTEREST_REJECT', 'POST', '/api/v1/investments/issuer/interests/:interestUid/reject')
ON DUPLICATE KEY UPDATE
  `permissionName` = VALUES(`permissionName`),
  `menuUid` = VALUES(`menuUid`),
  `isAllowed` = TRUE,
  `isActive` = TRUE,
  `isDeleted` = FALSE;

-- Seed source: 20260812_investment_interest_history.sql
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

-- Seed source: 20260814_issuer_claim_verification.sql
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

-- Seed source: 20260817_investor_claim_submission.sql
INSERT INTO `permissionMaster`
  (`permissionUid`, `roleUid`, `menuUid`, `permissionName`, `permissionCode`, `httpMethod`, `apiPath`)
VALUES
  (UUID(), '00000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000009', 'List issuer-signed claims to submit', 'INVESTOR_CLAIM_LIST', 'GET', '/api/v1/investor/claims'),
  (UUID(), '00000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000009', 'Submit an on-chain investor claim', 'INVESTOR_CLAIM_SUBMIT', 'POST', '/api/v1/investor/claims/:claimId/submit')
ON DUPLICATE KEY UPDATE
  `permissionName` = VALUES(`permissionName`),
  `menuUid` = VALUES(`menuUid`),
  `isAllowed` = TRUE,
  `isActive` = TRUE,
  `isDeleted` = FALSE;

-- Seed source: 20260818_investor_claim_prepare_permission.sql
INSERT INTO `permissionMaster`
  (`permissionUid`, `roleUid`, `menuUid`, `permissionName`, `permissionCode`, `httpMethod`, `apiPath`)
VALUES
  (UUID(), '00000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000009', 'Prepare an on-chain investor claim submission', 'INVESTOR_CLAIM_PREPARE', 'POST', '/api/v1/investor/claims/:claimId/prepare')
ON DUPLICATE KEY UPDATE
  `permissionName` = VALUES(`permissionName`),
  `menuUid` = VALUES(`menuUid`),
  `isAllowed` = TRUE,
  `isActive` = TRUE,
  `isDeleted` = FALSE;

-- Seed source: 20260819_claim_recovery_settings.sql
INSERT INTO `generalSettings`
  (`settingUid`, `settingKey`, `settingValue`, `valueType`, `settingGroup`, `description`, `isPublic`)
VALUES
  ('20000000-0000-4000-8000-0000000000b1', 'ClaimRecoveryInterval', '60', 'number', 'claimRecovery',
    'Investor claim recovery runner interval in minutes.', FALSE),
  ('20000000-0000-4000-8000-0000000000b2', 'ClaimRecoveryBlockOffset', '1000', 'number', 'claimRecovery',
    'Block range (chunk) size per eth_getLogs request.', FALSE),
  ('20000000-0000-4000-8000-0000000000b3', 'ClaimRecoveryConfirmationBlocks', '2', 'number', 'claimRecovery',
    'Confirmation buffer; the runner never searches newer than LatestBlock - this value.', FALSE),
  ('20000000-0000-4000-8000-0000000000b4', 'ClaimRecoveryLookbackBlocks', '200000', 'number', 'claimRecovery',
    'How many blocks back from the safe head to search for a suspicious submission''s claim event.', FALSE),
  ('20000000-0000-4000-8000-0000000000b5', 'ClaimRecoveryBatchSize', '100', 'number', 'claimRecovery',
    'Maximum suspicious submissions processed per run.', FALSE),
  ('20000000-0000-4000-8000-0000000000b6', 'ClaimRecoveryEnabled', 'true', 'boolean', 'claimRecovery',
    'Master on/off switch for the background claim recovery runner.', FALSE)
ON DUPLICATE KEY UPDATE
  `valueType` = VALUES(`valueType`),
  `settingGroup` = VALUES(`settingGroup`),
  `description` = VALUES(`description`),
  `isActive` = TRUE,
  `isDeleted` = FALSE;

-- Seed source: 20260820_investor_claim_retry_permission.sql
INSERT INTO `permissionMaster`
  (`permissionUid`, `roleUid`, `menuUid`, `permissionName`, `permissionCode`, `httpMethod`, `apiPath`)
VALUES
  (UUID(), '00000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000009', 'Retry / reconcile an on-chain investor claim submission', 'INVESTOR_CLAIM_RETRY', 'POST', '/api/v1/investor/claims/:claimId/retry')
ON DUPLICATE KEY UPDATE
  `permissionName` = VALUES(`permissionName`),
  `menuUid` = VALUES(`menuUid`),
  `isAllowed` = TRUE,
  `isActive` = TRUE,
  `isDeleted` = FALSE;

-- Seed source: 20260821_add_hybrid_claim_indexer.sql
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

-- Seed source: 20260822_add_identity_registry_registration.sql
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

-- Seed source: 20260822_add_identity_registry_registration.sql
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

-- Seed source: 20260825_add_token_purchase_flow.sql
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

-- Seed source: 20260825_add_token_purchase_flow.sql
INSERT INTO `generalSettings`
  (`settingUid`,`settingKey`,`settingValue`,`valueType`,`settingGroup`,`description`,`isPublic`)
VALUES
  ('20000000-0000-4000-8000-0000000000e1','PurchaseWorkerEnabled','true','boolean','purchaseWorker','Enables USDT indexing and token mint recovery.',FALSE),
  ('20000000-0000-4000-8000-0000000000e2','PurchaseWorkerIntervalSeconds','15','number','purchaseWorker','Delay between purchase reconciliation runs.',FALSE),
  ('20000000-0000-4000-8000-0000000000e3','PurchaseIndexerBlockOffset','1000','number','purchaseWorker','Maximum sequential blocks per USDT log query.',FALSE),
  ('20000000-0000-4000-8000-0000000000e4','PurchaseIndexerConfirmationBlocks','2','number','purchaseWorker','Safe-head confirmation buffer for payments and mints.',FALSE),
  ('20000000-0000-4000-8000-0000000000e5','PurchaseWorkerLeaseSeconds','180','number','purchaseWorker','Distributed lease duration; serializes platform-wallet minting.',FALSE),
  ('20000000-0000-4000-8000-0000000000e6','PurchaseWorkerBatchSize','50','number','purchaseWorker','Purchase rows reconciled per run.',FALSE),
  ('20000000-0000-4000-8000-0000000000e7','PurchaseEventBatchSize','200','number','purchaseWorker','Stored USDT events matched per run.',FALSE),
  ('20000000-0000-4000-8000-0000000000e8','PurchaseIndexerMaxChunksPerRun','10','number','purchaseWorker','Maximum checkpoint chunks scanned per run.',FALSE),
  ('20000000-0000-4000-8000-0000000000e9','PurchaseExpirationBatchSize','50','number','purchaseWorker','Abandoned no-hash payment intents expired per worker run.',FALSE),
  ('20000000-0000-4000-8000-0000000000ea','PurchaseIntentExpiryGraceSeconds','180','number','purchaseWorker','Grace period after intent expiry so the safe-chain indexer can recover a submitted transfer.',FALSE)
ON DUPLICATE KEY UPDATE `valueType`=VALUES(`valueType`),`settingGroup`=VALUES(`settingGroup`),
  `description`=VALUES(`description`),`isActive`=TRUE,`isDeleted`=FALSE;

-- Seed source: 20260826_expire_abandoned_token_purchases.sql
INSERT INTO `generalSettings`
  (`settingUid`,`settingKey`,`settingValue`,`valueType`,`settingGroup`,`description`,`isPublic`)
VALUES
  ('20000000-0000-4000-8000-0000000000e9','PurchaseExpirationBatchSize','50','number','purchaseWorker','Abandoned no-hash payment intents expired per worker run.',FALSE),
  ('20000000-0000-4000-8000-0000000000ea','PurchaseIntentExpiryGraceSeconds','180','number','purchaseWorker','Grace period after intent expiry so the safe-chain indexer can recover a submitted transfer.',FALSE)
ON DUPLICATE KEY UPDATE `valueType`=VALUES(`valueType`),`settingGroup`=VALUES(`settingGroup`),
  `description`=VALUES(`description`),`isActive`=TRUE,`isDeleted`=FALSE;

-- Seed source: 20260827_add_investor_token_purchase_history.sql
INSERT INTO `permissionMaster`
  (`permissionUid`,`roleUid`,`menuUid`,`permissionName`,`permissionCode`,`httpMethod`,`apiPath`)
VALUES
  (UUID(),'00000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000009',
   'List token purchase history','INVESTOR_TOKEN_PURCHASE_HISTORY','GET',
   '/api/v1/investments/tokens/:tokenUid/purchases')
ON DUPLICATE KEY UPDATE `permissionName`=VALUES(`permissionName`),`menuUid`=VALUES(`menuUid`),
  `permissionCode`=VALUES(`permissionCode`),`isAllowed`=TRUE,`isActive`=TRUE,`isDeleted`=FALSE;

-- Seed source: 20260828_add_token_redemption_flow.sql
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

-- Seed source: 20260828_add_token_redemption_flow.sql
INSERT INTO `generalSettings`
  (`settingUid`,`settingKey`,`settingValue`,`valueType`,`settingGroup`,`description`,`isPublic`)
VALUES
  ('20000000-0000-4000-8000-0000000000f1','RedemptionWorkerEnabled','true','boolean','redemptionWorker','Enables redemption payment indexing and settlement recovery.',FALSE),
  ('20000000-0000-4000-8000-0000000000f2','RedemptionWorkerIntervalSeconds','15','number','redemptionWorker','Delay between redemption reconciliation runs.',FALSE),
  ('20000000-0000-4000-8000-0000000000f3','RedemptionIndexerBlockOffset','1000','number','redemptionWorker','Maximum sequential blocks per USDT event query.',FALSE),
  ('20000000-0000-4000-8000-0000000000f4','RedemptionConfirmationBlocks','2','number','redemptionWorker','Canonical confirmation threshold for lock, payment, burn, and unlock.',FALSE),
  ('20000000-0000-4000-8000-0000000000f5','RedemptionWorkerLeaseSeconds','180','number','redemptionWorker','Distributed lease duration for settlement execution.',FALSE),
  ('20000000-0000-4000-8000-0000000000f6','RedemptionWorkerBatchSize','50','number','redemptionWorker','Redemption rows reconciled per run.',FALSE),
  ('20000000-0000-4000-8000-0000000000f7','RedemptionEventBatchSize','200','number','redemptionWorker','Stored USDT events matched per run.',FALSE),
  ('20000000-0000-4000-8000-0000000000f8','RedemptionIndexerMaxChunksPerRun','10','number','redemptionWorker','Maximum indexer chunks processed per run.',FALSE),
  ('20000000-0000-4000-8000-0000000000f9','RedemptionExpirationBatchSize','50','number','redemptionWorker','Unsigned redemption requests expired per run.',FALSE)
ON DUPLICATE KEY UPDATE `valueType`=VALUES(`valueType`),`settingGroup`=VALUES(`settingGroup`),
  `description`=VALUES(`description`),`isActive`=TRUE,`isDeleted`=FALSE;

-- Seed source: 20260829_add_investor_invitations.sql
INSERT INTO `permissionMaster`
  (`permissionUid`,`roleUid`,`menuUid`,`permissionName`,`permissionCode`,`httpMethod`,`apiPath`)
VALUES
  (UUID(),'00000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000009','List completed investors for invitations','ISSUER_INVESTOR_LIST','GET','/api/v1/investments/issuer/investors'),
  (UUID(),'00000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000009','Invite investor to token','ISSUER_INVESTOR_INVITE','POST','/api/v1/investments/issuer/investors/:investorUid/invitations'),
  (UUID(),'00000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000009','List received token invitations','INVESTOR_INVITATION_LIST','GET','/api/v1/investments/me/invitations'),
  (UUID(),'00000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000009','View received token invitation','INVESTOR_INVITATION_VIEW','GET','/api/v1/investments/me/invitations/:invitationUid'),
  (UUID(),'00000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000009','Mark token invitation viewed','INVESTOR_INVITATION_MARK_VIEWED','PATCH','/api/v1/investments/me/invitations/:invitationUid/viewed')
ON DUPLICATE KEY UPDATE `permissionName`=VALUES(`permissionName`), `menuUid`=VALUES(`menuUid`),
  `permissionCode`=VALUES(`permissionCode`), `isAllowed`=TRUE, `isActive`=TRUE, `isDeleted`=FALSE;

-- Seed source: 20260830_add_investor_portfolio_permission.sql
INSERT INTO `permissionMaster`
  (`permissionUid`,`roleUid`,`menuUid`,`permissionName`,`permissionCode`,`httpMethod`,`apiPath`)
VALUES
  (UUID(),'00000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000009',
   'View investor token portfolio','INVESTOR_TOKEN_PORTFOLIO','GET','/api/v1/investments/me/portfolio')
ON DUPLICATE KEY UPDATE `permissionName`=VALUES(`permissionName`), `menuUid`=VALUES(`menuUid`),
  `permissionCode`=VALUES(`permissionCode`), `isAllowed`=TRUE, `isActive`=TRUE, `isDeleted`=FALSE;

-- Seed source: 20260901_add_token_transfer_flow.sql
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

-- Seed source: 20260901_add_token_transfer_flow.sql
INSERT INTO `generalSettings`
  (`settingUid`,`settingKey`,`settingValue`,`valueType`,`settingGroup`,`description`,`isPublic`)
VALUES
  ('21000000-0000-4000-8000-000000000001','TransferWorkerEnabled','true','boolean','transferWorker','Enables ERC-3643 Transfer indexing and intent recovery.',FALSE),
  ('21000000-0000-4000-8000-000000000002','TransferWorkerIntervalSeconds','15','number','transferWorker','Delay between transfer reconciliation runs.',FALSE),
  ('21000000-0000-4000-8000-000000000003','TransferIndexerBlockOffset','1000','number','transferWorker','Maximum sequential blocks per Transfer event query.',FALSE),
  ('21000000-0000-4000-8000-000000000004','TransferIndexerConfirmationBlocks','2','number','transferWorker','Safe-head confirmation buffer for recovered transfers.',FALSE),
  ('21000000-0000-4000-8000-000000000005','TransferIndexerAddressBatchSize','100','number','transferWorker','Token contract addresses per eth_getLogs request.',FALSE),
  ('21000000-0000-4000-8000-000000000006','TransferEventBatchSize','200','number','transferWorker','Stored Transfer events matched per run.',FALSE),
  ('21000000-0000-4000-8000-000000000007','TransferWorkerLeaseSeconds','180','number','transferWorker','Distributed lease duration for transfer indexing.',FALSE),
  ('21000000-0000-4000-8000-000000000008','TransferWorkerBatchSize','50','number','transferWorker','Pending transfer intents reconciled per run.',FALSE),
  ('21000000-0000-4000-8000-000000000009','TransferIndexerMaxChunksPerRun','10','number','transferWorker','Maximum checkpoint chunks processed per run.',FALSE),
  ('21000000-0000-4000-8000-000000000010','TransferExpirationBatchSize','50','number','transferWorker','Abandoned transfer intents expired per run.',FALSE),
  ('21000000-0000-4000-8000-000000000011','TransferIntentExpiryGraceSeconds','180','number','transferWorker','Safe-indexing grace period before an abandoned intent expires.',FALSE)
ON DUPLICATE KEY UPDATE `valueType`=VALUES(`valueType`),`settingGroup`=VALUES(`settingGroup`),
  `description`=VALUES(`description`),`isActive`=TRUE,`isDeleted`=FALSE;

-- Seed source: 20260902_add_current_token_price.sql
INSERT INTO `permissionMaster`
  (`permissionUid`,`roleUid`,`menuUid`,`permissionName`,`permissionCode`,`httpMethod`,`apiPath`)
VALUES
  (UUID(),'00000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000007',
   'Update current token price','TOKEN_UPDATE_CURRENT_PRICE','PATCH','/api/v1/tokens/me/price')
ON DUPLICATE KEY UPDATE
  `permissionName`=VALUES(`permissionName`),`menuUid`=VALUES(`menuUid`),
  `isAllowed`=TRUE,`isActive`=TRUE,`isDeleted`=FALSE;

-- Seed source: 20260904_set_blockchain_confirmations_to_two.sql
INSERT INTO `generalSettings`
  (`settingUid`, `settingKey`, `settingValue`, `valueType`, `settingGroup`, `description`, `isPublic`)
VALUES
  ('20000000-0000-4000-8000-0000000000a4', 'TrexDeploymentConfirmationBlocks', '2', 'number', 'trexDeploymentSync',
    'Confirmation buffer; the runner never processes newer than LatestBlock - this value.', FALSE),
  ('20000000-0000-4000-8000-0000000000b3', 'ClaimRecoveryConfirmationBlocks', '2', 'number', 'claimRecovery',
    'Safe-head confirmation buffer used while recovering claim events.', FALSE),
  ('20000000-0000-4000-8000-0000000000c5', 'ClaimIndexerConfirmationBlocks', '2', 'number', 'claimIndexer',
    'Safe-head confirmation buffer used by the global claim indexer.', FALSE),
  ('20000000-0000-4000-8000-0000000000d5', 'RegistryIndexerConfirmationBlocks', '2', 'number', 'registryIndexer',
    'Safe-head confirmation buffer for registry indexing.', FALSE),
  ('20000000-0000-4000-8000-0000000000e4', 'PurchaseIndexerConfirmationBlocks', '2', 'number', 'purchaseWorker',
    'Safe-head confirmation buffer for payments and mints.', FALSE),
  ('20000000-0000-4000-8000-0000000000f4', 'RedemptionConfirmationBlocks', '2', 'number', 'redemptionWorker',
    'Canonical confirmation threshold for lock, payment, burn, and unlock.', FALSE),
  ('21000000-0000-4000-8000-000000000004', 'TransferIndexerConfirmationBlocks', '2', 'number', 'transferWorker',
    'Safe-head confirmation buffer for recovered transfers.', FALSE)
ON DUPLICATE KEY UPDATE
  `settingValue` = '2',
  `valueType` = 'number',
  `description` = VALUES(`description`),
  `isActive` = TRUE,
  `isDeleted` = FALSE,
  `updatedAt` = UTC_TIMESTAMP();

-- Seed source: 20260905_add_canonical_blockchain_transactions.sql
INSERT INTO `permissionMaster`
  (`permissionUid`,`roleUid`,`menuUid`,`permissionName`,`permissionCode`,`httpMethod`,`apiPath`)
VALUES
  (UUID(),'00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000009','List blockchain transactions','BLOCKCHAIN_TRANSACTION_LIST','GET','/api/v1/investments/transactions'),
  (UUID(),'00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000009','Export blockchain transactions','BLOCKCHAIN_TRANSACTION_EXPORT','GET','/api/v1/investments/transactions/export'),
  (UUID(),'00000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000009','List issuer blockchain transactions','BLOCKCHAIN_TRANSACTION_LIST','GET','/api/v1/investments/transactions'),
  (UUID(),'00000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000009','Export issuer blockchain transactions','BLOCKCHAIN_TRANSACTION_EXPORT','GET','/api/v1/investments/transactions/export'),
  (UUID(),'00000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000009','Confirm issuer redemption transaction','BLOCKCHAIN_TRANSACTION_CONFIRM','POST','/api/v1/investments/transactions/confirm'),
  (UUID(),'00000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000009','Confirm wallet blockchain transaction','BLOCKCHAIN_TRANSACTION_CONFIRM','POST','/api/v1/investments/transactions/confirm'),
  (UUID(),'00000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000009','List investor blockchain transactions','BLOCKCHAIN_TRANSACTION_LIST','GET','/api/v1/investments/transactions'),
  (UUID(),'00000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000009','Export investor blockchain transactions','BLOCKCHAIN_TRANSACTION_EXPORT','GET','/api/v1/investments/transactions/export')
ON DUPLICATE KEY UPDATE `permissionName`=VALUES(`permissionName`),`menuUid`=VALUES(`menuUid`),
  `isAllowed`=TRUE,`isActive`=TRUE,`isDeleted`=FALSE;

-- Seed source: 20260905_add_canonical_blockchain_transactions.sql
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

-- Seed source: 20260905_add_canonical_blockchain_transactions.sql
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

-- Seed source: 20260906_repair_blockchain_transaction_permissions.sql
UPDATE `permissionMaster`
SET `menuUid` = '10000000-0000-4000-8000-000000000009',
    `permissionName` = 'List blockchain transactions',
    `httpMethod` = 'GET',
    `apiPath` = '/api/v1/investments/transactions',
    `isAllowed` = TRUE,
    `isActive` = TRUE,
    `isDeleted` = FALSE,
    `updatedAt` = UTC_TIMESTAMP(3)
WHERE `roleUid` = '00000000-0000-4000-8000-000000000001'
  AND `permissionCode` = 'BLOCKCHAIN_TRANSACTION_LIST';

-- Seed source: 20260906_repair_blockchain_transaction_permissions.sql
UPDATE `permissionMaster`
SET `menuUid` = '10000000-0000-4000-8000-000000000009',
    `permissionName` = 'Export blockchain transactions',
    `httpMethod` = 'GET',
    `apiPath` = '/api/v1/investments/transactions/export',
    `isAllowed` = TRUE,
    `isActive` = TRUE,
    `isDeleted` = FALSE,
    `updatedAt` = UTC_TIMESTAMP(3)
WHERE `roleUid` = '00000000-0000-4000-8000-000000000001'
  AND `permissionCode` = 'BLOCKCHAIN_TRANSACTION_EXPORT';

-- Seed source: 20260906_repair_blockchain_transaction_permissions.sql
UPDATE `permissionMaster`
SET `menuUid` = '10000000-0000-4000-8000-000000000009',
    `permissionName` = 'List issuer blockchain transactions',
    `httpMethod` = 'GET',
    `apiPath` = '/api/v1/investments/transactions',
    `isAllowed` = TRUE,
    `isActive` = TRUE,
    `isDeleted` = FALSE,
    `updatedAt` = UTC_TIMESTAMP(3)
WHERE `roleUid` = '00000000-0000-4000-8000-000000000003'
  AND `permissionCode` = 'BLOCKCHAIN_TRANSACTION_LIST';

-- Seed source: 20260906_repair_blockchain_transaction_permissions.sql
UPDATE `permissionMaster`
SET `menuUid` = '10000000-0000-4000-8000-000000000009',
    `permissionName` = 'Export issuer blockchain transactions',
    `httpMethod` = 'GET',
    `apiPath` = '/api/v1/investments/transactions/export',
    `isAllowed` = TRUE,
    `isActive` = TRUE,
    `isDeleted` = FALSE,
    `updatedAt` = UTC_TIMESTAMP(3)
WHERE `roleUid` = '00000000-0000-4000-8000-000000000003'
  AND `permissionCode` = 'BLOCKCHAIN_TRANSACTION_EXPORT';

-- Seed source: 20260906_repair_blockchain_transaction_permissions.sql
UPDATE `permissionMaster`
SET `menuUid` = '10000000-0000-4000-8000-000000000009',
    `permissionName` = 'Confirm issuer redemption transaction',
    `httpMethod` = 'POST',
    `apiPath` = '/api/v1/investments/transactions/confirm',
    `isAllowed` = TRUE,
    `isActive` = TRUE,
    `isDeleted` = FALSE,
    `updatedAt` = UTC_TIMESTAMP(3)
WHERE `roleUid` = '00000000-0000-4000-8000-000000000003'
  AND `permissionCode` = 'BLOCKCHAIN_TRANSACTION_CONFIRM';

-- Seed source: 20260906_repair_blockchain_transaction_permissions.sql
UPDATE `permissionMaster`
SET `menuUid` = '10000000-0000-4000-8000-000000000009',
    `permissionName` = 'Confirm wallet blockchain transaction',
    `httpMethod` = 'POST',
    `apiPath` = '/api/v1/investments/transactions/confirm',
    `isAllowed` = TRUE,
    `isActive` = TRUE,
    `isDeleted` = FALSE,
    `updatedAt` = UTC_TIMESTAMP(3)
WHERE `roleUid` = '00000000-0000-4000-8000-000000000004'
  AND `permissionCode` = 'BLOCKCHAIN_TRANSACTION_CONFIRM';

-- Seed source: 20260906_repair_blockchain_transaction_permissions.sql
UPDATE `permissionMaster`
SET `menuUid` = '10000000-0000-4000-8000-000000000009',
    `permissionName` = 'List investor blockchain transactions',
    `httpMethod` = 'GET',
    `apiPath` = '/api/v1/investments/transactions',
    `isAllowed` = TRUE,
    `isActive` = TRUE,
    `isDeleted` = FALSE,
    `updatedAt` = UTC_TIMESTAMP(3)
WHERE `roleUid` = '00000000-0000-4000-8000-000000000004'
  AND `permissionCode` = 'BLOCKCHAIN_TRANSACTION_LIST';

-- Seed source: 20260906_repair_blockchain_transaction_permissions.sql
UPDATE `permissionMaster`
SET `menuUid` = '10000000-0000-4000-8000-000000000009',
    `permissionName` = 'Export investor blockchain transactions',
    `httpMethod` = 'GET',
    `apiPath` = '/api/v1/investments/transactions/export',
    `isAllowed` = TRUE,
    `isActive` = TRUE,
    `isDeleted` = FALSE,
    `updatedAt` = UTC_TIMESTAMP(3)
WHERE `roleUid` = '00000000-0000-4000-8000-000000000004'
  AND `permissionCode` = 'BLOCKCHAIN_TRANSACTION_EXPORT';

-- Seed source: 20260906_repair_blockchain_transaction_permissions.sql
INSERT INTO `permissionMaster`
  (`permissionUid`,`roleUid`,`menuUid`,`permissionName`,`permissionCode`,`httpMethod`,`apiPath`,
   `isAllowed`,`isActive`,`isDeleted`)
SELECT UUID(), grantRow.`roleUid`, '10000000-0000-4000-8000-000000000009',
       grantRow.`permissionName`, grantRow.`permissionCode`, grantRow.`httpMethod`, grantRow.`apiPath`,
       TRUE, TRUE, FALSE
FROM (
  SELECT '00000000-0000-4000-8000-000000000001' AS `roleUid`,
         'List blockchain transactions' AS `permissionName`,
         'BLOCKCHAIN_TRANSACTION_LIST' AS `permissionCode`, 'GET' AS `httpMethod`,
         '/api/v1/investments/transactions' AS `apiPath`
  UNION ALL
  SELECT '00000000-0000-4000-8000-000000000001', 'Export blockchain transactions',
         'BLOCKCHAIN_TRANSACTION_EXPORT', 'GET', '/api/v1/investments/transactions/export'
  UNION ALL
  SELECT '00000000-0000-4000-8000-000000000003', 'List issuer blockchain transactions',
         'BLOCKCHAIN_TRANSACTION_LIST', 'GET', '/api/v1/investments/transactions'
  UNION ALL
  SELECT '00000000-0000-4000-8000-000000000003', 'Export issuer blockchain transactions',
         'BLOCKCHAIN_TRANSACTION_EXPORT', 'GET', '/api/v1/investments/transactions/export'
  UNION ALL
  SELECT '00000000-0000-4000-8000-000000000003', 'Confirm issuer redemption transaction',
         'BLOCKCHAIN_TRANSACTION_CONFIRM', 'POST', '/api/v1/investments/transactions/confirm'
  UNION ALL
  SELECT '00000000-0000-4000-8000-000000000004', 'Confirm wallet blockchain transaction',
         'BLOCKCHAIN_TRANSACTION_CONFIRM', 'POST', '/api/v1/investments/transactions/confirm'
  UNION ALL
  SELECT '00000000-0000-4000-8000-000000000004', 'List investor blockchain transactions',
         'BLOCKCHAIN_TRANSACTION_LIST', 'GET', '/api/v1/investments/transactions'
  UNION ALL
  SELECT '00000000-0000-4000-8000-000000000004', 'Export investor blockchain transactions',
         'BLOCKCHAIN_TRANSACTION_EXPORT', 'GET', '/api/v1/investments/transactions/export'
) AS grantRow
WHERE NOT EXISTS (
  SELECT 1
  FROM `permissionMaster` existing
  WHERE existing.`roleUid` = grantRow.`roleUid`
    AND existing.`httpMethod` = grantRow.`httpMethod`
    AND existing.`apiPath` = grantRow.`apiPath`
);

-- Seed source: 20260907_allow_issuer_redemption_confirmation.sql
INSERT INTO `permissionMaster`
  (`permissionUid`,`roleUid`,`menuUid`,`permissionName`,`permissionCode`,`httpMethod`,`apiPath`,
   `isAllowed`,`isActive`,`isDeleted`)
VALUES
  (UUID(),'00000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000009',
   'Confirm issuer redemption transaction','BLOCKCHAIN_TRANSACTION_CONFIRM','POST',
   '/api/v1/investments/transactions/confirm',TRUE,TRUE,FALSE)
ON DUPLICATE KEY UPDATE
  `menuUid`=VALUES(`menuUid`),`permissionName`=VALUES(`permissionName`),
  `permissionCode`=VALUES(`permissionCode`),`isAllowed`=TRUE,`isActive`=TRUE,`isDeleted`=FALSE,
  `updatedAt`=UTC_TIMESTAMP(3);

-- Seed source: 20260916_add_multichain_architecture.sql
INSERT INTO `permissionMaster`
  (`permissionUid`,`roleUid`,`menuUid`,`permissionName`,`permissionCode`,`httpMethod`,`apiPath`)
VALUES
  (UUID(),'00000000-0000-4000-8000-000000000001',NULL,'List chain configurations','CHAIN_ADMIN_LIST','GET','/api/v1/admin/chains'),
  (UUID(),'00000000-0000-4000-8000-000000000001',NULL,'Create chain configuration','CHAIN_ADMIN_CREATE','POST','/api/v1/admin/chains'),
  (UUID(),'00000000-0000-4000-8000-000000000001',NULL,'View chain configuration','CHAIN_ADMIN_GET','GET','/api/v1/admin/chains/:chainUid'),
  (UUID(),'00000000-0000-4000-8000-000000000001',NULL,'Update chain configuration','CHAIN_ADMIN_UPDATE','PATCH','/api/v1/admin/chains/:chainUid'),
  (UUID(),'00000000-0000-4000-8000-000000000001',NULL,'Delete chain configuration','CHAIN_ADMIN_DELETE','DELETE','/api/v1/admin/chains/:chainUid'),
  (UUID(),'00000000-0000-4000-8000-000000000001',NULL,'List payment tokens','PAYMENT_TOKEN_ADMIN_LIST','GET','/api/v1/admin/payment-tokens'),
  (UUID(),'00000000-0000-4000-8000-000000000001',NULL,'Create payment token','PAYMENT_TOKEN_ADMIN_CREATE','POST','/api/v1/admin/payment-tokens'),
  (UUID(),'00000000-0000-4000-8000-000000000001',NULL,'View payment token','PAYMENT_TOKEN_ADMIN_GET','GET','/api/v1/admin/payment-tokens/:paymentTokenUid'),
  (UUID(),'00000000-0000-4000-8000-000000000001',NULL,'Update payment token','PAYMENT_TOKEN_ADMIN_UPDATE','PATCH','/api/v1/admin/payment-tokens/:paymentTokenUid'),
  (UUID(),'00000000-0000-4000-8000-000000000001',NULL,'Delete payment token','PAYMENT_TOKEN_ADMIN_DELETE','DELETE','/api/v1/admin/payment-tokens/:paymentTokenUid'),
  (UUID(),'00000000-0000-4000-8000-000000000003',NULL,'View issuer chain access','CHAIN_ACCESS_LIST','GET','/api/v1/chains/me'),
  (UUID(),'00000000-0000-4000-8000-000000000003',NULL,'Unlock issuer chain','CHAIN_ACCESS_UNLOCK','POST','/api/v1/chains/:chainUid/unlock'),
  (UUID(),'00000000-0000-4000-8000-000000000004',NULL,'View investor chain access','CHAIN_ACCESS_LIST','GET','/api/v1/chains/me'),
  (UUID(),'00000000-0000-4000-8000-000000000004',NULL,'Unlock investor chain','CHAIN_ACCESS_UNLOCK','POST','/api/v1/chains/:chainUid/unlock')
ON DUPLICATE KEY UPDATE `permissionName`=VALUES(`permissionName`),`isAllowed`=TRUE,
  `isActive`=TRUE,`isDeleted`=FALSE;

-- Seed source: 20260917_restrict_network_edits_add_master_images_and_audit.sql
UPDATE `permissionMaster`
SET `isAllowed`=FALSE,`isActive`=FALSE,`isDeleted`=TRUE,`updatedAt`=UTC_TIMESTAMP(3)
WHERE `roleUid`='00000000-0000-4000-8000-000000000001'
  AND `httpMethod`='DELETE' AND `apiPath`='/api/v1/admin/chains/:chainUid';

-- Seed source: 20260917_restrict_network_edits_add_master_images_and_audit.sql
INSERT INTO `permissionMaster`
  (`permissionUid`,`roleUid`,`menuUid`,`permissionName`,`permissionCode`,`httpMethod`,`apiPath`)
VALUES
  (UUID(),'00000000-0000-4000-8000-000000000001',NULL,'Update chain image','CHAIN_ADMIN_IMAGE_UPDATE','PUT','/api/v1/admin/chains/:chainUid/image'),
  (UUID(),'00000000-0000-4000-8000-000000000001',NULL,'View chain audit history','CHAIN_ADMIN_AUDIT_LIST','GET','/api/v1/admin/chains/:chainUid/audits'),
  (UUID(),'00000000-0000-4000-8000-000000000001',NULL,'Update payment token image','PAYMENT_TOKEN_ADMIN_IMAGE_UPDATE','PUT','/api/v1/admin/payment-tokens/:paymentTokenUid/image')
ON DUPLICATE KEY UPDATE `permissionName`=VALUES(`permissionName`),`isAllowed`=TRUE,
  `isActive`=TRUE,`isDeleted`=FALSE;

-- Seed source: 20261007_add_relayed_token_price_updates.sql
INSERT INTO `permissionMaster`
  (`permissionUid`,`roleUid`,`menuUid`,`permissionName`,`permissionCode`,`httpMethod`,`apiPath`)
VALUES
  (UUID(),'00000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000006',
   'Update issuer service wallet','ORGANIZATION_SERVICE_WALLET_UPDATE','PUT','/api/v1/organizations/me/service-wallet'),
  (UUID(),'00000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000007',
   'Prepare relayed token price update','TOKEN_PRICE_RELAY_PREPARE','POST','/api/v1/tokens/me/price-updates/prepare'),
  (UUID(),'00000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000007',
   'Submit relayed token price update','TOKEN_PRICE_RELAY_SUBMIT','POST','/api/v1/tokens/me/price-updates'),
  (UUID(),'00000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000007',
   'View relayed token price update','TOKEN_PRICE_RELAY_VIEW','GET','/api/v1/tokens/me/price-updates/:priceUpdateUid')
ON DUPLICATE KEY UPDATE `permissionName`=VALUES(`permissionName`),`menuUid`=VALUES(`menuUid`),
  `isAllowed`=TRUE,`isActive`=TRUE,`isDeleted`=FALSE,`updatedAt`=UTC_TIMESTAMP(3);

-- Seed source: 20261007_add_relayed_token_price_updates.sql
INSERT INTO `generalSettings`
  (`settingUid`,`settingKey`,`settingValue`,`valueType`,`settingGroup`,`description`,`isPublic`)
VALUES
  (UUID(),'TokenPriceRelaySignatureTtlSeconds','600','number','tokenPriceRelay',
   'Lifetime of an EIP-712 token price message prepared by the backend.',FALSE),
  (UUID(),'TokenPriceRelayRateLimitCount','10','number','tokenPriceRelay',
   'Maximum relayed price-update submissions per service wallet in the configured window.',FALSE),
  (UUID(),'TokenPriceRelayRateLimitWindowSeconds','60','number','tokenPriceRelay',
   'Rolling rate-limit window for relayed price updates.',FALSE),
  (UUID(),'TokenPriceIndexerEnabled','true','boolean','tokenPriceIndexer',
   'Enables indexing of Platform Controller TokenPriceUpdated and ServiceWalletUpdated events.',FALSE),
  (UUID(),'TokenPriceIndexerIntervalSeconds','15','number','tokenPriceIndexer',
   'Delay between Platform Controller event indexer runs.',FALSE),
  (UUID(),'TokenPriceIndexerBlockOffset','1000','number','tokenPriceIndexer',
   'Maximum blocks processed per Platform Controller event-indexer chunk.',FALSE),
  (UUID(),'TokenPriceIndexerLeaseSeconds','180','number','tokenPriceIndexer',
   'Distributed lease duration for the Platform Controller event indexer.',FALSE),
  (UUID(),'TokenPriceIndexerMaxChunksPerRun','10','number','tokenPriceIndexer',
   'Maximum chunks processed by the Platform Controller event indexer per run.',FALSE),
  (UUID(),'TokenPriceIndexerReorgLookbackBlocks','100','number','tokenPriceIndexer',
   'Checkpoint rewind distance when a Platform Controller block becomes non-canonical.',FALSE)
ON DUPLICATE KEY UPDATE `valueType`=VALUES(`valueType`),`settingGroup`=VALUES(`settingGroup`),
  `description`=VALUES(`description`),`isActive`=TRUE,`isDeleted`=FALSE,`updatedAt`=UTC_TIMESTAMP(3);

-- Seed source: 20261008_add_issuer_api_keys.sql
INSERT INTO `permissionMaster`
  (`permissionUid`,`roleUid`,`menuUid`,`permissionName`,`permissionCode`,`httpMethod`,`apiPath`)
VALUES
  (UUID(),'00000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000006',
   'Create issuer API key','ISSUER_API_KEY_CREATE','POST','/api/v1/organizations/me/api-keys'),
  (UUID(),'00000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000006',
   'List issuer API keys','ISSUER_API_KEY_LIST','GET','/api/v1/organizations/me/api-keys'),
  (UUID(),'00000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000006',
   'Revoke issuer API key','ISSUER_API_KEY_REVOKE','DELETE','/api/v1/organizations/me/api-keys/:issuerApiKeyUid'),
  (UUID(),'00000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000006',
   'Rotate issuer API key','ISSUER_API_KEY_ROTATE','POST','/api/v1/organizations/me/api-keys/:issuerApiKeyUid/rotate')
ON DUPLICATE KEY UPDATE `permissionName`=VALUES(`permissionName`),`menuUid`=VALUES(`menuUid`),
  `isAllowed`=TRUE,`isActive`=TRUE,`isDeleted`=FALSE,`updatedAt`=UTC_TIMESTAMP(3);

-- Seed source: 20261009_harden_issuer_api_key_limits.sql
INSERT INTO `generalSettings`
  (`settingUid`,`settingKey`,`settingValue`,`valueType`,`settingGroup`,`description`,`isPublic`)
VALUES
  (UUID(),'IssuerApiKeyMaxActive','5','number','tokenPriceRelay','Maximum non-expired active API keys per issuer.',FALSE),
  (UUID(),'TokenPriceApiReadRateLimitCount','60','number','tokenPriceRelay','Shared issuer request budget for price prepare, status and submit attempts.',FALSE),
  (UUID(),'TokenPriceApiReadRateLimitWindowSeconds','60','number','tokenPriceRelay','Rolling window for the shared issuer price API request budget.',FALSE)
ON DUPLICATE KEY UPDATE `description`=VALUES(`description`),`updatedAt`=UTC_TIMESTAMP(3);

-- Seed source: 20261010_add_token_price_history_sources.sql
INSERT INTO `permissionMaster`
  (`permissionUid`,`roleUid`,`menuUid`,`permissionName`,`permissionCode`,`httpMethod`,`apiPath`)
VALUES (UUID(),'00000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000007',
  'View token price history','TOKEN_PRICE_HISTORY_LIST','GET','/api/v1/tokens/me/price-history')
ON DUPLICATE KEY UPDATE `permissionName`=VALUES(`permissionName`),`isAllowed`=TRUE,
  `isActive`=TRUE,`isDeleted`=FALSE,`updatedAt`=UTC_TIMESTAMP(3);

-- Seed source: 20261011_add_admin_platform_views_and_team_notifications.sql
INSERT INTO permissionMaster (permissionUid,roleUid,menuUid,permissionName,permissionCode,httpMethod,apiPath)
SELECT UUID(),'00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000005',
  p.code,p.code,p.method,p.path FROM (
  SELECT 'ADMIN_KEY_SETTINGS_READ' AS code,'GET' AS method,'/api/v1/admin/issuer-api-key-settings' AS path
  UNION ALL SELECT 'ADMIN_KEY_SETTINGS_UPDATE','PATCH','/api/v1/admin/issuer-api-key-settings'
  UNION ALL SELECT 'ADMIN_NOTIFICATION_SETTINGS_READ','GET','/api/v1/admin/notification-settings'
  UNION ALL SELECT 'ADMIN_NOTIFICATION_SETTINGS_UPDATE','PATCH','/api/v1/admin/notification-settings'
  UNION ALL SELECT 'ADMIN_INVESTORS_LIST','GET','/api/v1/admin/investors'
  UNION ALL SELECT 'ADMIN_INVESTOR_VIEW','GET','/api/v1/admin/investors/:userUid'
  UNION ALL SELECT 'ADMIN_INVESTOR_CHAINS','GET','/api/v1/admin/investors/:userUid/chains'
  UNION ALL SELECT 'ADMIN_INVESTOR_INVESTMENTS','GET','/api/v1/admin/investors/:userUid/invested-tokens'
  UNION ALL SELECT 'ADMIN_INVESTOR_APPLICATIONS','GET','/api/v1/admin/investors/:userUid/applications'
  UNION ALL SELECT 'ADMIN_TOKENS_LIST','GET','/api/v1/admin/tokens'
  UNION ALL SELECT 'ADMIN_APPLICATIONS_LIST','GET','/api/v1/admin/investor-applications'
) p
ON DUPLICATE KEY UPDATE permissionName=VALUES(permissionName),isAllowed=TRUE,isActive=TRUE,isDeleted=FALSE;

-- Seed source: 20261012_add_investor_token_price_history_permission.sql
INSERT INTO `permissionMaster`
  (`permissionUid`,`roleUid`,`menuUid`,`permissionName`,`permissionCode`,`httpMethod`,`apiPath`)
VALUES (UUID(),'00000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000007',
  'View token price history','TOKEN_PRICE_HISTORY_LIST','GET','/api/v1/tokens/me/price-history')
ON DUPLICATE KEY UPDATE `permissionName`=VALUES(`permissionName`),`isAllowed`=TRUE,
  `isActive`=TRUE,`isDeleted`=FALSE,`updatedAt`=UTC_TIMESTAMP(3);

-- Seed source: 20261013_add_direct_price_intents.sql
INSERT INTO `permissionMaster`
 (`permissionUid`,`roleUid`,`menuUid`,`permissionName`,`permissionCode`,`httpMethod`,`apiPath`)
VALUES (UUID(),'00000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000007',
 'Prepare direct token price update','TOKEN_PRICE_DIRECT_PREPARE','POST','/api/v1/tokens/me/price/prepare')
ON DUPLICATE KEY UPDATE `isAllowed`=TRUE,`isActive`=TRUE,`isDeleted`=FALSE;

-- Seed source: 20261013_add_direct_price_intents.sql
INSERT INTO `permissionMaster`
 (`permissionUid`,`roleUid`,`menuUid`,`permissionName`,`permissionCode`,`httpMethod`,`apiPath`)
VALUES (UUID(),'00000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000007',
 'Cancel unsigned token price update','TOKEN_PRICE_DIRECT_CANCEL','POST','/api/v1/tokens/me/price/:priceUpdateUid/cancel')
ON DUPLICATE KEY UPDATE `isAllowed`=TRUE,`isActive`=TRUE,`isDeleted`=FALSE;

-- Seed source: 20261015_add_price_recovery_permission.sql
INSERT INTO `permissionMaster`
 (`permissionUid`,`roleUid`,`menuUid`,`permissionName`,`permissionCode`,`httpMethod`,`apiPath`)
VALUES (UUID(),'00000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000007',
 'Recover manual token price update','TOKEN_PRICE_DIRECT_RETRY','POST','/api/v1/tokens/me/price/:priceUpdateUid/retry')
ON DUPLICATE KEY UPDATE `isAllowed`=TRUE,`isActive`=TRUE,`isDeleted`=FALSE;

-- Seed source: 20261015_expire_manual_price_requests.sql
INSERT INTO `generalSettings`
 (`settingUid`,`settingKey`,`settingValue`,`valueType`,`settingGroup`,`description`,`isPublic`)
VALUES (UUID(),'TokenPriceManualPendingExpirySeconds','1800','number','tokenPriceRelay',
 'Timeout for manual pending price intents without a saved hash. Late verified events can still confirm them.',FALSE)
ON DUPLICATE KEY UPDATE `description`=VALUES(`description`);

-- Seed source: 20261015_expire_manual_price_requests.sql
UPDATE `permissionMaster` SET `isAllowed`=FALSE
WHERE `permissionCode`='TOKEN_PRICE_DIRECT_RETRY';

-- Seed source: 20261016_admin_application_document_download.sql
INSERT INTO permissionMaster (permissionUid,roleUid,menuUid,permissionName,permissionCode,httpMethod,apiPath)
VALUES (UUID(),'00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000005',
 'Download application submission document','ADMIN_APPLICATION_DOCUMENT_DOWNLOAD','GET',
 '/api/v1/admin/investor-applications/:interestUid/documents/:documentUid/download')
ON DUPLICATE KEY UPDATE isAllowed=TRUE,isActive=TRUE,isDeleted=FALSE;

-- Seed source: 20261016_admin_token_details_and_application_history.sql
INSERT INTO permissionMaster (permissionUid,roleUid,menuUid,permissionName,permissionCode,httpMethod,apiPath)
SELECT UUID(),'00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000005',
  p.code,p.code,'GET',p.path FROM (
  SELECT 'ADMIN_TOKEN_DETAILS' AS code,'/api/v1/admin/tokens/:tokenUid' AS path
  UNION ALL SELECT 'ADMIN_APPLICATION_HISTORY','/api/v1/admin/investor-applications/:interestUid/history'
) p
ON DUPLICATE KEY UPDATE isAllowed=TRUE,isActive=TRUE,isDeleted=FALSE;

-- Seed source: 20261021_admin_token_price_history.sql
INSERT INTO permissionMaster (permissionUid,roleUid,menuUid,permissionName,permissionCode,httpMethod,apiPath)
VALUES (UUID(),'00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000005',
  'View admin token price history','ADMIN_TOKEN_PRICE_HISTORY','GET','/api/v1/admin/tokens/:tokenUid/price-history')
ON DUPLICATE KEY UPDATE isAllowed=TRUE,isActive=TRUE,isDeleted=FALSE;

-- Seed source: 20261022_api_key_private_ip_setting.sql
INSERT INTO generalSettings (settingUid,settingKey,settingValue,valueType,settingGroup,description,isPublic)
VALUES (UUID(),'IssuerApiKeyAllowPrivateIps','false','boolean','issuerApiKey',
  'Allow exact private IPv4 and IPv6 addresses in issuer API key allowlists for LAN testing',FALSE)
ON DUPLICATE KEY UPDATE description=VALUES(description);

-- Seed source: 20261022_issuer_api_key_policies.sql
INSERT INTO generalSettings (settingUid,settingKey,settingValue,valueType,settingGroup,description,isPublic)
VALUES
 (UUID(),'IssuerApiKeyCooldownMinSeconds','30','number','issuerApiKey','Minimum configured price cooldown in seconds',FALSE),
 (UUID(),'IssuerApiKeyCooldownMaxSeconds','2592000','number','issuerApiKey','Maximum configured price cooldown in seconds',FALSE),
 (UUID(),'IssuerApiKeyAllowedIpsMin','1','number','issuerApiKey','Minimum public IP addresses per key',FALSE),
 (UUID(),'IssuerApiKeyAllowedIpsMax','3','number','issuerApiKey','Maximum public IP addresses per key',FALSE)
ON DUPLICATE KEY UPDATE description=VALUES(description);

-- Seed source: 20261022_issuer_api_key_policies.sql
INSERT INTO permissionMaster (permissionUid,roleUid,menuUid,permissionName,permissionCode,httpMethod,apiPath)
VALUES
 (UUID(),'00000000-0000-4000-8000-000000000003',NULL,'Update API key policy','ISSUER_API_KEY_POLICY_UPDATE','PUT','/api/v1/organizations/me/api-keys/:issuerApiKeyUid/policy'),
 (UUID(),'00000000-0000-4000-8000-000000000003',NULL,'View API key policy limits','ISSUER_API_KEY_POLICY_LIMITS','GET','/api/v1/organizations/me/api-key-policy-options')
ON DUPLICATE KEY UPDATE isAllowed=TRUE,isActive=TRUE,isDeleted=FALSE;

-- Public application defaults and verification notification recipients.
INSERT INTO `generalSettings`
  (`settingUid`, `settingKey`, `settingValue`, `valueType`, `settingGroup`, `description`, `isPublic`)
VALUES
  ('20000000-0000-4000-8000-000000000001', 'application.displayName', 'T-REX Capital Market', 'string', 'application', 'Public application display name.', TRUE),
  ('20000000-0000-4000-8000-000000000002', 'application.maintenanceMode', 'false', 'boolean', 'application', 'Whether the frontend should display maintenance mode.', TRUE),
  ('20000000-0000-4000-8000-000000000003', 'security.supportEmail', 'support@example.com', 'string', 'security', 'Public support contact address.', TRUE)
ON DUPLICATE KEY UPDATE `settingValue` = VALUES(`settingValue`), `description` = VALUES(`description`);

INSERT INTO generalSettings (settingUid,settingKey,settingValue,valueType,settingGroup,description,isPublic)
VALUES (UUID(),'TeamNotificationEmails','["hiren.unblock@gmail.com"]','json','notifications',
  'Team recipients notified after a new issuer or investor verifies email. Empty array pauses delivery.',FALSE)
ON DUPLICATE KEY UPDATE description=VALUES(description);
