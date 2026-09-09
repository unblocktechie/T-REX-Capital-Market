-- Apply once if tokenMaster was created before frontend transaction receipt verification was added.

USE `trexCapitalMarket`;
SET time_zone = '+00:00';

ALTER TABLE `tokenMaster`
  ADD COLUMN `platformAgentWallet` VARCHAR(42) NULL AFTER `identityManagerWalletAddress`,
  ADD COLUMN `tokenAddress` VARCHAR(42) NULL AFTER `platformAgentWallet`,
  ADD COLUMN `identityRegistryAddress` VARCHAR(42) NULL AFTER `tokenAddress`,
  ADD COLUMN `identityRegistryStorageAddress` VARCHAR(42) NULL AFTER `identityRegistryAddress`,
  ADD COLUMN `trustedIssuersRegistryAddress` VARCHAR(42) NULL AFTER `identityRegistryStorageAddress`,
  ADD COLUMN `claimTopicsRegistryAddress` VARCHAR(42) NULL AFTER `trustedIssuersRegistryAddress`,
  ADD COLUMN `modularComplianceAddress` VARCHAR(42) NULL AFTER `claimTopicsRegistryAddress`,
  ADD COLUMN `deployTxHash` VARCHAR(66) NULL AFTER `modularComplianceAddress`,
  ADD COLUMN `deployedAtBlock` BIGINT UNSIGNED NULL AFTER `deployTxHash`,
  ADD UNIQUE KEY `ukTokenMasterTokenAddress` (`tokenAddress`),
  ADD UNIQUE KEY `ukTokenMasterDeployTxHash` (`deployTxHash`);
