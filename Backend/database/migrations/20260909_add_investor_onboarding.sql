-- Investor onboarding (MySQL 8+)
-- Adds the investor KYC/accreditation onboarding flow, mirroring organization onboarding:
--   identityDetails -> identityDocuments -> compliance -> completed
-- Submit sets status directly to 'submitted' (no admin verification step).
-- Follows existing conventions: CHAR(36) UUID keys, camelCase columns, UTC DATETIME(3),
-- soft-delete flags, no foreign keys. Idempotent (safe to re-run).

USE `trexCapitalMarket`;
SET time_zone = '+00:00';

-- Investor document type master with a category so the frontend can render two
-- separate dropdowns (KYC identity documents vs accreditation documents).
CREATE TABLE IF NOT EXISTS `investorDocumentTypeMaster` (
  `documentTypeUid` CHAR(36) NOT NULL,
  `documentTypeCode` VARCHAR(80) NOT NULL,
  `documentTypeName` VARCHAR(150) NOT NULL,
  `documentCategory` ENUM('kyc', 'accredited') NOT NULL,
  `description` VARCHAR(500) NULL,
  `isRequired` BOOLEAN NOT NULL DEFAULT FALSE,
  `displayOrder` INT UNSIGNED NOT NULL DEFAULT 0,
  `isActive` BOOLEAN NOT NULL DEFAULT TRUE,
  `isDeleted` BOOLEAN NOT NULL DEFAULT FALSE,
  `createdAt` DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`documentTypeUid`),
  UNIQUE KEY `ukInvestorDocumentTypeCode` (`documentTypeCode`),
  KEY `idxInvestorDocumentTypeCategory` (`documentCategory`, `isActive`, `isDeleted`, `displayOrder`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `investorMaster` (
  `investorUid` CHAR(36) NOT NULL,
  `userUid` CHAR(36) NOT NULL,
  -- Identity details
  `firstName` VARCHAR(50) NULL,
  `lastName` VARCHAR(50) NULL,
  `dateOfBirth` DATE NULL,
  `gender` ENUM('male', 'female', 'other') NULL,
  `streetAddress` VARCHAR(150) NULL,
  `countryUid` CHAR(36) NULL,
  `stateUid` CHAR(36) NULL,
  `cityUid` CHAR(36) NULL,
  -- Compliance questionnaire
  `sourceOfWealth` VARCHAR(120) NULL,
  `estimatedNetWorth` VARCHAR(60) NULL,
  `annualInvestmentCapacity` VARCHAR(60) NULL,
  `yearsOfExperience` TINYINT UNSIGNED NULL,
  `previousRwaExperience` ENUM('yes', 'no') NULL,
  `rwaExperienceDescription` VARCHAR(600) NULL,
  `accreditationType` ENUM('individual', 'institutional', 'qualified_professional') NULL,
  -- Wallet + generated investor profile reference (no on-chain verification)
  `walletAddress` VARCHAR(42) NULL,
  `profileReference` VARCHAR(60) NULL,
  `onchainIdReference` VARCHAR(120) NULL,
  -- On-chain OnchainID identity result (same shape as organizationMaster)
  `contractAddress` VARCHAR(42) NULL,
  `contractTxnHash` VARCHAR(66) NULL,
  `contractTxnMessage` TEXT NULL,
  -- Flow state
  `currentStep` ENUM('identityDetails', 'identityDocuments', 'compliance', 'completed') NOT NULL DEFAULT 'identityDetails',
  `isDraft` BOOLEAN NOT NULL DEFAULT TRUE,
  `status` ENUM('draft', 'submitted') NOT NULL DEFAULT 'draft',
  -- Only submitted profiles participate in wallet uniqueness. Draft/failed submissions
  -- may retain a wallet without incorrectly reserving it as a registered investor.
  `registeredWalletAddress` VARCHAR(42)
    GENERATED ALWAYS AS (
      CASE
        WHEN `status` = 'submitted' AND `walletAddress` IS NOT NULL AND TRIM(`walletAddress`) <> ''
          THEN LOWER(TRIM(`walletAddress`))
        ELSE NULL
      END
    ) STORED,
  `submittedAt` DATETIME(3) NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT TRUE,
  `isDeleted` BOOLEAN NOT NULL DEFAULT FALSE,
  `createdAt` DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`investorUid`),
  UNIQUE KEY `ukInvestorMasterUserUid` (`userUid`),
  UNIQUE KEY `ukInvestorMasterProfileReference` (`profileReference`),
  UNIQUE KEY `ukInvestorMasterRegisteredWallet` (`registeredWalletAddress`),
  KEY `idxInvestorMasterStatus` (`status`, `isDraft`, `isActive`, `isDeleted`),
  KEY `idxInvestorMasterLocation` (`countryUid`, `stateUid`, `cityUid`)
) ENGINE=InnoDB;

-- Idempotent guard: if an earlier version of this migration created investorMaster with plain
-- string location columns, migrate them to the location-master UID columns. Safe to re-run.
SET @hasCountryUid := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'investorMaster' AND COLUMN_NAME = 'countryUid');
SET @sql := IF(@hasCountryUid = 0,
  'ALTER TABLE `investorMaster` ADD COLUMN `countryUid` CHAR(36) NULL AFTER `streetAddress`', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @hasStateUid := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'investorMaster' AND COLUMN_NAME = 'stateUid');
SET @sql := IF(@hasStateUid = 0,
  'ALTER TABLE `investorMaster` ADD COLUMN `stateUid` CHAR(36) NULL AFTER `countryUid`', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @hasCityUid := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'investorMaster' AND COLUMN_NAME = 'cityUid');
