-- T-REX Capital Market Backend schema (MySQL 8+)
-- All application timestamps are generated in UTC. No foreign keys are intentionally defined.

CREATE DATABASE IF NOT EXISTS `trexCapitalMarket`
  CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
USE `trexCapitalMarket`;
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS `userRole` (
  `roleUid` CHAR(36) NOT NULL,
  `roleName` VARCHAR(80) NOT NULL,
  `description` VARCHAR(500) NULL,
  `isSystem` BOOLEAN NOT NULL DEFAULT FALSE,
  `isActive` BOOLEAN NOT NULL DEFAULT TRUE,
  `isDeleted` BOOLEAN NOT NULL DEFAULT FALSE,
  `createdAt` DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`roleUid`),
  UNIQUE KEY `ukUserRoleRoleName` (`roleName`),
  KEY `idxUserRoleStatus` (`isActive`, `isDeleted`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `userMaster` (
  `userUid` CHAR(36) NOT NULL,
  `roleUid` CHAR(36) NOT NULL,
  `fullName` VARCHAR(120) NOT NULL,
  `email` VARCHAR(254) NOT NULL,
  `passwordHash` VARCHAR(255) NOT NULL,
  `emailVerified` BOOLEAN NOT NULL DEFAULT FALSE,
  `emailVerifiedAt` DATETIME(3) NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT TRUE,
  `isDeleted` BOOLEAN NOT NULL DEFAULT FALSE,
  `lastLoginAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`userUid`),
  UNIQUE KEY `ukUserMasterEmail` (`email`),
  KEY `idxUserMasterRoleUid` (`roleUid`),
  KEY `idxUserMasterStatus` (`isActive`, `isDeleted`),
  KEY `idxUserMasterFullName` (`fullName`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `menuMaster` (
  `menuUid` CHAR(36) NOT NULL,
  `parentMenuUid` CHAR(36) NULL,
  `menuName` VARCHAR(100) NOT NULL,
  `menuCode` VARCHAR(80) NOT NULL,
  `routePath` VARCHAR(255) NULL,
  `icon` VARCHAR(100) NULL,
  `displayOrder` INT UNSIGNED NOT NULL DEFAULT 0,
  `isVisible` BOOLEAN NOT NULL DEFAULT TRUE,
  `isActive` BOOLEAN NOT NULL DEFAULT TRUE,
  `isDeleted` BOOLEAN NOT NULL DEFAULT FALSE,
  `createdAt` DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`menuUid`),
  UNIQUE KEY `ukMenuMasterMenuCode` (`menuCode`),
  KEY `idxMenuMasterParentMenuUid` (`parentMenuUid`),
  KEY `idxMenuMasterOrder` (`displayOrder`, `isActive`, `isDeleted`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `permissionMaster` (
  `permissionUid` CHAR(36) NOT NULL,
  `roleUid` CHAR(36) NOT NULL,
  `menuUid` CHAR(36) NULL,
  `permissionName` VARCHAR(120) NOT NULL,
  `permissionCode` VARCHAR(120) NOT NULL,
  `httpMethod` ENUM('GET', 'POST', 'PUT', 'PATCH', 'DELETE') NOT NULL,
  `apiPath` VARCHAR(255) NOT NULL,
  `isAllowed` BOOLEAN NOT NULL DEFAULT TRUE,
  `isActive` BOOLEAN NOT NULL DEFAULT TRUE,
  `isDeleted` BOOLEAN NOT NULL DEFAULT FALSE,
  `createdAt` DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`permissionUid`),
  UNIQUE KEY `ukPermissionMasterApi` (`roleUid`, `httpMethod`, `apiPath`),
  UNIQUE KEY `ukPermissionMasterCode` (`roleUid`, `permissionCode`),
  KEY `idxPermissionMasterMenuUid` (`menuUid`),
  KEY `idxPermissionMasterLookup` (`roleUid`, `isAllowed`, `isActive`, `isDeleted`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `generalSettings` (
  `settingUid` CHAR(36) NOT NULL,
  `settingKey` VARCHAR(120) NOT NULL,
  `settingValue` TEXT NOT NULL,
  `valueType` ENUM('string', 'number', 'boolean', 'json') NOT NULL DEFAULT 'string',
  `settingGroup` VARCHAR(80) NOT NULL DEFAULT 'application',
  `description` VARCHAR(500) NULL,
  `isPublic` BOOLEAN NOT NULL DEFAULT FALSE,
  `isActive` BOOLEAN NOT NULL DEFAULT TRUE,
  `isDeleted` BOOLEAN NOT NULL DEFAULT FALSE,
  `createdAt` DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`settingUid`),
  UNIQUE KEY `ukGeneralSettingsKey` (`settingKey`),
  KEY `idxGeneralSettingsGroup` (`settingGroup`, `isPublic`, `isActive`, `isDeleted`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `authToken` (
  `tokenUid` CHAR(36) NOT NULL,
  `userUid` CHAR(36) NOT NULL,
  `tokenType` ENUM('emailVerification', 'passwordReset') NOT NULL,
  `tokenHash` CHAR(64) NOT NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  `usedAt` DATETIME(3) NULL,
  `revokedAt` DATETIME(3) NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT TRUE,
  `isDeleted` BOOLEAN NOT NULL DEFAULT FALSE,
  `createdAt` DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`tokenUid`),
  UNIQUE KEY `ukAuthTokenHash` (`tokenHash`),
  KEY `idxAuthTokenLookup` (`userUid`, `tokenType`, `expiresAt`, `usedAt`, `revokedAt`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `entityTypeMaster` (
  `entityTypeUid` CHAR(36) NOT NULL,
  `entityTypeCode` VARCHAR(50) NOT NULL,
  `entityTypeName` VARCHAR(100) NOT NULL,
  `displayOrder` INT UNSIGNED NOT NULL DEFAULT 0,
  `isActive` BOOLEAN NOT NULL DEFAULT TRUE,
  `isDeleted` BOOLEAN NOT NULL DEFAULT FALSE,
  `createdAt` DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`entityTypeUid`),
  UNIQUE KEY `ukEntityTypeMasterCode` (`entityTypeCode`),
  KEY `idxEntityTypeMasterStatus` (`isActive`, `isDeleted`, `displayOrder`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `industryMaster` (
  `industryUid` CHAR(36) NOT NULL,
  `industryCode` VARCHAR(50) NOT NULL,
  `industryName` VARCHAR(120) NOT NULL,
  `displayOrder` INT UNSIGNED NOT NULL DEFAULT 0,
  `isActive` BOOLEAN NOT NULL DEFAULT TRUE,
  `isDeleted` BOOLEAN NOT NULL DEFAULT FALSE,
  `createdAt` DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`industryUid`),
  UNIQUE KEY `ukIndustryMasterCode` (`industryCode`),
  KEY `idxIndustryMasterStatus` (`isActive`, `isDeleted`, `displayOrder`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `documentTypeMaster` (
  `documentTypeUid` CHAR(36) NOT NULL,
  `documentTypeCode` VARCHAR(80) NOT NULL,
  `documentTypeName` VARCHAR(150) NOT NULL,
  `description` VARCHAR(500) NULL,
  `isRequired` BOOLEAN NOT NULL DEFAULT FALSE,
  `displayOrder` INT UNSIGNED NOT NULL DEFAULT 0,
  `isActive` BOOLEAN NOT NULL DEFAULT TRUE,
  `isDeleted` BOOLEAN NOT NULL DEFAULT FALSE,
  `createdAt` DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`documentTypeUid`),
  UNIQUE KEY `ukDocumentTypeMasterCode` (`documentTypeCode`),
  KEY `idxDocumentTypeMasterStatus` (`isRequired`, `isActive`, `isDeleted`, `displayOrder`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `countryMaster` (
  `countryUid` CHAR(36) NOT NULL,
  `countryCode` CHAR(2) NOT NULL,
  `countryName` VARCHAR(120) NOT NULL,
  `phoneCode` VARCHAR(20) NULL,
  `currencyCode` CHAR(3) NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT TRUE,
  `isDeleted` BOOLEAN NOT NULL DEFAULT FALSE,
  `createdAt` DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`countryUid`),
  UNIQUE KEY `ukCountryMasterCode` (`countryCode`),
  KEY `idxCountryMasterName` (`countryName`, `isActive`, `isDeleted`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `stateMaster` (
  `stateUid` CHAR(36) NOT NULL,
  `countryUid` CHAR(36) NOT NULL,
  `stateCode` VARCHAR(20) NOT NULL,
  `stateName` VARCHAR(120) NOT NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT TRUE,
  `isDeleted` BOOLEAN NOT NULL DEFAULT FALSE,
  `createdAt` DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`stateUid`),
  UNIQUE KEY `ukStateMasterCode` (`countryUid`, `stateCode`),
  KEY `idxStateMasterCountryName` (`countryUid`, `stateName`, `isActive`, `isDeleted`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `cityMaster` (
  `cityUid` CHAR(36) NOT NULL,
  `countryUid` CHAR(36) NOT NULL,
  `stateUid` CHAR(36) NOT NULL,
  `cityName` VARCHAR(150) NOT NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT TRUE,
  `isDeleted` BOOLEAN NOT NULL DEFAULT FALSE,
  `createdAt` DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`cityUid`),
  UNIQUE KEY `ukCityMasterName` (`stateUid`, `cityName`),
  KEY `idxCityMasterStateName` (`stateUid`, `cityName`, `isActive`, `isDeleted`),
  KEY `idxCityMasterCountryUid` (`countryUid`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `organizationMaster` (
  `organizationUid` CHAR(36) NOT NULL,
  `userUid` CHAR(36) NOT NULL,
  `legalCompanyName` VARCHAR(200) NULL,
  `entityTypeUid` CHAR(36) NULL,
  `registrationNumber` VARCHAR(100) NULL,
  `streetAddress` VARCHAR(255) NULL,
  `countryUid` CHAR(36) NULL,
  `stateUid` CHAR(36) NULL,
  `cityUid` CHAR(36) NULL,
  `postalCode` VARCHAR(20) NULL,
  `countryOfIncorporationUid` CHAR(36) NULL,
  `dateOfIncorporation` DATE NULL,
  `taxIdentificationNumber` VARCHAR(100) NULL,
  `industryUid` CHAR(36) NULL,
  `businessActivity` TEXT NULL,
  `website` VARCHAR(500) NULL,
  `walletAddress` VARCHAR(42) NULL,
  `currentStep` ENUM('companyInformation', 'jurisdiction', 'beneficialOwners', 'documents', 'completed') NOT NULL DEFAULT 'companyInformation',
  `isDraft` BOOLEAN NOT NULL DEFAULT TRUE,
  `status` ENUM('draft', 'submitted', 'resubmitted', 'underReview', 'approved', 'rejected') NOT NULL DEFAULT 'draft',
  `submittedAt` DATETIME(3) NULL,
  `rejectionReason` TEXT NULL,
  `rejectionCount` TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `canResubmit` BOOLEAN NOT NULL DEFAULT FALSE,
  `isUserNotified` BOOLEAN NOT NULL DEFAULT FALSE,
  `isActive` BOOLEAN NOT NULL DEFAULT TRUE,
  `isDeleted` BOOLEAN NOT NULL DEFAULT FALSE,
  `createdAt` DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`organizationUid`),
  UNIQUE KEY `ukOrganizationMasterUserUid` (`userUid`),
  UNIQUE KEY `ukOrganizationRegistration` (`countryOfIncorporationUid`, `registrationNumber`),
  KEY `idxOrganizationMasterStatus` (`status`, `isDraft`, `isActive`, `isDeleted`),
  KEY `idxOrganizationMasterLocation` (`countryUid`, `stateUid`, `cityUid`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `organizationBeneficialOwner` (
  `beneficialOwnerUid` CHAR(36) NOT NULL,
  `organizationUid` CHAR(36) NOT NULL,
  `fullName` VARCHAR(120) NULL,
  `dateOfBirth` DATE NULL,
  `nationalityCountryUid` CHAR(36) NULL,
  `ownershipPercentage` DECIMAL(5,2) NULL,
  `isPrimary` BOOLEAN NOT NULL DEFAULT FALSE,
  `isActive` BOOLEAN NOT NULL DEFAULT TRUE,
  `isDeleted` BOOLEAN NOT NULL DEFAULT FALSE,
  `createdAt` DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`beneficialOwnerUid`),
  KEY `idxOrganizationBeneficialOwnerOrganization` (`organizationUid`, `isActive`, `isDeleted`),
  KEY `idxOrganizationBeneficialOwnerNationality` (`nationalityCountryUid`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `organizationDocument` (
  `documentUid` CHAR(36) NOT NULL,
  `organizationUid` CHAR(36) NOT NULL,
  `documentTypeUid` CHAR(36) NOT NULL,
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
  UNIQUE KEY `ukOrganizationDocumentStorageKey` (`storageKey`),
  KEY `idxOrganizationDocumentOrganization` (`organizationUid`, `documentTypeUid`, `isActive`, `isDeleted`)
) ENGINE=InnoDB;

INSERT INTO `entityTypeMaster` (`entityTypeUid`, `entityTypeCode`, `entityTypeName`, `displayOrder`)
VALUES
  ('30000000-0000-4000-8000-000000000001', 'LLC', 'Limited Liability Company', 10),
  ('30000000-0000-4000-8000-000000000002', 'CORPORATION', 'Corporation', 20),
  ('30000000-0000-4000-8000-000000000003', 'PARTNERSHIP', 'Partnership', 30),
  ('30000000-0000-4000-8000-000000000004', 'FOUNDATION', 'Foundation', 40),
  ('30000000-0000-4000-8000-000000000005', 'OTHER', 'Other', 50)
ON DUPLICATE KEY UPDATE `entityTypeName` = VALUES(`entityTypeName`), `isActive` = TRUE, `isDeleted` = FALSE;

INSERT INTO `industryMaster` (`industryUid`, `industryCode`, `industryName`, `displayOrder`)
VALUES
  ('31000000-0000-4000-8000-000000000001', 'FINANCIAL_SERVICES', 'Financial Services', 10),
  ('31000000-0000-4000-8000-000000000002', 'TECHNOLOGY', 'Technology', 20),
  ('31000000-0000-4000-8000-000000000003', 'REAL_ESTATE', 'Real Estate', 30),
  ('31000000-0000-4000-8000-000000000004', 'ENERGY', 'Energy', 40),
  ('31000000-0000-4000-8000-000000000005', 'HEALTHCARE', 'Healthcare', 50),
  ('31000000-0000-4000-8000-000000000006', 'OTHER', 'Other', 60)
ON DUPLICATE KEY UPDATE `industryName` = VALUES(`industryName`), `isActive` = TRUE, `isDeleted` = FALSE;

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

INSERT INTO `userRole` (`roleUid`, `roleName`, `description`, `isSystem`, `isActive`)
VALUES
  ('00000000-0000-4000-8000-000000000001', 'Super Administrator', 'Unrestricted platform administration role.', TRUE, TRUE),
  ('00000000-0000-4000-8000-000000000002', 'User', 'Legacy general user role retained for managed accounts.', TRUE, TRUE),
  ('00000000-0000-4000-8000-000000000003', 'Issuer', 'Capital Market issuer account created when signup isIssuer is true.', TRUE, TRUE),
  ('00000000-0000-4000-8000-000000000004', 'Investor', 'Capital Market investor account created when signup isIssuer is false.', TRUE, TRUE)
ON DUPLICATE KEY UPDATE `description` = VALUES(`description`), `isActive` = TRUE;

INSERT INTO `menuMaster` (`menuUid`, `menuName`, `menuCode`, `routePath`, `icon`, `displayOrder`)
VALUES
  ('10000000-0000-4000-8000-000000000001', 'Users', 'USERS', '/users', 'users', 10),
  ('10000000-0000-4000-8000-000000000002', 'Roles', 'ROLES', '/roles', 'shield', 20),
  ('10000000-0000-4000-8000-000000000003', 'Menus', 'MENUS', '/menus', 'menu', 30),
  ('10000000-0000-4000-8000-000000000004', 'Permissions', 'PERMISSIONS', '/permissions', 'key', 40),
  ('10000000-0000-4000-8000-000000000005', 'Settings', 'GENERAL_SETTINGS', '/settings', 'settings', 50),
  ('10000000-0000-4000-8000-000000000006', 'Organization Onboarding', 'ORGANIZATION_ONBOARDING', '/organization', 'building', 60)
ON DUPLICATE KEY UPDATE `menuName` = VALUES(`menuName`), `routePath` = VALUES(`routePath`), `isActive` = TRUE;

-- API-level permissions for the system administrator. Paths intentionally match Express route templates.
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

INSERT INTO `generalSettings`
  (`settingUid`, `settingKey`, `settingValue`, `valueType`, `settingGroup`, `description`, `isPublic`)
VALUES
  ('20000000-0000-4000-8000-000000000001', 'application.displayName', 'T-REX Capital Market', 'string', 'application', 'Public application display name.', TRUE),
  ('20000000-0000-4000-8000-000000000002', 'application.maintenanceMode', 'false', 'boolean', 'application', 'Whether the frontend should display maintenance mode.', TRUE),
  ('20000000-0000-4000-8000-000000000003', 'security.supportEmail', 'support@example.com', 'string', 'security', 'Public support contact address.', TRUE)
ON DUPLICATE KEY UPDATE `settingValue` = VALUES(`settingValue`), `description` = VALUES(`description`);
