-- Mutable issuer-owned token price. Initial launch price remains immutable after deployment.
-- Existing rows start with currentTokenPrice equal to initialTokenPrice.

USE `trexCapitalMarket`;
SET time_zone = '+00:00';

ALTER TABLE `tokenMaster`
  ADD COLUMN `currentTokenPrice` DECIMAL(36,18) NULL AFTER `initialTokenPrice`;

UPDATE `tokenMaster`
SET `currentTokenPrice` = `initialTokenPrice`
WHERE `currentTokenPrice` IS NULL AND `initialTokenPrice` IS NOT NULL;

ALTER TABLE `tokenTransfer`
  ADD COLUMN `tokenPrice` DECIMAL(65,18) NULL AFTER `tokenDecimals`;

UPDATE `tokenTransfer` transfer
INNER JOIN `tokenMaster` token ON token.`tokenUid` = transfer.`tokenUid`
SET transfer.`tokenPrice` = COALESCE(token.`currentTokenPrice`, token.`initialTokenPrice`)
WHERE transfer.`tokenPrice` IS NULL;

ALTER TABLE `tokenTransfer`
  MODIFY COLUMN `tokenPrice` DECIMAL(65,18) NOT NULL;

INSERT INTO `permissionMaster`
  (`permissionUid`,`roleUid`,`menuUid`,`permissionName`,`permissionCode`,`httpMethod`,`apiPath`)
VALUES
  (UUID(),'00000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000007',
   'Update current token price','TOKEN_UPDATE_CURRENT_PRICE','PATCH','/api/v1/tokens/me/price')
ON DUPLICATE KEY UPDATE
  `permissionName`=VALUES(`permissionName`),`menuUid`=VALUES(`menuUid`),
  `isAllowed`=TRUE,`isActive`=TRUE,`isDeleted`=FALSE;
