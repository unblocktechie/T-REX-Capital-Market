-- Repair RBAC grants for the canonical transaction confirmation/history APIs.
-- Safe to run after 20260911_add_canonical_blockchain_transactions.sql and safe to rerun.

USE `trexCapitalMarket`;
SET time_zone = '+00:00';

-- Normalize an older permission having the same role/code but an outdated API path.
UPDATE `permissionMaster`
SET `menuUid` = '10000000-0000-4000-8000-000000000009',
    `permissionName` = 'List blockchain transactions',
    `httpMethod` = 'GET',
    `apiPath` = '/api/v1/investments/transactions',
    `isAllowed` = TRUE,
    `isActive` = TRUE,
    `isDeleted` = FALSE,
    `updatedAt` = UTC_TIMESTAMP(3)
WHERE `roleUid` = '00000000-0000-4000-8000-000000000001'
  AND `permissionCode` = 'BLOCKCHAIN_TRANSACTION_LIST';

UPDATE `permissionMaster`
SET `menuUid` = '10000000-0000-4000-8000-000000000009',
    `permissionName` = 'Export blockchain transactions',
    `httpMethod` = 'GET',
    `apiPath` = '/api/v1/investments/transactions/export',
    `isAllowed` = TRUE,
    `isActive` = TRUE,
    `isDeleted` = FALSE,
    `updatedAt` = UTC_TIMESTAMP(3)
WHERE `roleUid` = '00000000-0000-4000-8000-000000000001'
  AND `permissionCode` = 'BLOCKCHAIN_TRANSACTION_EXPORT';

UPDATE `permissionMaster`
SET `menuUid` = '10000000-0000-4000-8000-000000000009',
    `permissionName` = 'List issuer blockchain transactions',
    `httpMethod` = 'GET',
    `apiPath` = '/api/v1/investments/transactions',
    `isAllowed` = TRUE,
    `isActive` = TRUE,
    `isDeleted` = FALSE,
    `updatedAt` = UTC_TIMESTAMP(3)
WHERE `roleUid` = '00000000-0000-4000-8000-000000000003'
  AND `permissionCode` = 'BLOCKCHAIN_TRANSACTION_LIST';

UPDATE `permissionMaster`
SET `menuUid` = '10000000-0000-4000-8000-000000000009',
    `permissionName` = 'Export issuer blockchain transactions',
    `httpMethod` = 'GET',
    `apiPath` = '/api/v1/investments/transactions/export',
    `isAllowed` = TRUE,
    `isActive` = TRUE,
    `isDeleted` = FALSE,
    `updatedAt` = UTC_TIMESTAMP(3)
WHERE `roleUid` = '00000000-0000-4000-8000-000000000003'
  AND `permissionCode` = 'BLOCKCHAIN_TRANSACTION_EXPORT';

UPDATE `permissionMaster`
SET `menuUid` = '10000000-0000-4000-8000-000000000009',
    `permissionName` = 'Confirm wallet blockchain transaction',
    `httpMethod` = 'POST',
    `apiPath` = '/api/v1/investments/transactions/confirm',
    `isAllowed` = TRUE,
    `isActive` = TRUE,
    `isDeleted` = FALSE,
    `updatedAt` = UTC_TIMESTAMP(3)
WHERE `roleUid` = '00000000-0000-4000-8000-000000000004'
  AND `permissionCode` = 'BLOCKCHAIN_TRANSACTION_CONFIRM';

UPDATE `permissionMaster`
SET `menuUid` = '10000000-0000-4000-8000-000000000009',
    `permissionName` = 'List investor blockchain transactions',
    `httpMethod` = 'GET',
    `apiPath` = '/api/v1/investments/transactions',
    `isAllowed` = TRUE,
    `isActive` = TRUE,
    `isDeleted` = FALSE,
    `updatedAt` = UTC_TIMESTAMP(3)
WHERE `roleUid` = '00000000-0000-4000-8000-000000000004'
  AND `permissionCode` = 'BLOCKCHAIN_TRANSACTION_LIST';

UPDATE `permissionMaster`
SET `menuUid` = '10000000-0000-4000-8000-000000000009',
    `permissionName` = 'Export investor blockchain transactions',
    `httpMethod` = 'GET',
    `apiPath` = '/api/v1/investments/transactions/export',
    `isAllowed` = TRUE,
    `isActive` = TRUE,
    `isDeleted` = FALSE,
    `updatedAt` = UTC_TIMESTAMP(3)
WHERE `roleUid` = '00000000-0000-4000-8000-000000000004'
  AND `permissionCode` = 'BLOCKCHAIN_TRANSACTION_EXPORT';

-- Insert grants missing entirely from databases where the application code was deployed before
-- the 20260911 migration was executed.
INSERT INTO `permissionMaster`
  (`permissionUid`,`roleUid`,`menuUid`,`permissionName`,`permissionCode`,`httpMethod`,`apiPath`,
   `isAllowed`,`isActive`,`isDeleted`)
SELECT UUID(), grantRow.`roleUid`, '10000000-0000-4000-8000-000000000009',
       grantRow.`permissionName`, grantRow.`permissionCode`, grantRow.`httpMethod`, grantRow.`apiPath`,
       TRUE, TRUE, FALSE
FROM (
  SELECT '00000000-0000-4000-8000-000000000001' AS `roleUid`,
         'List blockchain transactions' AS `permissionName`,
         'BLOCKCHAIN_TRANSACTION_LIST' AS `permissionCode`, 'GET' AS `httpMethod`,
         '/api/v1/investments/transactions' AS `apiPath`
  UNION ALL
  SELECT '00000000-0000-4000-8000-000000000001', 'Export blockchain transactions',
         'BLOCKCHAIN_TRANSACTION_EXPORT', 'GET', '/api/v1/investments/transactions/export'
  UNION ALL
  SELECT '00000000-0000-4000-8000-000000000003', 'List issuer blockchain transactions',
         'BLOCKCHAIN_TRANSACTION_LIST', 'GET', '/api/v1/investments/transactions'
  UNION ALL
  SELECT '00000000-0000-4000-8000-000000000003', 'Export issuer blockchain transactions',
         'BLOCKCHAIN_TRANSACTION_EXPORT', 'GET', '/api/v1/investments/transactions/export'
  UNION ALL
  SELECT '00000000-0000-4000-8000-000000000004', 'Confirm wallet blockchain transaction',
         'BLOCKCHAIN_TRANSACTION_CONFIRM', 'POST', '/api/v1/investments/transactions/confirm'
  UNION ALL
  SELECT '00000000-0000-4000-8000-000000000004', 'List investor blockchain transactions',
         'BLOCKCHAIN_TRANSACTION_LIST', 'GET', '/api/v1/investments/transactions'
  UNION ALL
  SELECT '00000000-0000-4000-8000-000000000004', 'Export investor blockchain transactions',
         'BLOCKCHAIN_TRANSACTION_EXPORT', 'GET', '/api/v1/investments/transactions/export'
) AS grantRow
WHERE NOT EXISTS (
  SELECT 1
  FROM `permissionMaster` existing
  WHERE existing.`roleUid` = grantRow.`roleUid`
    AND existing.`httpMethod` = grantRow.`httpMethod`
    AND existing.`apiPath` = grantRow.`apiPath`
);
