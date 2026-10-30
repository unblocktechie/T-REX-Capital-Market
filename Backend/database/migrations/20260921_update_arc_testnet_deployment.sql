-- Point ARC Testnet at the 2026-09-21 platform deployment.
-- Existing on-chain identities from the retired Identity Factory are deliberately
-- locked so users recreate/recover their chain-scoped ONCHAINID through the unlock API.

USE `trexCapitalMarket`;
SET time_zone = '+00:00';

SET @arcChainId = 5042002;
SET @arcChainUid = (
  SELECT `chainUid` FROM `chainMaster`
  WHERE `chainId` = @arcChainId AND `isDeleted` = FALSE LIMIT 1
);

SET @newIdentityFactory = '0x1182639700b0d7453Fe2fEd5EEE700ca4D9D944b';
SET @newTrexFactory = '0xDcB5B1f7ABdF3aDF76b8C00BdA325cf5801eDdB5';
SET @newPlatformController = '0xE075cbA97869cdc1273d69dDBc0870C131bf902c';
SET @newPaymentToken = '0x3600000000000000000000000000000000000000';
SET @identityFactoryStartBlock = 63261132;
SET @trexFactoryStartBlock = 63261155;
SET @platformControllerStartBlock = 63261231;

SET @oldIdentityFactory = (
  SELECT `identityFactoryAddress` FROM `chainMaster` WHERE `chainUid` = @arcChainUid
);
SET @oldTrexFactory = (
  SELECT `trexFactoryAddress` FROM `chainMaster` WHERE `chainUid` = @arcChainUid
);
SET @oldPlatformController = (
  SELECT `platformControllerAddress` FROM `chainMaster` WHERE `chainUid` = @arcChainUid
);
SET @oldDeploymentStartBlock = (
  SELECT `deploymentStartBlock` FROM `chainMaster` WHERE `chainUid` = @arcChainUid
);
SET @oldClaimIndexerStartBlock = (
  SELECT `claimIndexerStartBlock` FROM `chainMaster` WHERE `chainUid` = @arcChainUid
);
SET @oldRegistryIndexerStartBlock = (
  SELECT `registryIndexerStartBlock` FROM `chainMaster` WHERE `chainUid` = @arcChainUid
);
SET @oldTransactionIndexerStartBlock = (
  SELECT `transactionIndexerStartBlock` FROM `chainMaster` WHERE `chainUid` = @arcChainUid
);

SET @chainConfigurationChanged = IF(
  @arcChainUid IS NOT NULL AND (
    BINARY LOWER(@oldIdentityFactory) <> BINARY LOWER(@newIdentityFactory)
    OR BINARY LOWER(@oldTrexFactory) <> BINARY LOWER(@newTrexFactory)
    OR BINARY LOWER(@oldPlatformController) <> BINARY LOWER(@newPlatformController)
    OR @oldDeploymentStartBlock <> @trexFactoryStartBlock
    OR @oldClaimIndexerStartBlock <> @identityFactoryStartBlock
    OR @oldRegistryIndexerStartBlock <> @trexFactoryStartBlock
    OR @oldTransactionIndexerStartBlock <> @platformControllerStartBlock
  ), TRUE, FALSE
);

SET @auditUserUid = COALESCE(
  (
    SELECT u.`userUid`
    FROM `userMaster` u
    INNER JOIN `userRole` r ON r.`roleUid` = u.`roleUid`
    WHERE r.`roleName` = 'Super Admin' AND u.`isDeleted` = FALSE
    ORDER BY u.`createdAt` LIMIT 1
  ),
  (SELECT `userUid` FROM `userMaster` WHERE `isDeleted` = FALSE ORDER BY `createdAt` LIMIT 1),
  '00000000-0000-4000-8000-000000000000'
);

INSERT INTO `chainMasterAudit`
  (`chainAuditUid`,`chainUid`,`changedByUserUid`,`operation`,`changedFields`,`beforeData`,`afterData`)
SELECT
  UUID(), @arcChainUid, @auditUserUid, 'UPDATE',
  JSON_ARRAY(
    'identityFactoryAddress','trexFactoryAddress','platformControllerAddress',
    'deploymentStartBlock','claimIndexerStartBlock','registryIndexerStartBlock',
    'transactionIndexerStartBlock'
  ),
  JSON_OBJECT(
    'identityFactoryAddress', @oldIdentityFactory,
    'trexFactoryAddress', @oldTrexFactory,
    'platformControllerAddress', @oldPlatformController,
    'deploymentStartBlock', @oldDeploymentStartBlock,
    'claimIndexerStartBlock', @oldClaimIndexerStartBlock,
    'registryIndexerStartBlock', @oldRegistryIndexerStartBlock,
    'transactionIndexerStartBlock', @oldTransactionIndexerStartBlock
  ),
  JSON_OBJECT(
    'identityFactoryAddress', @newIdentityFactory,
    'trexFactoryAddress', @newTrexFactory,
    'platformControllerAddress', @newPlatformController,
    'deploymentStartBlock', @trexFactoryStartBlock,
    'claimIndexerStartBlock', @identityFactoryStartBlock,
    'registryIndexerStartBlock', @trexFactoryStartBlock,
    'transactionIndexerStartBlock', @platformControllerStartBlock,
    'deploymentManifest', 'deployments/arcTestnet.json'
  )
WHERE @chainConfigurationChanged = TRUE;

