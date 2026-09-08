-- Apply once to an existing T-REX Capital Market database.
-- Stores the OnchainID identity address and the latest approval transaction result.

USE `trexCapitalMarket`;
SET time_zone = '+00:00';

ALTER TABLE `organizationMaster`
  ADD COLUMN `contractAddress` VARCHAR(42) NULL AFTER `walletAddress`,
  ADD COLUMN `contractTxnHash` VARCHAR(66) NULL AFTER `contractAddress`,
  ADD COLUMN `contractTxnMessage` TEXT NULL AFTER `contractTxnHash`;
