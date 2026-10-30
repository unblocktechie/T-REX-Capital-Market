-- Store the complete immutable deployment contract suite per chain and point the
-- built-in Sepolia/ARC rows at the manifests supplied on 2026-09-22.

USE `trexCapitalMarket`;
SET time_zone = '+00:00';

ALTER TABLE `chainMaster`
  ADD COLUMN `contractSuiteDeployedAt` DATETIME(3) NULL AFTER `explorerUrl`,
  ADD COLUMN `trexImplementationAuthorityAddress` VARCHAR(42) NULL AFTER `contractSuiteDeployedAt`,
  ADD COLUMN `trexGatewayAddress` VARCHAR(42) NULL AFTER `trexFactoryAddress`,
  ADD COLUMN `identityImplementationAuthorityAddress` VARCHAR(42) NULL AFTER `trexGatewayAddress`,
  ADD COLUMN `countryRestrictModuleAddress` VARCHAR(42) NULL AFTER `platformControllerAddress`,
  ADD COLUMN `maxBalanceModuleAddress` VARCHAR(42) NULL AFTER `countryRestrictModuleAddress`,
  ADD COLUMN `maxInvestorsModuleAddress` VARCHAR(42) NULL AFTER `maxBalanceModuleAddress`,
  ADD COLUMN `platformControllerOwnerAddress` VARCHAR(42) NULL AFTER `maxInvestorsModuleAddress`,
  ADD COLUMN `idFactoryAccessManagerAddress` VARCHAR(42) NULL AFTER `platformControllerOwnerAddress`,
  ADD COLUMN `idFactoryAccessManagerAdminAddress` VARCHAR(42) NULL AFTER `idFactoryAccessManagerAddress`,
  ADD COLUMN `tokenImplementationAddress` VARCHAR(42) NULL AFTER `idFactoryAccessManagerAdminAddress`,
  ADD COLUMN `claimTopicsRegistryImplementationAddress` VARCHAR(42) NULL AFTER `tokenImplementationAddress`,
  ADD COLUMN `identityRegistryImplementationAddress` VARCHAR(42) NULL AFTER `claimTopicsRegistryImplementationAddress`,
  ADD COLUMN `identityRegistryStorageImplementationAddress` VARCHAR(42) NULL AFTER `identityRegistryImplementationAddress`,
  ADD COLUMN `trustedIssuersRegistryImplementationAddress` VARCHAR(42) NULL AFTER `identityRegistryStorageImplementationAddress`,
  ADD COLUMN `modularComplianceImplementationAddress` VARCHAR(42) NULL AFTER `trustedIssuersRegistryImplementationAddress`,
  ADD COLUMN `identityImplementationAddress` VARCHAR(42) NULL AFTER `modularComplianceImplementationAddress`;

SET @auditUserUid = COALESCE(
  (
    SELECT u.`userUid` FROM `userMaster` u
    INNER JOIN `userRole` r ON r.`roleUid` = u.`roleUid`
    WHERE r.`roleName` = 'Super Admin' AND u.`isDeleted` = FALSE
    ORDER BY u.`createdAt` LIMIT 1
  ),
  (SELECT `userUid` FROM `userMaster` WHERE `isDeleted` = FALSE ORDER BY `createdAt` LIMIT 1),
  '00000000-0000-4000-8000-000000000000'
);

SET @sepoliaChainUid = (SELECT `chainUid` FROM `chainMaster` WHERE `chainId` = 11155111 AND `isDeleted` = FALSE LIMIT 1);
SET @oldSepoliaIdentityFactory = (SELECT `identityFactoryAddress` FROM `chainMaster` WHERE `chainUid` = @sepoliaChainUid);
SET @newSepoliaIdentityFactory = '0x7B0C5924ec21DcD45E1c98c1141Cb0C680Afc947';
SET @newSepoliaController = '0xdf290bA0D8E84632A85FAc0CAE7bEa1Cf9c50556';
SET @newSepoliaTrexFactory = '0x21679403cE4BC1390e390e9B7196e7a325dbD1ea';
SET @sepoliaStartBlock = 11755758;

INSERT INTO `chainMasterAudit`
  (`chainAuditUid`,`chainUid`,`changedByUserUid`,`operation`,`changedFields`,`beforeData`,`afterData`)
SELECT UUID(), @sepoliaChainUid, @auditUserUid, 'UPDATE',
  JSON_ARRAY('contractSuite','identityFactoryAddress','trexFactoryAddress','platformControllerAddress'),
  JSON_OBJECT(
    'identityFactoryAddress', `identityFactoryAddress`,
    'trexFactoryAddress', `trexFactoryAddress`,
    'platformControllerAddress', `platformControllerAddress`
  ),
  JSON_OBJECT('deploymentManifest','deployments/sepolia.json','deployedAt','2026-09-22T05:10:28.254Z')
FROM `chainMaster` WHERE `chainUid` = @sepoliaChainUid;

