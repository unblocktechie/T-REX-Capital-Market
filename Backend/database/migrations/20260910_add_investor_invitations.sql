-- Issuer-to-investor token invitations (MySQL 8+).
-- One durable invitation per issuer organization + token + investor. Email delivery is tracked
-- separately so failed delivery can retry the same row without creating duplicate invitations.
-- No foreign keys; camelCase naming; UTC timestamps.

USE `trexCapitalMarket`;
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS `investorInvitation` (
  `invitationUid` CHAR(36) NOT NULL,
  `organizationUid` CHAR(36) NOT NULL,
  `tokenUid` CHAR(36) NOT NULL,
  `issuerUserUid` CHAR(36) NOT NULL,
  `investorUid` CHAR(36) NOT NULL,
  `investorUserUid` CHAR(36) NOT NULL,
  `status` ENUM('PENDING','SENT','VIEWED') NOT NULL DEFAULT 'PENDING',
  `emailStatus` ENUM('PENDING','PROCESSING','SENT','FAILED') NOT NULL DEFAULT 'PENDING',
  `emailAttempts` INT UNSIGNED NOT NULL DEFAULT 0,
  `emailMessageId` VARCHAR(255) NULL,
  `emailClaimedAt` DATETIME(3) NULL,
  `lastEmailError` VARCHAR(2000) NULL,
  `sentAt` DATETIME(3) NULL,
  `viewedAt` DATETIME(3) NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT TRUE,
  `isDeleted` BOOLEAN NOT NULL DEFAULT FALSE,
  `createdAt` DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`invitationUid`),
  UNIQUE KEY `ukInvestorInvitation` (`organizationUid`, `tokenUid`, `investorUid`),
  KEY `idxInvestorInvitationIssuer` (`issuerUserUid`, `tokenUid`, `status`, `isDeleted`),
  KEY `idxInvestorInvitationInvestor` (`investorUid`, `status`, `sentAt`, `isDeleted`),
  KEY `idxInvestorInvitationEmail` (`emailStatus`, `emailClaimedAt`)
) ENGINE=InnoDB;

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

-- Manual rollback (forward-only migration convention):
-- DELETE FROM `permissionMaster` WHERE `permissionCode` IN
--   ('ISSUER_INVESTOR_LIST','ISSUER_INVESTOR_INVITE','INVESTOR_INVITATION_LIST',
--    'INVESTOR_INVITATION_VIEW','INVESTOR_INVITATION_MARK_VIEWED');
-- DROP TABLE IF EXISTS `investorInvitation`;
