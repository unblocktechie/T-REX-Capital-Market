-- Apply once to grant administrators secure organization document file access.

USE `trexCapitalMarket`;
SET time_zone = '+00:00';

INSERT INTO `permissionMaster`
  (`permissionUid`, `roleUid`, `menuUid`, `permissionName`, `permissionCode`, `httpMethod`, `apiPath`)
VALUES
  (
    UUID(),
    '00000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000006',
    'Preview or download organization document',
    'ADMIN_ORG_DOCUMENT_FILE',
    'GET',
    '/api/v1/admin/organizations/:organizationUid/documents/:documentUid/file'
  )
ON DUPLICATE KEY UPDATE
  `permissionName` = VALUES(`permissionName`),
  `menuUid` = VALUES(`menuUid`),
  `isAllowed` = TRUE,
  `isActive` = TRUE,
  `isDeleted` = FALSE;
