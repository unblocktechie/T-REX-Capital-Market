-- Database-backed multi-chain configuration, per-user/per-chain ONCHAINID identities,
-- chain-scoped token/payment-token relationships, and admin APIs.
-- MySQL 8+, camelCase columns, UTC timestamps, soft relationships (no foreign keys).

USE `trexCapitalMarket`;
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS `chainMaster` (
  `chainUid` CHAR(36) NOT NULL,
  `chainCode` VARCHAR(40) NOT NULL,
  `chainName` VARCHAR(100) NOT NULL,
  `chainId` BIGINT UNSIGNED NOT NULL,
  `networkName` VARCHAR(80) NOT NULL,
  `nativeCurrencyName` VARCHAR(50) NOT NULL,
  `nativeCurrencySymbol` VARCHAR(12) NOT NULL,
  `nativeCurrencyDecimals` TINYINT UNSIGNED NOT NULL DEFAULT 18,
  `rpcUrl` VARCHAR(1000) NOT NULL,
  `fallbackRpcUrls` JSON NULL,
  `publicRpcUrl` VARCHAR(1000) NULL,
  `explorerUrl` VARCHAR(500) NULL,
  `identityFactoryAddress` VARCHAR(42) NOT NULL,
  `platformControllerAddress` VARCHAR(42) NOT NULL,
  `trexFactoryAddress` VARCHAR(42) NOT NULL,
  `deployerAddress` VARCHAR(42) NULL,
  `deployerPrivateKeyEncrypted` TEXT NULL,
  `confirmations` INT UNSIGNED NOT NULL DEFAULT 2,
  `registryConfirmations` INT UNSIGNED NOT NULL DEFAULT 2,
  `transactionTimeoutMs` INT UNSIGNED NOT NULL DEFAULT 120000,
  `deploymentStartBlock` BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `claimIndexerStartBlock` BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `registryIndexerStartBlock` BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `transactionIndexerStartBlock` BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `registryRecoveryLookbackBlocks` BIGINT UNSIGNED NOT NULL DEFAULT 200000,
  `registryRecoveryBlockOffset` INT UNSIGNED NOT NULL DEFAULT 20000,
  `reconcileBlockOffset` INT UNSIGNED NOT NULL DEFAULT 9000,
  `reconcileMaxLookbackBlocks` BIGINT UNSIGNED NOT NULL DEFAULT 1000000,
  `deploymentAttemptTtlMinutes` INT UNSIGNED NOT NULL DEFAULT 20,
  `delegationManagerAddresses` JSON NULL,
  `indexersEnabled` BOOLEAN NOT NULL DEFAULT TRUE,
  `isTestnet` BOOLEAN NOT NULL DEFAULT FALSE,
  `isDefault` BOOLEAN NOT NULL DEFAULT FALSE,
  `displayOrder` INT UNSIGNED NOT NULL DEFAULT 0,
  `isActive` BOOLEAN NOT NULL DEFAULT TRUE,
  `isDeleted` BOOLEAN NOT NULL DEFAULT FALSE,
  `defaultSlot` TINYINT UNSIGNED GENERATED ALWAYS AS (
    CASE WHEN `isDefault` = TRUE AND `isActive` = TRUE AND `isDeleted` = FALSE THEN 1 ELSE NULL END
  ) STORED,
  `createdAt` DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`chainUid`),
  UNIQUE KEY `ukChainMasterCode` (`chainCode`),
  UNIQUE KEY `ukChainMasterChainId` (`chainId`),
  UNIQUE KEY `ukChainMasterDefault` (`defaultSlot`),
  KEY `idxChainMasterActive` (`isActive`,`isDeleted`,`isDefault`,`displayOrder`)
) ENGINE=InnoDB;

-- The signer key is intentionally not inserted by SQL. Run `npm run chain:bootstrap`
-- once with CHAIN_SECRET_ENCRYPTION_KEY and the legacy DEPLOYER_PRIVATE_KEY available.
INSERT INTO `chainMaster`
  (`chainUid`,`chainCode`,`chainName`,`chainId`,`networkName`,`nativeCurrencyName`,
   `nativeCurrencySymbol`,`nativeCurrencyDecimals`,`rpcUrl`,`fallbackRpcUrls`,`publicRpcUrl`,
   `explorerUrl`,`identityFactoryAddress`,`platformControllerAddress`,`trexFactoryAddress`,
   `deployerAddress`,`confirmations`,`registryConfirmations`,`delegationManagerAddresses`,
   `isTestnet`,`isDefault`,`displayOrder`)
