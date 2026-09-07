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
  ('10000000-0000-4000-8000-000000000005', 'Settings', 'GENERAL_SETTINGS', '/settings', 'settings', 50)
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
  (UUID(), '00000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000003', 'View menu', 'MENU_VIEW', 'GET', '/api/v1/menus/:menuUid')
ON DUPLICATE KEY UPDATE `permissionName` = VALUES(`permissionName`), `menuUid` = VALUES(`menuUid`), `isAllowed` = TRUE, `isActive` = TRUE, `isDeleted` = FALSE;

INSERT INTO `generalSettings`
  (`settingUid`, `settingKey`, `settingValue`, `valueType`, `settingGroup`, `description`, `isPublic`)
VALUES
  ('20000000-0000-4000-8000-000000000001', 'application.displayName', 'T-REX Capital Market', 'string', 'application', 'Public application display name.', TRUE),
  ('20000000-0000-4000-8000-000000000002', 'application.maintenanceMode', 'false', 'boolean', 'application', 'Whether the frontend should display maintenance mode.', TRUE),
  ('20000000-0000-4000-8000-000000000003', 'security.supportEmail', 'support@example.com', 'string', 'security', 'Public support contact address.', TRUE)
ON DUPLICATE KEY UPDATE `settingValue` = VALUES(`settingValue`), `description` = VALUES(`description`);
