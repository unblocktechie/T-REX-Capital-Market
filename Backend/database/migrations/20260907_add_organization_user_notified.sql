-- Apply once to an existing T-REX Capital Market database.
-- Fresh installations receive the same column and permission from database/trex-capital-market.sql.

USE `trexCapitalMarket`;
SET time_zone = '+00:00';

ALTER TABLE `organizationMaster`
  ADD COLUMN `isUserNotified` BOOLEAN NOT NULL DEFAULT FALSE AFTER `submittedAt`;

INSERT INTO `permissionMaster`
  (`permissionUid`, `roleUid`, `menuUid`, `permissionName`, `permissionCode`, `httpMethod`, `apiPath`)
VALUES
  (
    UUID(),
    '00000000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000006',
    'Mark organization user notified',
    'ORG_MARK_USER_NOTIFIED',
    'PATCH',
    '/api/v1/organizations/me/user-notified'
  )
ON DUPLICATE KEY UPDATE
  `permissionName` = VALUES(`permissionName`),
  `menuUid` = VALUES(`menuUid`),
  `isAllowed` = TRUE,
  `isActive` = TRUE,
  `isDeleted` = FALSE;
