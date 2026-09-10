-- Investor-owned token purchase history endpoint permission.

USE `trexCapitalMarket`;
SET time_zone = '+00:00';

INSERT INTO `permissionMaster`
  (`permissionUid`,`roleUid`,`menuUid`,`permissionName`,`permissionCode`,`httpMethod`,`apiPath`)
VALUES
  (UUID(),'00000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000009',
   'List token purchase history','INVESTOR_TOKEN_PURCHASE_HISTORY','GET',
   '/api/v1/investments/tokens/:tokenUid/purchases')
ON DUPLICATE KEY UPDATE `permissionName`=VALUES(`permissionName`),`menuUid`=VALUES(`menuUid`),
  `permissionCode`=VALUES(`permissionCode`),`isAllowed`=TRUE,`isActive`=TRUE,`isDeleted`=FALSE;
