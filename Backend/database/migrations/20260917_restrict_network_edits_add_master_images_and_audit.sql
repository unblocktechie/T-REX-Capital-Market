-- Restrict network mutation to operational fields, add master images, and retain an
-- append-only audit trail for every chainMaster API mutation.
-- MySQL 8+, UTC timestamps, camelCase columns, no foreign keys.

USE `trexCapitalMarket`;
SET time_zone = '+00:00';

ALTER TABLE `chainMaster`
  ADD COLUMN `imageOriginalFileName` VARCHAR(255) NULL AFTER `explorerUrl`,
  ADD COLUMN `imageStorageKey` VARCHAR(255) NULL AFTER `imageOriginalFileName`,
  ADD COLUMN `imageMimeType` VARCHAR(50) NULL AFTER `imageStorageKey`,
  ADD COLUMN `imageFileSize` INT UNSIGNED NULL AFTER `imageMimeType`,
  ADD COLUMN `imageWidth` SMALLINT UNSIGNED NULL AFTER `imageFileSize`,
  ADD COLUMN `imageHeight` SMALLINT UNSIGNED NULL AFTER `imageWidth`,
  ADD COLUMN `imageChecksumSha256` CHAR(64) NULL AFTER `imageHeight`,
  ADD COLUMN `imageVirusScanStatus` ENUM('notConfigured','clean') NULL AFTER `imageChecksumSha256`;

ALTER TABLE `paymentTokenMaster`
  ADD COLUMN `imageOriginalFileName` VARCHAR(255) NULL AFTER `explorerUrl`,
  ADD COLUMN `imageStorageKey` VARCHAR(255) NULL AFTER `imageOriginalFileName`,
  ADD COLUMN `imageMimeType` VARCHAR(50) NULL AFTER `imageStorageKey`,
  ADD COLUMN `imageFileSize` INT UNSIGNED NULL AFTER `imageMimeType`,
  ADD COLUMN `imageWidth` SMALLINT UNSIGNED NULL AFTER `imageFileSize`,
  ADD COLUMN `imageHeight` SMALLINT UNSIGNED NULL AFTER `imageWidth`,
  ADD COLUMN `imageChecksumSha256` CHAR(64) NULL AFTER `imageHeight`,
  ADD COLUMN `imageVirusScanStatus` ENUM('notConfigured','clean') NULL AFTER `imageChecksumSha256`;

CREATE TABLE IF NOT EXISTS `chainMasterAudit` (
  `chainAuditUid` CHAR(36) NOT NULL,
  `chainUid` CHAR(36) NOT NULL,
  `changedByUserUid` CHAR(36) NOT NULL,
  `operation` ENUM('CREATE','UPDATE') NOT NULL,
  `changedFields` JSON NOT NULL,
  `beforeData` JSON NULL,
  `afterData` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  PRIMARY KEY (`chainAuditUid`),
  KEY `idxChainMasterAuditChain` (`chainUid`,`createdAt`),
  KEY `idxChainMasterAuditUser` (`changedByUserUid`,`createdAt`)
) ENGINE=InnoDB;

UPDATE `permissionMaster`
SET `isAllowed`=FALSE,`isActive`=FALSE,`isDeleted`=TRUE,`updatedAt`=UTC_TIMESTAMP(3)
WHERE `roleUid`='00000000-0000-4000-8000-000000000001'
  AND `httpMethod`='DELETE' AND `apiPath`='/api/v1/admin/chains/:chainUid';

INSERT INTO `permissionMaster`
  (`permissionUid`,`roleUid`,`menuUid`,`permissionName`,`permissionCode`,`httpMethod`,`apiPath`)
VALUES
  (UUID(),'00000000-0000-4000-8000-000000000001',NULL,'Update chain image','CHAIN_ADMIN_IMAGE_UPDATE','PUT','/api/v1/admin/chains/:chainUid/image'),
  (UUID(),'00000000-0000-4000-8000-000000000001',NULL,'View chain audit history','CHAIN_ADMIN_AUDIT_LIST','GET','/api/v1/admin/chains/:chainUid/audits'),
  (UUID(),'00000000-0000-4000-8000-000000000001',NULL,'Update payment token image','PAYMENT_TOKEN_ADMIN_IMAGE_UPDATE','PUT','/api/v1/admin/payment-tokens/:paymentTokenUid/image')
ON DUPLICATE KEY UPDATE `permissionName`=VALUES(`permissionName`),`isAllowed`=TRUE,
  `isActive`=TRUE,`isDeleted`=FALSE;
