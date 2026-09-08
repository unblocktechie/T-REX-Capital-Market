-- Apply once to an existing T-REX Capital Market database.
-- Adds the issuer token draft flow, claim topics, geographic restrictions, and RBAC permissions.

USE `trexCapitalMarket`;
SET time_zone = '+00:00';

ALTER TABLE `countryMaster`
  ADD COLUMN `numericCode` CHAR(3) NULL AFTER `countryCode`,
  ADD UNIQUE KEY `ukCountryMasterNumericCode` (`numericCode`);

CREATE TABLE IF NOT EXISTS `claimTopicMaster` (
  `claimTopicUid` CHAR(36) NOT NULL,
  `claimTopicCode` VARCHAR(80) NOT NULL,
  `claimTopicName` VARCHAR(120) NOT NULL,
  `description` VARCHAR(500) NULL,
  `value` INT UNSIGNED NOT NULL,
  `displayOrder` INT UNSIGNED NOT NULL DEFAULT 0,
  `isActive` BOOLEAN NOT NULL DEFAULT TRUE,
  `isDeleted` BOOLEAN NOT NULL DEFAULT FALSE,
  `createdAt` DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`claimTopicUid`),
  UNIQUE KEY `ukClaimTopicMasterCode` (`claimTopicCode`),
  UNIQUE KEY `ukClaimTopicMasterValue` (`value`),
  KEY `idxClaimTopicMasterStatus` (`isActive`, `isDeleted`, `displayOrder`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `tokenMaster` (
  `tokenUid` CHAR(36) NOT NULL,
  `organizationUid` CHAR(36) NOT NULL,
  `userUid` CHAR(36) NOT NULL,
  `tokenName` VARCHAR(50) NULL,
  `tokenSymbol` VARCHAR(10) NULL,
  `decimals` TINYINT UNSIGNED NULL,
  `initialTokenPrice` DECIMAL(36,18) NULL,
  `treasuryWalletAddress` VARCHAR(42) NULL,
  `tokenDescription` VARCHAR(2000) NULL,
  `imageOriginalFileName` VARCHAR(255) NULL,
  `imageStorageKey` VARCHAR(255) NULL,
  `imageMimeType` VARCHAR(50) NULL,
  `imageFileSize` INT UNSIGNED NULL,
  `imageWidth` SMALLINT UNSIGNED NULL,
  `imageHeight` SMALLINT UNSIGNED NULL,
  `imageChecksumSha256` CHAR(64) NULL,
  `imageVirusScanStatus` ENUM('notConfigured', 'clean') NOT NULL DEFAULT 'notConfigured',
  `trustedClaimIssuerWalletAddress` VARCHAR(42) NULL,
  `maxInvestors` INT UNSIGNED NULL,
  `maxBalancePerInvestor` DECIMAL(36,18) NULL,
  `countryRestrictionMode` ENUM('allowlist', 'blocklist') NULL,
  `tokenAgentWalletAddress` VARCHAR(42) NULL,
  `identityManagerWalletAddress` VARCHAR(42) NULL,
  `platformAgentWallet` VARCHAR(42) NULL,
  `tokenAddress` VARCHAR(42) NULL,
  `identityRegistryAddress` VARCHAR(42) NULL,
  `identityRegistryStorageAddress` VARCHAR(42) NULL,
  `trustedIssuersRegistryAddress` VARCHAR(42) NULL,
  `claimTopicsRegistryAddress` VARCHAR(42) NULL,
  `modularComplianceAddress` VARCHAR(42) NULL,
  `deployTxHash` VARCHAR(66) NULL,
  `deployedAtBlock` BIGINT UNSIGNED NULL,
  `currentStep` ENUM('tokenInformation', 'claims', 'compliance', 'governance', 'review', 'deployed') NOT NULL DEFAULT 'tokenInformation',
  `isDraft` BOOLEAN NOT NULL DEFAULT TRUE,
  `status` ENUM('draft', 'readyToDeploy', 'deployed', 'deploymentFailed') NOT NULL DEFAULT 'draft',
  `contractAddress` VARCHAR(42) NULL,
  `contractTxnHash` VARCHAR(66) NULL,
  `contractTxnMessage` TEXT NULL,
  `deployedAt` DATETIME(3) NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT TRUE,
  `isDeleted` BOOLEAN NOT NULL DEFAULT FALSE,
  `createdAt` DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`tokenUid`),
  UNIQUE KEY `ukTokenMasterOrganizationUid` (`organizationUid`),
  UNIQUE KEY `ukTokenMasterSymbol` (`tokenSymbol`),
  UNIQUE KEY `ukTokenMasterTokenAddress` (`tokenAddress`),
  UNIQUE KEY `ukTokenMasterDeployTxHash` (`deployTxHash`),
  KEY `idxTokenMasterUserUid` (`userUid`),
  KEY `idxTokenMasterStatus` (`status`, `isActive`, `isDeleted`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `tokenClaimTopic` (
  `tokenClaimTopicUid` CHAR(36) NOT NULL,
  `tokenUid` CHAR(36) NOT NULL,
  `claimTopicUid` CHAR(36) NOT NULL,
  `claimTopicValue` INT UNSIGNED NOT NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT TRUE,
  `isDeleted` BOOLEAN NOT NULL DEFAULT FALSE,
  `createdAt` DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`tokenClaimTopicUid`),
  UNIQUE KEY `ukTokenClaimTopicSelection` (`tokenUid`, `claimTopicUid`),
  KEY `idxTokenClaimTopicValue` (`tokenUid`, `claimTopicValue`, `isActive`, `isDeleted`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `tokenCountryRestriction` (
  `tokenCountryRestrictionUid` CHAR(36) NOT NULL,
  `tokenUid` CHAR(36) NOT NULL,
  `countryUid` CHAR(36) NOT NULL,
  `iso3166NumericCode` CHAR(3) NOT NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT TRUE,
  `isDeleted` BOOLEAN NOT NULL DEFAULT FALSE,
  `createdAt` DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`tokenCountryRestrictionUid`),
  UNIQUE KEY `ukTokenCountryRestrictionSelection` (`tokenUid`, `countryUid`),
  KEY `idxTokenCountryRestrictionCode` (`tokenUid`, `iso3166NumericCode`, `isActive`, `isDeleted`)
) ENGINE=InnoDB;

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

INSERT INTO `menuMaster` (`menuUid`, `menuName`, `menuCode`, `routePath`, `icon`, `displayOrder`)
VALUES ('10000000-0000-4000-8000-000000000007', 'Token Creation', 'TOKEN_CREATION', '/token', 'coins', 70)
ON DUPLICATE KEY UPDATE `menuName` = VALUES(`menuName`), `routePath` = VALUES(`routePath`), `isActive` = TRUE;

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
