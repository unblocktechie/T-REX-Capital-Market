-- Adds the Arc Testnet IDFactoryAccessManager supplied after the original
-- contract-suite migration. Safe to rerun: the audit is written only when a value changes.
SET @arcChainUid = (
  SELECT `chainUid`
  FROM `chainMaster`
  WHERE `chainId` = 5042002 AND `isDeleted` = FALSE
  LIMIT 1
);
SET @auditUserUid = '00000000-0000-4000-8000-000000000001';
SET @accessManager = '0x6Eb7C431158c95ac0127CCF307B10050E2F12413';
SET @accessManagerAdmin = '0xDbBdcA99d568B54feaAb6c6D34e8f0093c509859';

INSERT INTO `chainMasterAudit`
  (`chainAuditUid`, `chainUid`, `changedByUserUid`, `operation`, `changedFields`, `beforeData`, `afterData`)
SELECT UUID(), `chainUid`, @auditUserUid, 'UPDATE',
       JSON_ARRAY('idFactoryAccessManagerAddress', 'idFactoryAccessManagerAdminAddress'),
       JSON_OBJECT(
         'idFactoryAccessManagerAddress', `idFactoryAccessManagerAddress`,
         'idFactoryAccessManagerAdminAddress', `idFactoryAccessManagerAdminAddress`
       ),
       JSON_OBJECT(
         'idFactoryAccessManagerAddress', @accessManager,
         'idFactoryAccessManagerAdminAddress', @accessManagerAdmin
       )
FROM `chainMaster`
WHERE `chainUid` = @arcChainUid
  AND (
    COALESCE(LOWER(`idFactoryAccessManagerAddress`), '') <> LOWER(@accessManager)
    OR COALESCE(LOWER(`idFactoryAccessManagerAdminAddress`), '') <> LOWER(@accessManagerAdmin)
  );

UPDATE `chainMaster`
SET `idFactoryAccessManagerAddress` = @accessManager,
    `idFactoryAccessManagerAdminAddress` = @accessManagerAdmin,
    `updatedAt` = UTC_TIMESTAMP(3)
WHERE `chainUid` = @arcChainUid
  AND (
    COALESCE(LOWER(`idFactoryAccessManagerAddress`), '') <> LOWER(@accessManager)
    OR COALESCE(LOWER(`idFactoryAccessManagerAdminAddress`), '') <> LOWER(@accessManagerAdmin)
  );
