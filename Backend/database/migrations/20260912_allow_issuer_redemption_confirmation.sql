-- Allow the token issuer to submit the hash of the issuer-executed atomic redeem transaction.
-- The API remains observational: the backend independently verifies sender, Controller,
-- calldata, receipt, settlement events, and the token's issuer ownership before confirmation.

USE `trexCapitalMarket`;
SET time_zone = '+00:00';

INSERT INTO `permissionMaster`
  (`permissionUid`,`roleUid`,`menuUid`,`permissionName`,`permissionCode`,`httpMethod`,`apiPath`,
   `isAllowed`,`isActive`,`isDeleted`)
VALUES
  (UUID(),'00000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000009',
   'Confirm issuer redemption transaction','BLOCKCHAIN_TRANSACTION_CONFIRM','POST',
   '/api/v1/investments/transactions/confirm',TRUE,TRUE,FALSE)
ON DUPLICATE KEY UPDATE
  `menuUid`=VALUES(`menuUid`),`permissionName`=VALUES(`permissionName`),
  `permissionCode`=VALUES(`permissionCode`),`isAllowed`=TRUE,`isActive`=TRUE,`isDeleted`=FALSE,
  `updatedAt`=UTC_TIMESTAMP(3);