UPDATE `chainMaster`
SET `contractSuiteDeployedAt` = '2026-09-22 05:10:28.254',
    `trexImplementationAuthorityAddress` = '0xB50555f42401507d5fB882B395AF6d458cFfBb9C',
    `trexFactoryAddress` = @newSepoliaTrexFactory,
    `trexGatewayAddress` = '0x51D42F190F8B4b52013338F44bd7D32B38266A8b',
    `identityImplementationAuthorityAddress` = '0x0ABB6819e90c300B938b16618287656296346E93',
    `identityFactoryAddress` = @newSepoliaIdentityFactory,
    `platformControllerAddress` = @newSepoliaController,
    `countryRestrictModuleAddress` = '0x310586dCF087EbF5Ce22EE5b14c3D121b4Ae0edb',
    `maxBalanceModuleAddress` = '0xd128E07F166628E127ab1931bE3f9Aa198F24F1E',
    `maxInvestorsModuleAddress` = '0x390864C1Cd02BA8fc890f72f34C0fdffeC4A3C46',
    `platformControllerOwnerAddress` = '0xDbBdcA99d568B54feaAb6c6D34e8f0093c509859',
    `idFactoryAccessManagerAddress` = '0x03DF916C6Bbc9396B80fd7583567A6A1D5479846',
    `idFactoryAccessManagerAdminAddress` = '0xDbBdcA99d568B54feaAb6c6D34e8f0093c509859',
    `tokenImplementationAddress` = '0x0B2EeEfe34ADBF9cb412217E2548C6d450E13CdC',
    `claimTopicsRegistryImplementationAddress` = '0x760a3edd8B33CF9eF0D70bd8f9A53bACa2859E12',
    `identityRegistryImplementationAddress` = '0xc6A40dED0D9Dc5ce26358A889176237A79cCD47d',
    `identityRegistryStorageImplementationAddress` = '0x89A89163c26025f93eC1f1079fB3E20c9BAA12dc',
    `trustedIssuersRegistryImplementationAddress` = '0x48eeF537eFcbA6abaDB888E72954AdDc6ccEDAD6',
    `modularComplianceImplementationAddress` = '0x843171E6ad9F631ed8861c7423D47BeD7295921d',
    `identityImplementationAddress` = '0xb18631a4Ef92f181e4f3fe5D0822033F44c4e0AE',
    `deploymentStartBlock` = @sepoliaStartBlock,
    `claimIndexerStartBlock` = @sepoliaStartBlock,
    `registryIndexerStartBlock` = @sepoliaStartBlock,
    `transactionIndexerStartBlock` = @sepoliaStartBlock,
    `updatedAt` = UTC_TIMESTAMP(3)
WHERE `chainUid` = @sepoliaChainUid;

-- Existing deployed tokens retain their historical controller. Only an unfinished
-- draft is moved to the new default controller used for future deployments.
UPDATE `tokenMaster`
SET `tokenAgentWalletAddress` = @newSepoliaController, `updatedAt` = UTC_TIMESTAMP(3)
WHERE `chainUid` = @sepoliaChainUid AND `status` = 'draft' AND `tokenAddress` IS NULL;

UPDATE `organizationMaster` o
INNER JOIN `userChainIdentity` uci ON uci.`userUid` = o.`userUid` AND uci.`chainUid` = @sepoliaChainUid
SET o.`contractAddress` = NULL, o.`contractTxnHash` = NULL,
    o.`contractTxnMessage` = 'Sepolia Identity Factory was redeployed. Unlock Sepolia again.',
    o.`updatedAt` = UTC_TIMESTAMP(3)
WHERE o.`onboardingChainUid` = @sepoliaChainUid
  AND BINARY LOWER(uci.`identityFactoryAddress`) <> BINARY LOWER(@newSepoliaIdentityFactory);

UPDATE `investorMaster` i
INNER JOIN `userChainIdentity` uci ON uci.`userUid` = i.`userUid` AND uci.`chainUid` = @sepoliaChainUid
SET i.`contractAddress` = NULL, i.`onchainIdReference` = NULL, i.`contractTxnHash` = NULL,
    i.`contractTxnMessage` = 'Sepolia Identity Factory was redeployed. Unlock Sepolia again.',
    i.`updatedAt` = UTC_TIMESTAMP(3)
WHERE i.`onboardingChainUid` = @sepoliaChainUid
  AND BINARY LOWER(uci.`identityFactoryAddress`) <> BINARY LOWER(@newSepoliaIdentityFactory);

UPDATE `userChainIdentity`
SET `identityFactoryAddress` = @newSepoliaIdentityFactory, `identityAddress` = NULL,
    `creationTxHash` = NULL, `creationBlockNumber` = NULL, `creationBlockHash` = NULL,
    `status` = 'FAILED', `isUnlocked` = FALSE, `unlockedAt` = NULL,
    `errorCode` = 'IDENTITY_FACTORY_REDEPLOYED',
    `errorMessage` = 'Sepolia Identity Factory was redeployed. Unlock Sepolia again to create or recover the current ONCHAINID.',
    `updatedAt` = UTC_TIMESTAMP(3)