VALUES
  ('60000000-0000-4000-8000-000000000001','SEPOLIA','Ethereum Sepolia',11155111,'sepolia',
   'Sepolia Ether','ETH',18,'https://ethereum-sepolia-rpc.publicnode.com',
   JSON_ARRAY('https://sepolia.gateway.tenderly.co'),'https://ethereum-sepolia-rpc.publicnode.com',
   'https://sepolia.etherscan.io','0xe1da45b88C9d3f4347A6E1C6e8ee63e360068a15',
   '0x4052D80c222111234b89AFDfff597B5De8DA50cd','0xe221247C52ece62027eb7D01D0f522d7363Fe875',
   '0xDbBdcA99d568B54feaAb6c6D34e8f0093c509859',2,2,
   JSON_ARRAY('0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3'),TRUE,TRUE,10)
ON DUPLICATE KEY UPDATE
  `chainName`=VALUES(`chainName`),`networkName`=VALUES(`networkName`),
  `identityFactoryAddress`=VALUES(`identityFactoryAddress`),
  `platformControllerAddress`=VALUES(`platformControllerAddress`),
  `trexFactoryAddress`=VALUES(`trexFactoryAddress`),`deployerAddress`=VALUES(`deployerAddress`),
  `isActive`=TRUE,`isDeleted`=FALSE;

ALTER TABLE `paymentTokenMaster`
  ADD COLUMN `chainUid` CHAR(36) NULL AFTER `paymentTokenUid`;

UPDATE `paymentTokenMaster`
SET `chainUid` = '60000000-0000-4000-8000-000000000001'
WHERE `chainId` = 11155111 AND `chainUid` IS NULL;

ALTER TABLE `paymentTokenMaster`
  MODIFY COLUMN `chainUid` CHAR(36) NOT NULL,
  ADD COLUMN `defaultChainUid` CHAR(36) GENERATED ALWAYS AS (
    CASE WHEN `isDefault` = TRUE AND `isActive` = TRUE AND `isDeleted` = FALSE THEN `chainUid` ELSE NULL END
  ) STORED,
  DROP INDEX `ukPaymentTokenCode`,
  ADD UNIQUE KEY `ukPaymentTokenChainCode` (`chainUid`,`paymentTokenCode`),
  ADD UNIQUE KEY `ukPaymentTokenDefaultPerChain` (`defaultChainUid`),
  ADD KEY `idxPaymentTokenChainUid` (`chainUid`,`isActive`,`isDeleted`,`displayOrder`);

ALTER TABLE `tokenMaster`
  ADD COLUMN `chainUid` CHAR(36) NULL AFTER `userUid`;

UPDATE `tokenMaster`
SET `chainUid` = '60000000-0000-4000-8000-000000000001'
WHERE `chainUid` IS NULL;

ALTER TABLE `tokenMaster`
  MODIFY COLUMN `chainUid` CHAR(36) NOT NULL,
  DROP INDEX `ukTokenMasterSymbol`,
  DROP INDEX `ukTokenMasterTokenAddress`,
  DROP INDEX `ukTokenMasterDeployTxHash`,
  ADD UNIQUE KEY `ukTokenMasterChainSymbol` (`chainUid`,`tokenSymbol`),
  ADD UNIQUE KEY `ukTokenMasterChainAddress` (`chainUid`,`tokenAddress`),
  ADD UNIQUE KEY `ukTokenMasterChainDeployTxHash` (`chainUid`,`deployTxHash`),
  ADD KEY `idxTokenMasterChain` (`chainUid`,`status`,`isActive`,`isDeleted`);

ALTER TABLE `tokenDeploymentAttempt`
  ADD COLUMN `chainUid` CHAR(36) NULL AFTER `userUid`;
UPDATE `tokenDeploymentAttempt`
SET `chainUid` = '60000000-0000-4000-8000-000000000001'
WHERE `chainId` = 11155111 AND `chainUid` IS NULL;
ALTER TABLE `tokenDeploymentAttempt`
  MODIFY COLUMN `chainUid` CHAR(36) NOT NULL,
  DROP INDEX `ukTokenDeploymentAttemptTxHash`,
  ADD UNIQUE KEY `ukTokenDeploymentAttemptChainTxHash` (`chainUid`,`transactionHash`),
  ADD KEY `idxTokenDeploymentAttemptChain` (`chainUid`,`status`,`isDeleted`);

ALTER TABLE `identityRegistryRegistration`
  ADD COLUMN `chainUid` CHAR(36) NULL AFTER `issuerUserUid`;
UPDATE `identityRegistryRegistration`
SET `chainUid` = '60000000-0000-4000-8000-000000000001'
WHERE `chainId` = 11155111 AND `chainUid` IS NULL;
ALTER TABLE `identityRegistryRegistration`
  MODIFY COLUMN `chainUid` CHAR(36) NOT NULL,
  DROP INDEX `ukIdentityRegistryRegistrationTxHash`,
  ADD UNIQUE KEY `ukIdentityRegistryRegistrationChainTxHash` (`chainId`,`txHash`),
  ADD KEY `idxIdentityRegistryRegistrationChainUid` (`chainUid`,`status`,`isDeleted`);

