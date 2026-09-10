-- Investor portfolio endpoint permission. Idempotent; no schema relationship changes.

USE `trexCapitalMarket`;
SET time_zone = '+00:00';

INSERT INTO `permissionMaster`
  (`permissionUid`,`roleUid`,`menuUid`,`permissionName`,`permissionCode`,`httpMethod`,`apiPath`)
VALUES
  (UUID(),'00000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000009',
   'View investor token portfolio','INVESTOR_TOKEN_PORTFOLIO','GET','/api/v1/investments/me/portfolio')
ON DUPLICATE KEY UPDATE `permissionName`=VALUES(`permissionName`), `menuUid`=VALUES(`menuUid`),
  `permissionCode`=VALUES(`permissionCode`), `isAllowed`=TRUE, `isActive`=TRUE, `isDeleted`=FALSE;

-- Manual rollback:
-- DELETE FROM `permissionMaster` WHERE `permissionCode` = 'INVESTOR_TOKEN_PORTFOLIO';
