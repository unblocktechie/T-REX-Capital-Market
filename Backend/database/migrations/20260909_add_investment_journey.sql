-- Investment journey (MySQL 8+)
-- 1) Adds claimTopicCode (KYC / ACCREDITED_INVESTOR) to the investor document type master
--    and to uploaded investor documents, so we can tell whether an investor holds a
--    document for each claim topic an issuer requires on a token.
-- 2) Adds tokenInvestmentInterest (investor "submit interest" -> pending request).
-- 3) Seeds the Investments menu + admin/investor/issuer permissions for the new routes.
-- Idempotent, no foreign keys, camelCase, UTC. Safe to re-run.

USE `trexCapitalMarket`;
SET time_zone = '+00:00';

-- claimTopicCode on the investor document type master.
SET @hasTypeClaim := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'investorDocumentTypeMaster' AND COLUMN_NAME = 'claimTopicCode');
SET @sql := IF(@hasTypeClaim = 0,
  'ALTER TABLE `investorDocumentTypeMaster` ADD COLUMN `claimTopicCode` VARCHAR(80) NULL AFTER `documentCategory`', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- claimTopicCode on uploaded investor documents.
SET @hasDocClaim := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'investorDocument' AND COLUMN_NAME = 'claimTopicCode');
SET @sql := IF(@hasDocClaim = 0,
  'ALTER TABLE `investorDocument` ADD COLUMN `claimTopicCode` VARCHAR(80) NULL AFTER `documentCategory`', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @hasDocClaimIdx := (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'investorDocument' AND INDEX_NAME = 'idxInvestorDocumentClaimTopic');
SET @sql := IF(@hasDocClaimIdx = 0,
  'ALTER TABLE `investorDocument` ADD INDEX `idxInvestorDocumentClaimTopic` (`investorUid`, `claimTopicCode`, `isActive`, `isDeleted`)', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- Map documentCategory -> claim topic code (matches claimTopicMaster.claimTopicCode).
UPDATE `investorDocumentTypeMaster`
  SET `claimTopicCode` = CASE `documentCategory` WHEN 'kyc' THEN 'KYC' ELSE 'ACCREDITED_INVESTOR' END
  WHERE `claimTopicCode` IS NULL OR `claimTopicCode` = '';
UPDATE `investorDocument`
  SET `claimTopicCode` = CASE `documentCategory` WHEN 'kyc' THEN 'KYC' ELSE 'ACCREDITED_INVESTOR' END
  WHERE `claimTopicCode` IS NULL OR `claimTopicCode` = '';

-- Investor "submit interest" pending requests, one active per (token, investor).
CREATE TABLE IF NOT EXISTS `tokenInvestmentInterest` (
  `interestUid` CHAR(36) NOT NULL,
  `tokenUid` CHAR(36) NOT NULL,
  `organizationUid` CHAR(36) NOT NULL,
  `investorUid` CHAR(36) NOT NULL,
  `investorUserUid` CHAR(36) NOT NULL,
  `walletAddress` VARCHAR(42) NULL,
  `status` ENUM('pending', 'approved', 'rejected', 'cancelled') NOT NULL DEFAULT 'pending',
  `note` VARCHAR(500) NULL,
  `submittedAt` DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  `decisionAt` DATETIME(3) NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT TRUE,
  `isDeleted` BOOLEAN NOT NULL DEFAULT FALSE,
  `createdAt` DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`interestUid`),
  UNIQUE KEY `ukTokenInvestmentInterest` (`tokenUid`, `investorUid`),
  KEY `idxTokenInvestmentInterestOrg` (`organizationUid`, `status`, `isDeleted`),
  KEY `idxTokenInvestmentInterestToken` (`tokenUid`, `status`, `isDeleted`),
  KEY `idxTokenInvestmentInterestInvestor` (`investorUid`, `isDeleted`)
) ENGINE=InnoDB;

-- Investments menu.
INSERT INTO `menuMaster` (`menuUid`, `menuName`, `menuCode`, `routePath`, `icon`, `displayOrder`)
VALUES
  ('10000000-0000-4000-8000-000000000009', 'Investments', 'INVESTMENTS', '/investments', 'trending-up', 90)
ON DUPLICATE KEY UPDATE `menuName` = VALUES(`menuName`), `routePath` = VALUES(`routePath`), `isActive` = TRUE;

-- Permissions. Roles: 001 Super Admin, 003 Issuer, 004 Investor.
INSERT INTO `permissionMaster`
  (`permissionUid`, `roleUid`, `menuUid`, `permissionName`, `permissionCode`, `httpMethod`, `apiPath`)
VALUES
  -- Marketplace list/details/image: admin + investor.
  (UUID(), '00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000009', 'List investment tokens (admin)', 'ADMIN_INVESTMENT_TOKEN_LIST', 'GET', '/api/v1/investments/tokens'),
  (UUID(), '00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000009', 'View investment token (admin)', 'ADMIN_INVESTMENT_TOKEN_VIEW', 'GET', '/api/v1/investments/tokens/:tokenUid'),
  (UUID(), '00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000009', 'View investment token image (admin)', 'ADMIN_INVESTMENT_TOKEN_IMAGE', 'GET', '/api/v1/investments/tokens/:tokenUid/image'),
  (UUID(), '00000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000009', 'List investment tokens', 'INVESTMENT_TOKEN_LIST', 'GET', '/api/v1/investments/tokens'),
  (UUID(), '00000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000009', 'View investment token', 'INVESTMENT_TOKEN_VIEW', 'GET', '/api/v1/investments/tokens/:tokenUid'),
  (UUID(), '00000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000009', 'View investment token image', 'INVESTMENT_TOKEN_IMAGE', 'GET', '/api/v1/investments/tokens/:tokenUid/image'),
  -- Investor journey.
  (UUID(), '00000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000009', 'View token required documents', 'INVESTMENT_REQUIRED_DOCUMENTS', 'GET', '/api/v1/investments/tokens/:tokenUid/required-documents'),
  (UUID(), '00000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000009', 'Submit investment interest', 'INVESTMENT_SUBMIT_INTEREST', 'POST', '/api/v1/investments/tokens/:tokenUid/interest'),
  (UUID(), '00000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000009', 'List my investment interests', 'INVESTMENT_MY_INTERESTS', 'GET', '/api/v1/investments/me/interests'),
  -- Issuer review of interests.
  (UUID(), '00000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000009', 'List investment interests (issuer)', 'ISSUER_INVESTMENT_INTEREST_LIST', 'GET', '/api/v1/investments/issuer/interests'),
  (UUID(), '00000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000009', 'View investment interest (issuer)', 'ISSUER_INVESTMENT_INTEREST_VIEW', 'GET', '/api/v1/investments/issuer/interests/:interestUid'),
  (UUID(), '00000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000009', 'Download interest investor document (issuer)', 'ISSUER_INVESTMENT_INTEREST_DOC', 'GET', '/api/v1/investments/issuer/interests/:interestUid/documents/:documentUid/download')
ON DUPLICATE KEY UPDATE
  `permissionName` = VALUES(`permissionName`),
  `menuUid` = VALUES(`menuUid`),
  `isAllowed` = TRUE,
  `isActive` = TRUE,
  `isDeleted` = FALSE;

-- ---------------------------------------------------------------------------
-- Rollback (manual; forward-only convention):
-- DELETE FROM `permissionMaster` WHERE `permissionCode` IN (
--   'ADMIN_INVESTMENT_TOKEN_LIST','ADMIN_INVESTMENT_TOKEN_VIEW','ADMIN_INVESTMENT_TOKEN_IMAGE',
--   'INVESTMENT_TOKEN_LIST','INVESTMENT_TOKEN_VIEW','INVESTMENT_TOKEN_IMAGE',
--   'INVESTMENT_REQUIRED_DOCUMENTS','INVESTMENT_SUBMIT_INTEREST','INVESTMENT_MY_INTERESTS',
--   'ISSUER_INVESTMENT_INTEREST_LIST','ISSUER_INVESTMENT_INTEREST_VIEW','ISSUER_INVESTMENT_INTEREST_DOC');
-- DELETE FROM `menuMaster` WHERE `menuCode` = 'INVESTMENTS';
-- DROP TABLE IF EXISTS `tokenInvestmentInterest`;
-- ALTER TABLE `investorDocument` DROP COLUMN `claimTopicCode`;
-- ALTER TABLE `investorDocumentTypeMaster` DROP COLUMN `claimTopicCode`;
