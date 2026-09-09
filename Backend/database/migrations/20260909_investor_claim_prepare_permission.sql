-- Permission for the investor claim "prepare" step (phase 1: records a PENDING submission and
-- returns the on-chain params before the MetaMask transaction). Idempotent.

USE `trexCapitalMarket`;
SET time_zone = '+00:00';

INSERT INTO `permissionMaster`
  (`permissionUid`, `roleUid`, `menuUid`, `permissionName`, `permissionCode`, `httpMethod`, `apiPath`)
VALUES
  (UUID(), '00000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000009', 'Prepare an on-chain investor claim submission', 'INVESTOR_CLAIM_PREPARE', 'POST', '/api/v1/investor/claims/:claimId/prepare')
ON DUPLICATE KEY UPDATE
  `permissionName` = VALUES(`permissionName`),
  `menuUid` = VALUES(`menuUid`),
  `isAllowed` = TRUE,
  `isActive` = TRUE,
  `isDeleted` = FALSE;

-- Rollback: DELETE FROM `permissionMaster` WHERE `permissionCode` = 'INVESTOR_CLAIM_PREPARE';
