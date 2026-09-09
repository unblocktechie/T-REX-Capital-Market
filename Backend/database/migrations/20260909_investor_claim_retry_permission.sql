-- Permission for the investor claim "retry" endpoint (user-triggered targeted reconciliation).
-- Idempotent.

USE `trexCapitalMarket`;
SET time_zone = '+00:00';

INSERT INTO `permissionMaster`
  (`permissionUid`, `roleUid`, `menuUid`, `permissionName`, `permissionCode`, `httpMethod`, `apiPath`)
VALUES
  (UUID(), '00000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000009', 'Retry / reconcile an on-chain investor claim submission', 'INVESTOR_CLAIM_RETRY', 'POST', '/api/v1/investor/claims/:claimId/retry')
ON DUPLICATE KEY UPDATE
  `permissionName` = VALUES(`permissionName`),
  `menuUid` = VALUES(`menuUid`),
  `isAllowed` = TRUE,
  `isActive` = TRUE,
  `isDeleted` = FALSE;

-- Rollback: DELETE FROM `permissionMaster` WHERE `permissionCode` = 'INVESTOR_CLAIM_RETRY';