UPDATE `chainMaster`
SET `identityFactoryAddress` = @newIdentityFactory,
    `trexFactoryAddress` = @newTrexFactory,
    `platformControllerAddress` = @newPlatformController,
    `deploymentStartBlock` = @trexFactoryStartBlock,
    `claimIndexerStartBlock` = @identityFactoryStartBlock,
    `registryIndexerStartBlock` = @trexFactoryStartBlock,
    `transactionIndexerStartBlock` = @platformControllerStartBlock,
    `updatedAt` = UTC_TIMESTAMP(3)
WHERE `chainUid` = @arcChainUid;

-- The ARC payment token did not change, but assert the database linkage and
-- metadata so the new Platform Controller registry intersects with this row.
UPDATE `paymentTokenMaster`
SET `contractAddress` = @newPaymentToken,
    `chainId` = @arcChainId,
    `networkName` = 'arcTestnet',
    `explorerUrl` = 'https://explorer.testnet.arc.io/',
    `isActive` = TRUE,
    `isDeleted` = FALSE,
    `updatedAt` = UTC_TIMESTAMP(3)
WHERE `chainUid` = @arcChainUid AND `paymentTokenCode` = 'USDC';

-- Only undeployed drafts are reassigned. Historical/deployed token agent data is untouched.
UPDATE `tokenMaster`
SET `tokenAgentWalletAddress` = @newPlatformController,
    `updatedAt` = UTC_TIMESTAMP(3)
WHERE `chainUid` = @arcChainUid
  AND `status` = 'draft'
  AND `tokenAddress` IS NULL
  AND BINARY LOWER(`tokenAgentWalletAddress`) <> BINARY LOWER(@newPlatformController);

-- Clear legacy single-chain profile pointers only for profiles whose ARC identity
-- belongs to the retired factory. The unlock API restores them after recreation.
UPDATE `organizationMaster` o
INNER JOIN `userChainIdentity` uci
  ON uci.`userUid` = o.`userUid` AND uci.`chainUid` = @arcChainUid
SET o.`contractAddress` = NULL,
    o.`contractTxnHash` = NULL,
    o.`contractTxnMessage` = 'ARC Identity Factory was redeployed. Unlock ARC Testnet again.',
    o.`updatedAt` = UTC_TIMESTAMP(3)
WHERE o.`onboardingChainUid` = @arcChainUid
  AND BINARY LOWER(uci.`identityFactoryAddress`) <> BINARY LOWER(@newIdentityFactory);

UPDATE `investorMaster` i
INNER JOIN `userChainIdentity` uci
  ON uci.`userUid` = i.`userUid` AND uci.`chainUid` = @arcChainUid
SET i.`contractAddress` = NULL,
    i.`onchainIdReference` = NULL,
    i.`contractTxnHash` = NULL,
    i.`contractTxnMessage` = 'ARC Identity Factory was redeployed. Unlock ARC Testnet again.',
    i.`updatedAt` = UTC_TIMESTAMP(3)
WHERE i.`onboardingChainUid` = @arcChainUid
  AND BINARY LOWER(uci.`identityFactoryAddress`) <> BINARY LOWER(@newIdentityFactory);

UPDATE `userChainIdentity`
SET `identityFactoryAddress` = @newIdentityFactory,
    `identityAddress` = NULL,
    `creationTxHash` = NULL,
    `creationBlockNumber` = NULL,
    `creationBlockHash` = NULL,
    `status` = 'FAILED',
    `isUnlocked` = FALSE,
    `unlockedAt` = NULL,
    `errorCode` = 'IDENTITY_FACTORY_REDEPLOYED',
    `errorMessage` = 'ARC Identity Factory was redeployed. Unlock ARC Testnet again to create or recover the current ONCHAINID.',
    `updatedAt` = UTC_TIMESTAMP(3)
WHERE `chainUid` = @arcChainUid
  AND BINARY LOWER(`identityFactoryAddress`) <> BINARY LOWER(@newIdentityFactory)
  AND `isDeleted` = FALSE;

-- Rewind only ARC checkpoints to the new deployment boundary.
UPDATE `generalSettings`
SET `settingValue` = CAST(@trexFactoryStartBlock - 1 AS CHAR),
    `updatedAt` = UTC_TIMESTAMP(3)
WHERE BINARY `settingKey` = BINARY CONCAT('TrexDeploymentLastSyncBlock.', @arcChainId)
  AND `isDeleted` = FALSE;

UPDATE `blockchainIndexerCheckpoint`
SET `startBlock` = CASE `indexerName`
      WHEN 'investorClaim' THEN @identityFactoryStartBlock
      WHEN 'identityRegistryRegistration' THEN @trexFactoryStartBlock
      WHEN 'canonicalTransactions' THEN @platformControllerStartBlock
      ELSE @identityFactoryStartBlock
    END,
    `lastIndexedBlock` = CASE `indexerName`
      WHEN 'investorClaim' THEN @identityFactoryStartBlock - 1
      WHEN 'identityRegistryRegistration' THEN @trexFactoryStartBlock - 1
      WHEN 'canonicalTransactions' THEN @platformControllerStartBlock - 1
      ELSE @identityFactoryStartBlock - 1
    END,
    `lastIndexedBlockHash` = NULL,
    `leaseOwner` = NULL,
    `leaseExpiresAt` = NULL,
    `lastErrorMessage` = NULL,
    `updatedAt` = UTC_TIMESTAMP(3)
WHERE `chainId` = @arcChainId AND `isDeleted` = FALSE;