ALTER TABLE `blockchainTransaction`
  ADD COLUMN `chainUid` CHAR(36) NULL AFTER `transactionUid`;
UPDATE `blockchainTransaction`
SET `chainUid` = '60000000-0000-4000-8000-000000000001'
WHERE `chainId` = 11155111 AND `chainUid` IS NULL;
ALTER TABLE `blockchainTransaction`
  MODIFY COLUMN `chainUid` CHAR(36) NOT NULL,
  ADD KEY `idxBlockchainTransactionChainUid` (`chainUid`,`status`,`blockNumber`);

ALTER TABLE `investorClaimSubmission`
  ADD COLUMN `chainUid` CHAR(36) NULL AFTER `organizationUid`,
  ADD COLUMN `chainId` BIGINT UNSIGNED NULL AFTER `chainUid`;
UPDATE `investorClaimSubmission` cs
INNER JOIN `tokenMaster` t ON t.`tokenUid` = cs.`tokenUid`
INNER JOIN `chainMaster` c ON c.`chainUid` = t.`chainUid`
SET cs.`chainUid` = t.`chainUid`, cs.`chainId` = c.`chainId`
WHERE cs.`chainUid` IS NULL OR cs.`chainId` IS NULL;
ALTER TABLE `investorClaimSubmission`
  MODIFY COLUMN `chainUid` CHAR(36) NOT NULL,
  MODIFY COLUMN `chainId` BIGINT UNSIGNED NOT NULL,
  ADD KEY `idxInvestorClaimSubmissionChain` (`chainId`,`status`,`syncStatus`,`isDeleted`);

ALTER TABLE `organizationMaster`
  ADD COLUMN `onboardingChainUid` CHAR(36) NULL AFTER `walletAddress`;
UPDATE `organizationMaster`
SET `onboardingChainUid` = '60000000-0000-4000-8000-000000000001'
WHERE `contractAddress` IS NOT NULL AND `onboardingChainUid` IS NULL;

ALTER TABLE `investorMaster`
  ADD COLUMN `onboardingChainUid` CHAR(36) NULL AFTER `walletAddress`;
UPDATE `investorMaster`
SET `onboardingChainUid` = '60000000-0000-4000-8000-000000000001'
WHERE `contractAddress` IS NOT NULL AND `onboardingChainUid` IS NULL;

CREATE TABLE IF NOT EXISTS `userChainIdentity` (
  `userChainIdentityUid` CHAR(36) NOT NULL,
  `userUid` CHAR(36) NOT NULL,
  `chainUid` CHAR(36) NOT NULL,
  `roleName` ENUM('Issuer','Investor') NOT NULL,
  `walletAddress` VARCHAR(42) NOT NULL,
  `identityAddress` VARCHAR(42) NULL,
  `identityFactoryAddress` VARCHAR(42) NOT NULL,
  `creationTxHash` VARCHAR(66) NULL,
  `creationBlockNumber` BIGINT UNSIGNED NULL,
  `creationBlockHash` VARCHAR(66) NULL,
  `status` ENUM('CREATING','CREATED','FAILED') NOT NULL DEFAULT 'CREATING',
  `isUnlocked` BOOLEAN NOT NULL DEFAULT FALSE,
  `unlockedAt` DATETIME(3) NULL,
  `errorCode` VARCHAR(100) NULL,
  `errorMessage` VARCHAR(2000) NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT TRUE,
  `isDeleted` BOOLEAN NOT NULL DEFAULT FALSE,
  `createdAt` DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`userChainIdentityUid`),
  UNIQUE KEY `ukUserChainIdentityUserChain` (`userUid`,`chainUid`),
  UNIQUE KEY `ukUserChainIdentityWallet` (`chainUid`,`walletAddress`),
  UNIQUE KEY `ukUserChainIdentityAddress` (`chainUid`,`identityAddress`),
  UNIQUE KEY `ukUserChainIdentityTxHash` (`chainUid`,`creationTxHash`),
  KEY `idxUserChainIdentityStatus` (`chainUid`,`status`,`isUnlocked`,`isDeleted`)
) ENGINE=InnoDB;

-- Backfill the current single-chain identities so existing onboarding remains unlocked.
INSERT INTO `userChainIdentity`
  (`userChainIdentityUid`,`userUid`,`chainUid`,`roleName`,`walletAddress`,`identityAddress`,
   `identityFactoryAddress`,`creationTxHash`,`status`,`isUnlocked`,`unlockedAt`)
SELECT UUID(),o.`userUid`,'60000000-0000-4000-8000-000000000001','Issuer',o.`walletAddress`,
       o.`contractAddress`,'0xe1da45b88C9d3f4347A6E1C6e8ee63e360068a15',o.`contractTxnHash`,
       'CREATED',TRUE,COALESCE(o.`updatedAt`,UTC_TIMESTAMP(3))
