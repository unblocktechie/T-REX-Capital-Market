-- Apply once to an existing T-REX Capital Market database.
-- Adds the one-revision rejection workflow and removes document-level review status.

USE `trexCapitalMarket`;
SET time_zone = '+00:00';

ALTER TABLE `organizationMaster`
  ADD COLUMN `rejectionReason` TEXT NULL AFTER `submittedAt`,
  ADD COLUMN `rejectionCount` TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER `rejectionReason`,
  ADD COLUMN `canResubmit` BOOLEAN NOT NULL DEFAULT FALSE AFTER `rejectionCount`;

ALTER TABLE `organizationDocument`
  DROP COLUMN `verificationStatus`;

INSERT INTO `permissionMaster`
  (`permissionUid`, `roleUid`, `menuUid`, `permissionName`, `permissionCode`, `httpMethod`, `apiPath`)
VALUES
  (
    UUID(),
    '00000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000006',
    'List submitted organizations',
    'ADMIN_ORG_LIST',
    'GET',
    '/api/v1/admin/organizations'
  ),
  (
    UUID(),
    '00000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000006',
    'View submitted organization',
    'ADMIN_ORG_VIEW',
    'GET',
    '/api/v1/admin/organizations/:organizationUid'
  ),
  (
    UUID(),
    '00000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000006',
    'Review submitted organization',
    'ADMIN_ORG_REVIEW',
    'PATCH',
    '/api/v1/admin/organizations/:organizationUid/status'
  )
ON DUPLICATE KEY UPDATE
  `permissionName` = VALUES(`permissionName`),
  `menuUid` = VALUES(`menuUid`),
  `isAllowed` = TRUE,
  `isActive` = TRUE,
  `isDeleted` = FALSE;