SET @sql := IF(@hasCityUid = 0,
  'ALTER TABLE `investorMaster` ADD COLUMN `cityUid` CHAR(36) NULL AFTER `stateUid`', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @hasOldCity := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'investorMaster' AND COLUMN_NAME = 'city');
SET @sql := IF(@hasOldCity > 0, 'ALTER TABLE `investorMaster` DROP COLUMN `city`', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @hasOldState := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'investorMaster' AND COLUMN_NAME = 'stateProvince');
SET @sql := IF(@hasOldState > 0, 'ALTER TABLE `investorMaster` DROP COLUMN `stateProvince`', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @hasOldCountry := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'investorMaster' AND COLUMN_NAME = 'countryOfResidence');
SET @sql := IF(@hasOldCountry > 0, 'ALTER TABLE `investorMaster` DROP COLUMN `countryOfResidence`', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- On-chain identity result columns (idempotent).
SET @hasContractAddress := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'investorMaster' AND COLUMN_NAME = 'contractAddress');
SET @sql := IF(@hasContractAddress = 0,
  'ALTER TABLE `investorMaster` ADD COLUMN `contractAddress` VARCHAR(42) NULL AFTER `onchainIdReference`', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @hasContractTxnHash := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'investorMaster' AND COLUMN_NAME = 'contractTxnHash');
SET @sql := IF(@hasContractTxnHash = 0,
  'ALTER TABLE `investorMaster` ADD COLUMN `contractTxnHash` VARCHAR(66) NULL AFTER `contractAddress`', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @hasContractTxnMessage := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'investorMaster' AND COLUMN_NAME = 'contractTxnMessage');
SET @sql := IF(@hasContractTxnMessage = 0,
  'ALTER TABLE `investorMaster` ADD COLUMN `contractTxnMessage` TEXT NULL AFTER `contractTxnHash`', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

CREATE TABLE IF NOT EXISTS `investorInvestmentCategory` (
  `investorInvestmentCategoryUid` CHAR(36) NOT NULL,
  `investorUid` CHAR(36) NOT NULL,
  `categoryCode` VARCHAR(40) NOT NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT TRUE,
  `isDeleted` BOOLEAN NOT NULL DEFAULT FALSE,
  `createdAt` DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`investorInvestmentCategoryUid`),
  UNIQUE KEY `ukInvestorInvestmentCategory` (`investorUid`, `categoryCode`),
  KEY `idxInvestorInvestmentCategory` (`investorUid`, `isActive`, `isDeleted`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `investorDocument` (
  `documentUid` CHAR(36) NOT NULL,
  `investorUid` CHAR(36) NOT NULL,
  `documentTypeUid` CHAR(36) NOT NULL,
  `documentCategory` ENUM('kyc', 'accredited') NOT NULL,
  `originalFileName` VARCHAR(255) NOT NULL,
  `storedFileName` VARCHAR(255) NOT NULL,
  `storageKey` VARCHAR(500) NOT NULL,
  `mimeType` VARCHAR(100) NOT NULL,
  `fileSize` BIGINT UNSIGNED NOT NULL,
  `checksumSha256` CHAR(64) NOT NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT TRUE,
  `isDeleted` BOOLEAN NOT NULL DEFAULT FALSE,
  `createdAt` DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`documentUid`),
  UNIQUE KEY `ukInvestorDocumentStorageKey` (`storageKey`),
  KEY `idxInvestorDocumentInvestor` (`investorUid`, `documentCategory`, `isActive`, `isDeleted`),
  KEY `idxInvestorDocumentType` (`documentTypeUid`)
) ENGINE=InnoDB;

-- KYC identity document types.
INSERT INTO `investorDocumentTypeMaster`
  (`documentTypeUid`, `documentTypeCode`, `documentTypeName`, `documentCategory`, `description`, `isRequired`, `displayOrder`)
VALUES
  ('33000000-0000-4000-8000-000000000001', 'PASSPORT', 'Passport', 'kyc', 'Government-issued passport photo page.', TRUE, 10),
  ('33000000-0000-4000-8000-000000000002', 'NATIONAL_ID', 'National ID', 'kyc', 'Valid national identity card.', TRUE, 20),
  ('33000000-0000-4000-8000-000000000003', 'DRIVERS_LICENSE', 'Driver''s License', 'kyc', 'Current government-issued driver''s license.', FALSE, 30),
  -- Accreditation supporting document types.
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

-- Investor onboarding menu.
INSERT INTO `menuMaster` (`menuUid`, `menuName`, `menuCode`, `routePath`, `icon`, `displayOrder`)
VALUES
  ('10000000-0000-4000-8000-000000000008', 'Investor Onboarding', 'INVESTOR_ONBOARDING', '/investor', 'user-check', 80)
ON DUPLICATE KEY UPDATE `menuName` = VALUES(`menuName`), `routePath` = VALUES(`routePath`), `isActive` = TRUE;

-- Investor-role API permissions. Paths match the Express route templates.
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

-- ---------------------------------------------------------------------------
-- Rollback (manual; forward-only convention):
-- DELETE FROM `permissionMaster` WHERE `permissionCode` LIKE 'INVESTOR\\_%';
-- DELETE FROM `menuMaster` WHERE `menuCode` = 'INVESTOR_ONBOARDING';
-- DROP TABLE IF EXISTS `investorDocument`;
-- DROP TABLE IF EXISTS `investorInvestmentCategory`;
-- DROP TABLE IF EXISTS `investorMaster`;
-- DROP TABLE IF EXISTS `investorDocumentTypeMaster`;