FROM `organizationMaster` o
WHERE o.`walletAddress` IS NOT NULL AND o.`contractAddress` IS NOT NULL AND o.`isDeleted` = 0
ON DUPLICATE KEY UPDATE `identityAddress`=VALUES(`identityAddress`),`status`='CREATED',
  `isUnlocked`=TRUE,`isDeleted`=FALSE;

INSERT INTO `userChainIdentity`
  (`userChainIdentityUid`,`userUid`,`chainUid`,`roleName`,`walletAddress`,`identityAddress`,
   `identityFactoryAddress`,`creationTxHash`,`status`,`isUnlocked`,`unlockedAt`)
SELECT UUID(),i.`userUid`,'60000000-0000-4000-8000-000000000001','Investor',i.`walletAddress`,
       i.`contractAddress`,'0xe1da45b88C9d3f4347A6E1C6e8ee63e360068a15',i.`contractTxnHash`,
       'CREATED',TRUE,COALESCE(i.`updatedAt`,UTC_TIMESTAMP(3))
FROM `investorMaster` i
WHERE i.`walletAddress` IS NOT NULL AND i.`contractAddress` IS NOT NULL AND i.`isDeleted` = 0
ON DUPLICATE KEY UPDATE `identityAddress`=VALUES(`identityAddress`),`status`='CREATED',
  `isUnlocked`=TRUE,`isDeleted`=FALSE;

INSERT INTO `permissionMaster`
  (`permissionUid`,`roleUid`,`menuUid`,`permissionName`,`permissionCode`,`httpMethod`,`apiPath`)
VALUES
  (UUID(),'00000000-0000-4000-8000-000000000001',NULL,'List chain configurations','CHAIN_ADMIN_LIST','GET','/api/v1/admin/chains'),
  (UUID(),'00000000-0000-4000-8000-000000000001',NULL,'Create chain configuration','CHAIN_ADMIN_CREATE','POST','/api/v1/admin/chains'),
  (UUID(),'00000000-0000-4000-8000-000000000001',NULL,'View chain configuration','CHAIN_ADMIN_GET','GET','/api/v1/admin/chains/:chainUid'),
  (UUID(),'00000000-0000-4000-8000-000000000001',NULL,'Update chain configuration','CHAIN_ADMIN_UPDATE','PATCH','/api/v1/admin/chains/:chainUid'),
  (UUID(),'00000000-0000-4000-8000-000000000001',NULL,'Delete chain configuration','CHAIN_ADMIN_DELETE','DELETE','/api/v1/admin/chains/:chainUid'),
  (UUID(),'00000000-0000-4000-8000-000000000001',NULL,'List payment tokens','PAYMENT_TOKEN_ADMIN_LIST','GET','/api/v1/admin/payment-tokens'),
  (UUID(),'00000000-0000-4000-8000-000000000001',NULL,'Create payment token','PAYMENT_TOKEN_ADMIN_CREATE','POST','/api/v1/admin/payment-tokens'),
  (UUID(),'00000000-0000-4000-8000-000000000001',NULL,'View payment token','PAYMENT_TOKEN_ADMIN_GET','GET','/api/v1/admin/payment-tokens/:paymentTokenUid'),
  (UUID(),'00000000-0000-4000-8000-000000000001',NULL,'Update payment token','PAYMENT_TOKEN_ADMIN_UPDATE','PATCH','/api/v1/admin/payment-tokens/:paymentTokenUid'),
  (UUID(),'00000000-0000-4000-8000-000000000001',NULL,'Delete payment token','PAYMENT_TOKEN_ADMIN_DELETE','DELETE','/api/v1/admin/payment-tokens/:paymentTokenUid'),
  (UUID(),'00000000-0000-4000-8000-000000000003',NULL,'View issuer chain access','CHAIN_ACCESS_LIST','GET','/api/v1/chains/me'),
  (UUID(),'00000000-0000-4000-8000-000000000003',NULL,'Unlock issuer chain','CHAIN_ACCESS_UNLOCK','POST','/api/v1/chains/:chainUid/unlock'),
  (UUID(),'00000000-0000-4000-8000-000000000004',NULL,'View investor chain access','CHAIN_ACCESS_LIST','GET','/api/v1/chains/me'),
  (UUID(),'00000000-0000-4000-8000-000000000004',NULL,'Unlock investor chain','CHAIN_ACCESS_UNLOCK','POST','/api/v1/chains/:chainUid/unlock')
ON DUPLICATE KEY UPDATE `permissionName`=VALUES(`permissionName`),`isAllowed`=TRUE,
  `isActive`=TRUE,`isDeleted`=FALSE;