WHERE `chainUid` = @sepoliaChainUid
  AND BINARY LOWER(`identityFactoryAddress`) <> BINARY LOWER(@newSepoliaIdentityFactory)
  AND `isDeleted` = FALSE;

UPDATE `blockchainIndexerCheckpoint`
SET `startBlock` = @sepoliaStartBlock, `lastIndexedBlock` = @sepoliaStartBlock - 1,
    `lastIndexedBlockHash` = NULL, `leaseOwner` = NULL, `leaseExpiresAt` = NULL,
    `lastErrorMessage` = NULL, `updatedAt` = UTC_TIMESTAMP(3)
WHERE `chainId` = 11155111 AND `isDeleted` = FALSE;

UPDATE `generalSettings`
SET `settingValue` = CAST(@sepoliaStartBlock - 1 AS CHAR), `updatedAt` = UTC_TIMESTAMP(3)
WHERE BINARY `settingKey` = BINARY 'TrexDeploymentLastSyncBlock.11155111' AND `isDeleted` = FALSE;

SET @arcChainUid = (SELECT `chainUid` FROM `chainMaster` WHERE `chainId` = 5042002 AND `isDeleted` = FALSE LIMIT 1);

INSERT INTO `chainMasterAudit`
  (`chainAuditUid`,`chainUid`,`changedByUserUid`,`operation`,`changedFields`,`beforeData`,`afterData`)
SELECT UUID(), @arcChainUid, @auditUserUid, 'UPDATE', JSON_ARRAY('contractSuite'),
  JSON_OBJECT('identityFactoryAddress', `identityFactoryAddress`),
  JSON_OBJECT('deploymentManifest','deployments/arcTestnet.json','deployedAt','2026-09-21T13:27:31.528Z')
FROM `chainMaster` WHERE `chainUid` = @arcChainUid;

UPDATE `chainMaster`
SET `contractSuiteDeployedAt` = '2026-09-21 13:27:31.528',
    `trexImplementationAuthorityAddress` = '0xCc527481F11B1AF1f131Ac267b0a3863B5882fC2',
    `trexFactoryAddress` = '0xDcB5B1f7ABdF3aDF76b8C00BdA325cf5801eDdB5',
    `trexGatewayAddress` = '0xD37c777cDBd95464B5E132448bdf9A149825999a',
    `identityImplementationAuthorityAddress` = '0x56E460d45cda7194906aF4F03d70810D15a4FBe0',
    `identityFactoryAddress` = '0x1182639700b0d7453Fe2fEd5EEE700ca4D9D944b',
    `platformControllerAddress` = '0xE075cbA97869cdc1273d69dDBc0870C131bf902c',
    `countryRestrictModuleAddress` = '0x2309106D197fF5D79b8A763F780d2e64DCdbedf6',
    `maxBalanceModuleAddress` = '0x92A1e4c8448A0bCa7E7412f3365825B9B6C7A806',
    `maxInvestorsModuleAddress` = '0x6D343035cd7f02e6384053B0D3CE8f0C7B564F02',
    `platformControllerOwnerAddress` = '0xDbBdcA99d568B54feaAb6c6D34e8f0093c509859',
    `idFactoryAccessManagerAddress` = '0x6Eb7C431158c95ac0127CCF307B10050E2F12413',
    `idFactoryAccessManagerAdminAddress` = '0xDbBdcA99d568B54feaAb6c6D34e8f0093c509859',
    `tokenImplementationAddress` = '0x45747f7068CE9C743b82ec3E8E92627b495860A6',
    `claimTopicsRegistryImplementationAddress` = '0xbB8568c6c917264197Bf38d405468279D44d8124',
    `identityRegistryImplementationAddress` = '0xFa45d0489e0F5E33Bc5c1333976250108e93Dc6F',
    `identityRegistryStorageImplementationAddress` = '0x17FB63579dB0875c15D81bf5f143C736071f3B26',
    `trustedIssuersRegistryImplementationAddress` = '0x7855fb131aCD28ff5A17b3D7EaDC95Eeef54F925',
    `modularComplianceImplementationAddress` = '0xF5D3F29B57f2fd33aDbF5d6A5F5C774C07D18fDf',
    `identityImplementationAddress` = '0xa729d37329Bc0F513d5E50d200ec9cf06a80064F',
    `updatedAt` = UTC_TIMESTAMP(3)
WHERE `chainUid` = @arcChainUid;

-- Make both Sepolia controller-listed payment tokens active and select the first
-- manifest entry as the chain default. ARC retains its existing USDC row.
UPDATE `paymentTokenMaster`
SET `isDefault` = FALSE, `isActive` = TRUE, `isDeleted` = FALSE, `updatedAt` = UTC_TIMESTAMP(3)
WHERE `chainUid` = @sepoliaChainUid;
UPDATE `paymentTokenMaster`
SET `isDefault` = TRUE, `updatedAt` = UTC_TIMESTAMP(3)
WHERE `chainUid` = @sepoliaChainUid
  AND BINARY LOWER(`contractAddress`) = BINARY LOWER('0x86B14D29A59b745bF08c42661322d13142d5eb49');
